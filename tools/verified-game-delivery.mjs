import assert from 'node:assert/strict';
import { copyFile, readFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { sha } from './audit-rain-story-refinement.mjs';

/** Promote only the exact, already tested pair; never replace another candidate.
 * Preflight BOTH destinations before copying either. The caller publishes its
 * passed manifest only after promotion and retention verification succeed. */
export async function promoteVerifiedGameDelivery(directory, artifacts) {
  const files = [['before-rain-stops.html', 'html'], ['before-rain-stops-website.zip', 'website']];
  for (const [name, kind] of files) {
    const expected = artifacts[kind], bytes = await readFile(path.join(directory, 'work', name));
    assert.equal(bytes.length, expected.bytes, `Untested ${kind} byte length`);
    assert.equal(sha(bytes), expected.sha256, `Untested ${kind} digest`);
    try {
      const existing = await readFile(path.join(directory, name));
      assert.equal(existing.length, expected.bytes, `Different existing ${kind} candidate`);
      assert.equal(sha(existing), expected.sha256, `Different existing ${kind} candidate`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const [name, kind] of files) {
    const source = path.join(directory, 'work', name), target = path.join(directory, name);
    try { await copyFile(source, target, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const bytes = await readFile(target);
    assert.equal(bytes.length, artifacts[kind].bytes);
    assert.equal(sha(bytes), artifacts[kind].sha256, `Promoted ${kind} digest mismatch`);
  }
  // Never remove the verified working pair until BOTH public files match.
  for (const [name] of files) await unlink(path.join(directory, 'work', name));
}
