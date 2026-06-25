// drift sub-command — detects KB changes that invalidate captured fixtures.

import { GxMcpClient } from './client';
import { GOLDEN_CATALOG } from './catalog';
import { readFixture } from './capture';
import { extractEntityVersionId } from './normalizer';

interface DriftItem {
  key: string;
  name: string;
  entityTypeId: number;
  issue: string;
  severity: 'error' | 'warn' | 'info';
}

export async function runDrift(): Promise<void> {
  console.log('\n[drift] Checking golden objects against live KB...\n');

  const client = new GxMcpClient();
  await client.connect();

  const issues: DriftItem[] = [];

  for (const obj of GOLDEN_CATALOG) {
    process.stdout.write(`  Checking ${obj.key} ...`);

    const findResult = await client.call('gx_find', {
      pattern: obj.name,
      type: obj.entityTypeId,
    });

    if (findResult.isError) {
      process.stdout.write(' ❌ ERROR\n');
      issues.push({
        key: obj.key,
        name: obj.name,
        entityTypeId: obj.entityTypeId,
        issue: `gx_find failed: ${String(findResult.raw).slice(0, 100)}`,
        severity: 'error',
      });
      continue;
    }

    const matches = Array.isArray(findResult.raw) ? findResult.raw : [];
    const exactMatch = (matches as Array<Record<string, unknown>>).find(
      (m) => String(m['name']).toLowerCase() === obj.name.toLowerCase(),
    );

    if (!exactMatch) {
      process.stdout.write(' ❌ NOT FOUND\n');
      issues.push({
        key: obj.key,
        name: obj.name,
        entityTypeId: obj.entityTypeId,
        issue: 'Object not found in KB — may have been deleted or renamed',
        severity: 'error',
      });
      continue;
    }

    // Check EntityId stability (detects delete + recreate)
    const liveEntityId = typeof exactMatch['entityId'] === 'number'
      ? exactMatch['entityId']
      : null;

    if (obj.entityId !== null && liveEntityId !== null && liveEntityId !== obj.entityId) {
      issues.push({
        key: obj.key,
        name: obj.name,
        entityTypeId: obj.entityTypeId,
        issue: `EntityId changed: catalog=${obj.entityId} live=${liveEntityId} — object was recreated`,
        severity: 'error',
      });
    }

    if (obj.entityId === null && liveEntityId !== null) {
      issues.push({
        key: obj.key,
        name: obj.name,
        entityTypeId: obj.entityTypeId,
        issue: `EntityId resolved: live=${liveEntityId} — update catalog.ts`,
        severity: 'info',
      });
    }

    // Check EntityVersionId drift (detects modifications since last capture)
    const getResult = await client.call('gx_get', {
      name: obj.name,
      type: obj.entityTypeId,
    });

    if (!getResult.isError) {
      const liveEvId = extractEntityVersionId('gx_get', getResult.raw);
      const fixture = readFixture(`gx_get__${obj.key}__detail`);

      if (fixture && fixture.entityVersionId !== null && liveEvId !== null) {
        if (liveEvId > fixture.entityVersionId) {
          issues.push({
            key: obj.key,
            name: obj.name,
            entityTypeId: obj.entityTypeId,
            issue: `Modified since capture: capturedVersionId=${fixture.entityVersionId} liveVersionId=${liveEvId} — run capture --object ${obj.key} --force`,
            severity: 'warn',
          });
        }
      } else if (!fixture) {
        issues.push({
          key: obj.key,
          name: obj.name,
          entityTypeId: obj.entityTypeId,
          issue: 'No fixture yet — run benchmark:capture to create initial snapshot',
          severity: 'info',
        });
      }
    }

    const icon = issues.some((i) => i.key === obj.key && i.severity === 'error')
      ? '❌'
      : issues.some((i) => i.key === obj.key && i.severity === 'warn')
      ? '⚠️ '
      : issues.some((i) => i.key === obj.key && i.severity === 'info')
      ? 'ℹ️ '
      : '✅';
    process.stdout.write(` ${icon}\n`);
  }

  await client.close();

  // Print summary
  console.log('');
  if (issues.length === 0) {
    console.log('✅ No drift detected — all golden objects match their fixtures.');
    return;
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const infos = issues.filter((i) => i.severity === 'info');

  if (errors.length > 0) {
    console.log(`❌ ${errors.length} error(s):`);
    for (const e of errors) console.log(`  [${e.key}] ${e.issue}`);
  }
  if (warns.length > 0) {
    console.log(`⚠️  ${warns.length} warning(s):`);
    for (const w of warns) console.log(`  [${w.key}] ${w.issue}`);
  }
  if (infos.length > 0) {
    console.log(`ℹ️  ${infos.length} info(s):`);
    for (const i of infos) console.log(`  [${i.key}] ${i.issue}`);
  }

  if (errors.length > 0 || warns.length > 0) {
    process.exitCode = 1;
  }
}
