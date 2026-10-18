import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sha } from './audit-rain-story-refinement.mjs';
import { promoteVerifiedGameDelivery } from './verified-game-delivery.mjs';

const names = ['before-rain-stops.html', 'before-rain-stops-website.zip'];
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'world-verified-delivery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'work'));
  const bytes = [Buffer.from('<html>\r\nexact tested bytes\n</html>'), Buffer.from([80, 75, 0, 255, 13, 10])];
  for (let i = 0; i < names.length; i++) await writeFile(path.join(directory, 'work', names[i]), bytes[i]);
  const artifacts = Object.fromEntries(['html', 'website'].map((kind, i) => [kind, { bytes: bytes[i].length, sha256: sha(bytes[i]) }]));
  return { directory, bytes, artifacts };
}
test('promotes exact HTML and website bytes and removes only the verified working pair', async t => {
  const { directory, bytes, artifacts } = await fixture(t);
  await writeFile(path.join(directory, 'work', 'browser-checks.json'), 'preserve');
  await promoteVerifiedGameDelivery(directory, artifacts);
  for (let i = 0; i < names.length; i++) {
    assert.deepEqual(await readFile(path.join(directory, names[i])), bytes[i]);
    await assert.rejects(readFile(path.join(directory, 'work', names[i])), { code: 'ENOENT' });
  }
  assert.equal(await readFile(path.join(directory, 'work', 'browser-checks.json'), 'utf8'), 'preserve');
});
test('accepts identical previously promoted bytes without rewriting them', async t => {
  const { directory, bytes, artifacts } = await fixture(t);
  for (let i = 0; i < names.length; i++) await writeFile(path.join(directory, names[i]), bytes[i]);
  await promoteVerifiedGameDelivery(directory, artifacts);
  for (let i = 0; i < names.length; i++) assert.deepEqual(await readFile(path.join(directory, names[i])), bytes[i]);
});
test('promotes an explicitly named child staging pair without touching another working pair', async t => {
  const { directory, bytes, artifacts } = await fixture(t), staging = path.join(directory, 'final-work'); await mkdir(staging);
  for (const name of names) await copyFile(path.join(directory, 'work', name), path.join(staging, name));
  await promoteVerifiedGameDelivery(directory, artifacts, staging);
  for (let i = 0; i < names.length; i++) { assert.deepEqual(await readFile(path.join(directory, names[i])), bytes[i]); assert.deepEqual(await readFile(path.join(directory, 'work', names[i])), bytes[i]); await assert.rejects(readFile(path.join(staging, names[i])), { code: 'ENOENT' }); }
});
test('rejects a non-child staging path before writing a game or removing any working file', async t => {
  const { directory, bytes, artifacts } = await fixture(t);
  await assert.rejects(promoteVerifiedGameDelivery(directory, artifacts, path.dirname(directory)), /direct child/u);
  for (let i = 0; i < names.length; i++) { assert.deepEqual(await readFile(path.join(directory, 'work', names[i])), bytes[i]); await assert.rejects(readFile(path.join(directory, names[i])), { code: 'ENOENT' }); }
});
test('rejects a staging junction without following it or removing the original pair', async t => {
  const { directory, bytes, artifacts } = await fixture(t), link = path.join(directory, 'final-work');
  await symlink(path.join(directory, 'work'), link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(promoteVerifiedGameDelivery(directory, artifacts, link), /link or junction/u);
  for (let i = 0; i < names.length; i++) { assert.deepEqual(await readFile(path.join(directory, 'work', names[i])), bytes[i]); await assert.rejects(readFile(path.join(directory, names[i])), { code: 'ENOENT' }); }
});
for (const kind of ['html', 'website']) test(`rejects changed ${kind} bytes before publishing either file`, async t => {
  const { directory, artifacts } = await fixture(t), i = kind === 'html' ? 0 : 1;
  await writeFile(path.join(directory, 'work', names[i]), Buffer.alloc(artifacts[kind].bytes, 33));
  await assert.rejects(promoteVerifiedGameDelivery(directory, artifacts), /Untested .* digest/);
  for (const name of names) { await assert.rejects(readFile(path.join(directory, name)), { code: 'ENOENT' }); assert.ok((await readFile(path.join(directory, 'work', name))).length); }
});
test('rejects a mismatched reported size before publishing', async t => {
  const { directory, artifacts } = await fixture(t); artifacts.website.bytes++;
  await assert.rejects(promoteVerifiedGameDelivery(directory, artifacts), /Untested website byte length/);
  await assert.rejects(readFile(path.join(directory, names[0])), { code: 'ENOENT' });
});
test('a different existing website candidate blocks HTML promotion and preserves both working files', async t => {
  const { directory, bytes, artifacts } = await fixture(t), old = Buffer.from('retained old candidate');
  await writeFile(path.join(directory, names[1]), old);
  await assert.rejects(promoteVerifiedGameDelivery(directory, artifacts), /Different existing website candidate/);
  assert.deepEqual(await readFile(path.join(directory, names[1])), old);
  await assert.rejects(readFile(path.join(directory, names[0])), { code: 'ENOENT' });
  for (let i = 0; i < names.length; i++) assert.deepEqual(await readFile(path.join(directory, 'work', names[i])), bytes[i]);
});
test('a missing website leaves the HTML unpublished and retained for diagnosis', async t => {
  const { directory, bytes, artifacts } = await fixture(t);
  await rm(path.join(directory, 'work', names[1]));
  await assert.rejects(promoteVerifiedGameDelivery(directory, artifacts), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(directory, names[0])), { code: 'ENOENT' });
  assert.deepEqual(await readFile(path.join(directory, 'work', names[0])), bytes[0]);
});
