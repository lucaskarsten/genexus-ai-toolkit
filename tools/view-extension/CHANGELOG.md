# Changelog

## [0.1.0] — 2026-06-15

### Added
- Syntax highlighting for `.view` files: `<Definition>` block (XML), embedded `<Script>` (JavaScript), `<style>` (CSS), HTML template tail, `{{Mustache}}` placeholders
- Linting with 10 rules (GXV001–GXV010) enforcing GeneXus 18 UC Laws:
  - GXV001 (Error): `<Definition>` must have `auto="false"`
  - GXV002 (Warning): `ucid` Property must be declared
  - GXV003 (Warning): AfterShow `<Script>` required when HTML is present
  - GXV004 (Warning): AfterShow body must include a re-init guard
  - GXV005 (Error): `<script>` in HTML template never executes in GeneXus
  - GXV006 (Warning): ES6 syntax (`let`, `const`, `=>`) not supported in GX18
  - GXV007 (Warning): `innerHTML` without `esc()` or `gx.dom.encode()`
  - GXV008 (Info): `{{Mustache}}` references undeclared Property
  - GXV009 (Info): CSS classes with no consistent BEM prefix
  - GXV010 (Warning): Long content placed in an HTML attribute
- Autocomplete: Property/Event/Script snippets, `Type=` enum values, `gx.*` API members, `this.*` from declared Properties, `{{PropertyName}}` mustache completions
- Content-based dialect detection — linting silently skips WBC files (event code dialect)
- `ViewEnricher` seam for future nexa/gxnext KB integration
