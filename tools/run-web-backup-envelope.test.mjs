import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
for (const [args, report] of [[[], 'chromium-website.json'], [['--engine=webkit', '--html'], 'webkit-html.json']]) test(`preserves backup-envelope ${report} before opening games`, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'world-backup-envelope-'));
  try {
    const sentinel = '{"keep":"frozen"}'; await writeFile(path.join(directory, report), sentinel);
    const result = spawnSync(process.execPath, ['tools/run-web-backup-envelope.mjs', ...args], { cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, STUDIO_BACKUP_ENVELOPE_OUTPUT_DIRECTORY: directory, STUDIO_BACKUP_ENVELOPE_SOURCE_DIRECTORY: path.join(directory, 'missing') } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite a backup-envelope browser report/u); assert.equal(await readFile(path.join(directory, report), 'utf8'), sentinel); assert.deepEqual(await readdir(directory), [report]);
  } finally { await unlink(path.join(directory, report)); await rmdir(directory); }
});
for (const label of ['baseline', 'current']) test(`preserves envelope ${label} measurements before building or launching browsers`, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'world-envelope-profile-')), report = `${label}.json`;
  try {
    await writeFile(path.join(directory, report), label);
    const result = spawnSync(process.execPath, ['tools/profile-web-backup-envelope.mjs', ...(label === 'baseline' ? ['--baseline'] : [])], { cwd: root, windowsHide: true, encoding: 'utf8', env: { ...process.env, STUDIO_BACKUP_ENVELOPE_PROFILE_DIRECTORY: directory } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to overwrite backup envelope measurements/u); assert.equal(await readFile(path.join(directory, report), 'utf8'), label); assert.deepEqual(await readdir(directory), [report]);
  } finally { await unlink(path.join(directory, report)); await rmdir(directory); }
});
