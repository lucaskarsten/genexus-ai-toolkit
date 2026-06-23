import { describe, it, expect } from 'vitest';
import {
  isReadonly,
  visibleTools,
  readonlyBlock,
  WRITE_TOOLS,
  SQL_TOOLS,
} from '../src/dispatch';

describe('GX18_READONLY mode', () => {
  it('isReadonly reads the env flag (1 / true, case-insensitive)', () => {
    expect(isReadonly({ GX18_READONLY: '1' })).toBe(true);
    expect(isReadonly({ GX18_READONLY: 'true' })).toBe(true);
    expect(isReadonly({ GX18_READONLY: 'TRUE' })).toBe(true);
    expect(isReadonly({})).toBe(false);
    expect(isReadonly({ GX18_READONLY: '0' })).toBe(false);
    expect(isReadonly({ GX18_READONLY: 'false' })).toBe(false);
  });

  it('hides write tools from the advertised list when read-only', () => {
    const names = visibleTools(true).map((t) => t.name);
    for (const w of WRITE_TOOLS) expect(names).not.toContain(w);
    // read tools survive
    expect(names).toContain('gx_find');
    expect(names).toContain('gx_read');
    // sql tools survive (they get clamped to read-only, not removed)
    for (const s of SQL_TOOLS) expect(names).toContain(s);
  });

  it('advertises every tool when not read-only', () => {
    const names = visibleTools(false).map((t) => t.name);
    for (const w of WRITE_TOOLS) expect(names).toContain(w);
  });

  it('blocks write tools even if called directly in read-only mode', () => {
    expect(readonlyBlock('gx_create', { confirm: true }, true)).toMatch(/disabled/);
    expect(readonlyBlock('gx_modify', {}, true)).toMatch(/disabled/);
  });

  it('refuses readOnly:false on sql tools in read-only mode', () => {
    expect(readonlyBlock('gx_sql', { readOnly: false }, true)).toMatch(/Refusing readOnly:false/);
    expect(readonlyBlock('gx_db_query', { readOnly: false, connection: 'kb' }, true)).toMatch(
      /Refusing readOnly:false/,
    );
    // SELECT-style calls pass through
    expect(readonlyBlock('gx_sql', { query: 'SELECT 1' }, true)).toBeNull();
    expect(readonlyBlock('gx_sql', { readOnly: true }, true)).toBeNull();
  });

  it('blocks nothing when not in read-only mode', () => {
    expect(readonlyBlock('gx_create', { confirm: true }, false)).toBeNull();
    expect(readonlyBlock('gx_sql', { readOnly: false }, false)).toBeNull();
  });
});
