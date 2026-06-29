# gx18-mcp — Performance Diagnosis & N+1 Patterns

Reference for diagnosing slow GeneXus 18 web panels. Covers the N+1 round-trip anti-pattern,
the diagnosis methodology that actually finds it, common false leads, and the in-session cache fix.

---

## The N+1 Round-Trip Anti-Pattern

**Pattern:** an outer `For Each` cursor iterates N rows and, for each row, calls a helper procedure
that issues one or more DB round-trips. Total round-trips = N × (round-trips per row).

```genexus
// Anti-pattern — N×M round-trips serialized
For Each <OuterTable>
    &Flag = PrcHelperFlagCheck.Udp(&Id)   // 1-3 queries per row = N×3 total
    &Collection.Add(...)
EndFor
```

When N is small (1–5) this is invisible. When N is large (hundreds or thousands), and the DB
connection uses **encrypted transport** (e.g. Oracle NNE, TLS), each round-trip carries
encrypt + network + decrypt overhead — the sum dominates TTFB.

**Why it hides:** the helper procedure is fast individually (cheap index scan, low cost). The
problem is the **count** of round-trips, not the SQL quality. EXPLAIN PLAN on the per-row
query will show low cost and a good index — and still be the bottleneck.

**Why master-page components are the worst offenders:** a header or navigation component runs
on **every page load** for every user. An N+1 pattern there multiplies across the entire
application, not just one screen.

---

## How to Diagnose

### Step 1 — Live thread dumps (jstack)

Take 3–5 thread dumps of the Tomcat JVM while a slow request is in-flight:

```bash
jstack <tomcat_pid> > dump1.txt
# wait 500ms
jstack <tomcat_pid> > dump2.txt
# repeat
```

**What to look for:** a thread in state `RUNNABLE` on `SocketDispatcher.read0` (or equivalent
native socket read) across **multiple dumps**. RUNNABLE + socket read = waiting on the DB, not
computing.

**The N+1 signature in the stack trace:**

```
java.net.SocketInputStream.read0(Native Method)   ← waiting on DB
  ← ForEachCursor.fetchNext(...)
  ← helperproc.execute(...)                        ← per-row call
  ← outerproc:NN (inside the For Each)             ← the loop
  ← masterpage.refresh(...)
  ← webpanel.webExecute(...)
```

If the same `helperproc` frame appears on the hot thread in every dump, that procedure is
serializing DB wait time in a loop.

### Step 2 — EXPLAIN PLAN on the per-row query

Run `EXPLAIN PLAN` (Oracle) or check the execution plan on the query inside the helper procedure.

**Expected finding:** low cost, INDEX RANGE SCAN or INDEX UNIQUE SCAN — the query itself is fine.

This proves the cost is the **count** of round-trips, not the SQL. Fixing the SQL (adding indexes,
rewriting WHERE clauses) will not help.

### Step 3 — Count the N

```sql
-- How many rows does the outer cursor produce for a given user/context?
SELECT COUNT(*) FROM <OuterTable> WHERE <filter conditions>
```

Multiply by the number of queries in the helper procedure. That is your round-trip budget per page load.

### Step 4 — Correlate with TTFB

Measure TTFB with `curl` on loopback (eliminates network):

```bash
curl -s -o /dev/null -w "ttfb=%{time_starttransfer}s\n" \
  -H "Cookie: <session_cookie>" \
  "http://localhost:8080/<app>/servlet/<webpanel>"
```

If TTFB ≈ N × (per-round-trip latency), N+1 is confirmed.

---

## False Leads — Measure After Each Fix

Two categories of fix that look promising on the call stack but do not reduce TTFB:

### 1. Sorting an already-sorted collection

An O(n²) `.Sort()` call on a collection that the underlying procedure already returns in order
shows up as a long frame on the same hot line as the real problem. It is a real cost — but
small relative to N×(DB latency). Removing it improves CPU time, not TTFB.

**Lesson:** after applying the sort fix, measure TTFB before declaring victory.

### 2. Rewriting the per-row SQL (COUNT → existence check)

Replacing `COUNT(*)` with a `For Each ... When None` (rownum ≤ 1) pattern in the helper
procedure reduces work inside the query — but does not change N. If the helper still runs
once per outer row, TTFB is unchanged.

**Lesson:** "cheaper SQL per row" is not the same as "fewer rows." The fix must reduce N or
eliminate the per-row call entirely.

### General rule

> A frame on the hot line is not necessarily the dominant cost.  
> Always re-measure TTFB after each change before assuming it is fixed.

---

## The In-Session Cache Fix

**Goal:** eliminate redundant computation for the same key within a single user session, without
touching any caller.

**Pattern:** add a WebSession cache gate at the top of the helper procedure. On first call for
a given key: compute normally and store the result. On subsequent calls with the same key:
return immediately from cache.

```genexus
// Inside the helper procedure — cache gate (pseudocode)
&CacheKey = !"prefix_" + Trim(Str(&InputId, 9, 0))
&CachedVal = &WebSession.Get(&CacheKey)
If &CachedVal <> ''
    &Output = Domain.Convert(&CachedVal)
    Return
EndIf

// ... normal computation ...

&CachedVal = &Output    // implicit domain → VarChar conversion
&WebSession.Set(&CacheKey, &CachedVal)
```

**Why this approach:**
- Zero callers modified — the fix is self-contained in the helper procedure.
- One change resolves the issue for all callers simultaneously (master pages, grids, reports).
- No schema changes, no new objects.

**Syntax pitfalls and the full cache code pattern** are documented at:

→ **`gx18://docs/write-safety`** (see "WebSession cache" section)

Key pitfalls to avoid (summary only — see link for detail):
- `&CacheKey` must be declared as `VarChar` (or forced via `PadR`) — if GX infers `Character(N)`
  it truncates the key and all entries collide on the same slot.
- Use `Domain.Convert(&CachedVal)` to assign a VarChar back to a domain variable.
- Do NOT call `.IsEmpty()` on an auto-inferred `Character` variable — use `<> ''`.
- Do NOT use `.ToString()` on a domain variable inside `&WebSession.Set()` — assign to a
  `VarChar` first.

---

## Trade-offs

| Concern | Detail |
|---------|--------|
| **Stale data** | Cache never expires within a session. If the underlying flag changes during a user session, they see the old value until logout. Acceptable when the flag changes rarely (e.g. a structural classification that changes through an admin UI). |
| **First-load cost** | Cache only eliminates *repeated* computation. If every key in the outer cursor is distinct, the first load still makes N calls. Cache helps most when the same key recurs across multiple rows or page loads. |
| **Session memory** | Each cached key consumes a WebSession slot. For very large N (thousands of distinct keys per session), evaluate whether the session store can hold them all. |
| **Scope** | WebSession cache is per-user, per-session. It does not share state across users or survive logout. For cross-user sharing, consider a shared in-memory store or a pre-computed table. |

---

## Checklist: Confirming an N+1 Fix

- [ ] Thread dump shows the helper procedure is no longer on the hot thread during the slow request.
- [ ] `curl` loopback TTFB measurement shows a significant reduction (not just noise).
- [ ] TTFB scales sub-linearly with N for a power user (not proportionally as before).
- [ ] No regressions: pages that call the helper from a single-row context still return correct data.
- [ ] Cache key collisions verified: run with two distinct input IDs in the same session and confirm
      both return their correct values independently.
