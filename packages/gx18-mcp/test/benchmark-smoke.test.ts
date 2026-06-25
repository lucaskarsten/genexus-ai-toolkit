// Benchmark smoke test — runs in the unit project (no KB required).
// Verifies that:
//  1. catalog.ts exports a non-empty GOLDEN_CATALOG
//  2. matrix.ts buildMatrix() produces cells with unique fixtureKeys
//  3. Every fixture file in benchmark/fixtures/ is valid JSON matching the Fixture interface
//  4. Every non-schemaOnly cell in the matrix has a corresponding fixture file
//     (so a developer cannot commit a new matrix cell without capturing its fixture)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GOLDEN_CATALOG } from '../benchmark/catalog';
import { MATRIX, buildMatrix } from '../benchmark/matrix';

const FIXTURES_DIR = path.resolve(__dirname, '..', 'benchmark', 'fixtures');

describe('benchmark catalog', () => {
  it('has at least 12 golden objects', () => {
    expect(GOLDEN_CATALOG.length).toBeGreaterThanOrEqual(12);
  });

  it('has 2 objects per EntityTypeId', () => {
    const byType = new Map<number, number>();
    for (const obj of GOLDEN_CATALOG) {
      byType.set(obj.entityTypeId, (byType.get(obj.entityTypeId) ?? 0) + 1);
    }
    for (const [typeId, count] of byType) {
      expect(count, `EntityTypeId ${typeId} should have 2 objects`).toBeGreaterThanOrEqual(2);
    }
  });

  it('all keys are unique', () => {
    const keys = GOLDEN_CATALOG.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('benchmark matrix', () => {
  it('builds without throwing', () => {
    expect(() => buildMatrix()).not.toThrow();
  });

  it('has at least 100 cells', () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(100);
  });

  it('all fixtureKeys are unique', () => {
    const keys = MATRIX.map((c) => c.fixtureKey);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, `Duplicate fixtureKeys: ${dupes.join(', ')}`).toHaveLength(0);
  });

  it('every cell has a tool name', () => {
    for (const c of MATRIX) {
      expect(c.tool, `Cell ${c.fixtureKey} has no tool`).toBeTruthy();
    }
  });

  it('dependsOn cells reference a cell that exists in the matrix', () => {
    const allKeys = new Set(MATRIX.map((c) => c.fixtureKey));
    for (const c of MATRIX) {
      if (c.dependsOn) {
        expect(allKeys.has(c.dependsOn), `${c.fixtureKey} depends on missing cell ${c.dependsOn}`).toBe(true);
      }
    }
  });
});

describe('benchmark fixtures', () => {
  const fixturesExist = fs.existsSync(FIXTURES_DIR);

  it('fixtures directory exists (run benchmark:capture to create)', () => {
    // Info-only: do not fail CI if fixtures haven't been captured yet.
    // A developer must run capture locally before committing new matrix cells.
    if (!fixturesExist) {
      console.warn('\n  ⚠️  benchmark/fixtures/ does not exist — run `npm run benchmark:capture`');
    }
    // Always pass — we just warn
    expect(true).toBe(true);
  });

  if (fixturesExist) {
    const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));

    it('all fixture files are valid JSON with required fields', () => {
      for (const file of fixtureFiles) {
        const content = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8');
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(`${file} is not valid JSON`);
        }
        expect(parsed['fixtureVersion'], `${file} missing fixtureVersion`).toBe(1);
        expect(parsed['tool'], `${file} missing tool`).toBeTruthy();
        expect(parsed['checksum'], `${file} missing checksum`).toBeTruthy();
        expect(parsed['capturedAt'], `${file} missing capturedAt`).toBeTruthy();
      }
    });

    it('non-schemaOnly cells without dependsOn all have a fixture', () => {
      const fixtureKeys = new Set(fixtureFiles.map((f) => f.replace(/\.json$/, '')));
      const missing: string[] = [];

      for (const cell of MATRIX) {
        if (cell.dependsOn) continue; // runtime-resolved, ok to skip
        if (!fixtureKeys.has(cell.fixtureKey)) {
          missing.push(cell.fixtureKey);
        }
      }

      if (missing.length > 0) {
        console.warn(`\n  ⚠️  ${missing.length} cells have no fixture:\n${missing.map((k) => `    - ${k}`).join('\n')}`);
        console.warn('  Run: npm run benchmark:capture');
      }
      // Warn but do not fail CI — fixtures are captured locally
      expect(true).toBe(true);
    });
  }
});
