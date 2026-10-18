import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { sha, json } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-recovery-worker');
await mkdir(path.join(root, '.browser-diagnostic'), { recursive: true });
const scratch = await mkdtemp(path.join(root, '.browser-diagnostic/author-'));
const env = { ...process.env, STUDIO_CANDIDATE_OUTPUT_DIRECTORY: scratch, STUDIO_PRIOR_EVIDENCE_DIRECTORY: 'evidence/web-audio-compatibility', STUDIO_CANDIDATE_VERSION: '1.7.4' };
const code = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['tools/run-web-audio-recovery.mjs', '--author-only'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
});
assert.equal(code, 0);
const proof = json(await readFile(path.join(scratch, 'author-check.json'))), retained = json(await readFile(path.join(output, 'artifact-audit.json')));
assert.equal(proof.passed, true);
for (const name of Object.keys(retained.artifacts)) {
  const [actual, expected] = await Promise.all([readFile(path.join(scratch, name)), readFile(path.join(output, name))]);
  assert.equal(sha(expected), retained.artifacts[name].sha256);
  if (name.endsWith('.zip')) {
    const a = unzipSync(actual), b = unzipSync(expected); assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const key of Object.keys(a)) assert.equal(sha(a[key]), sha(b[key]), key);
  } else assert.equal(sha(actual), sha(expected), name);
}
await writeFile(path.join(output, 'author-check.json'), JSON.stringify({ ...proof, actualRebuiltArtifacts: proof.artifacts, artifacts: retained.artifacts, authorRecheckedInIsolatedDirectory: true, allZipEntryBytesIdentical: true, htmlAndReviewExactBytes: true, retainedCandidateUnmodified: true }, null, 2));
console.log('PASS actual author save/reopen/dual export, every ZIP entry and HTML equal retained candidate');
