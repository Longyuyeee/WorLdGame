import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
if (!args.some(arg => ['--baseline', '--current', '--audit-only'].includes(arg))) throw Error('Use --baseline, --current or --audit-only');
const env = { ...process.env, STUDIO_COST_BASELINE_COMMIT: 'f8616873c04eb2efcc0d7157d7ee850cd2039c99', STUDIO_COST_OUTPUT_DIRECTORY: 'evidence/web-load-wait/profile', STUDIO_COST_LOAD_PHASES: '1', STUDIO_COST_ALLOW_STYLE_CHANGE: '1', STUDIO_COST_EXPECT_HISTORY_ENCODING: '1' };
const flags = args.includes('--baseline') ? args.includes('--audit-only') ? ['--baseline', '--audit-only'] : ['--baseline', '--freeze'] : args.includes('--audit-only') ? ['--audit-only'] : [];
const code = await new Promise((resolve, reject) => { const child = spawn(process.execPath, ['tools/run-web-session-cost.mjs', ...flags], { env, stdio: 'inherit', windowsHide: true }); child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) {
  if (!args.includes('--audit-only')) {
    const file = `${env.STUDIO_COST_OUTPUT_DIRECTORY}/${args.includes('--baseline') ? 'baseline' : 'current'}.json`, report = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...report, passed: false, status: 'failed', exitCode: code }, null, 2));
  }
  throw Error(`Load wait profile failed (${code})`);
}
if (args.includes('--current') && !args.includes('--audit-only')) {
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const profiles = await Promise.all(['baseline', 'current'].map(async label => {
    const report = JSON.parse(await readFile(`${env.STUDIO_COST_OUTPUT_DIRECTORY}/${label}.json`, 'utf8')); assert.equal(report.passed, true);
    return { label, bundleHash: report.bundleHash, sizes: [120, 480, 960].map(count => {
      const rows = report.operations.filter(item => item.name === 'quick-load' && item.count === count), posts = rows.map(row => row.posts.find(post => post.kind === 'load'));
      assert.equal(rows.length, 3);
      return { count, wallMs: median(rows.map(row => row.wallMs)), workerPrepareMs: median(posts.map(post => post.workerLoad.corePrepareMs)), runtimeLoadMs: median(posts.map(post => post.workerLoad.runtimeLoadCallsMs.reduce((a, b) => a + b, 0))), resultEncodeMs: median(posts.map(post => post.workerLoad.resultEncodeMs)), receiveDecodeMs: median(posts.map(post => post.receiveDecodeMs)), receiveCallbackMs: median(posts.map(post => post.receiveCallbackMs)), maximumObservedHeartbeatGapMs: Math.max(...rows.map(row => row.maximumHeartbeatGapMs)) };
    }) };
  }));
  await writeFile(`${env.STUDIO_COST_OUTPUT_DIRECTORY}/comparison.json`, JSON.stringify({ passed: true, profiles, scope: 'Same-machine Chromium, real UI to 120/480/960 histories and three complete loads each. Runtime load is a subset of worker preparation; receive decode is a subset of receiver callback. Wall includes UI confirmation, IO, queue, validation, transport, rendering and frame observations; not the sum of medians. Timers are test-build-only wrappers; no validation shortcut, speed threshold, physical phone or total speedup claim.' }, null, 2));
}
