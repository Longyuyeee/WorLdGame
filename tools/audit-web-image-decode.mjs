import { readFile,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import { buildPlayerExportRuntime } from './player-export-bundle.mjs';
import { sha,json } from './audit-rain-story-refinement.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'evidence/web-image-decode');
const bytes=name=>readFile(path.join(output,name)),read=async name=>json(await bytes(name));
const [baseline,current,matrix,continuous,artifacts,tests,parity,author,runtime,mapped]=await Promise.all([
  read('baseline.json'),read('current.json'),read('browser-checks.json'),read('continuous.json'),read('artifact-audit.json'),read('player-runtime-tests.json'),read('image-parity.json'),read('author-check.json'),buildPlayerExportRuntime(),buildPlayerExportRuntime({sourceMap:true})
]);
const priorBytes=await readFile(path.join(root,'evidence/web-recovery-worker/before-rain-stops-web.zip')),prior=unzipSync(priorBytes);
const runtimeHash=sha(runtime.javascript);assert.equal(runtime.javascript,mapped.javascript);assert.equal(runtime.css,mapped.css);
for(const report of [baseline,current]){
  assert.equal(report.passed,true);assert.ok(report.samples>=3);assert.equal(report.results.length,report.samples);assert.equal(report.waitForImages,true);assert.deepEqual(report.errors,[]);
  assert.equal(report.candidateArchiveSha256,sha(priorBytes));assert.equal(report.originalRuntimeHash,sha(prior['player.js']));
  for(const run of report.results){assert.equal(run.paragraphs,66);assert.equal(run.saves,3);assert.equal(run.recoverySerializer.active,0);assert.equal(run.recoverySerializer.fallback,0);assert.equal(run.recoverySerializer.failed,0);}
}
assert.equal(baseline.diagnosticRuntimeHash,sha(prior['player.js']));assert.equal(baseline.baselineBundleSha256,null);assert.equal(current.diagnosticRuntimeHash,runtimeHash);
const gameBytes=await bytes('before-rain-stops-web.zip'),game=unzipSync(gameBytes),html=await readFile(path.join(output,'before-rain-stops.html'),'utf8');
assert.equal(sha(game['player.js']),runtimeHash);assert.equal(sha(game['player.css']),sha(runtime.css));
assert.ok(html.includes(runtime.javascript.replace(/<\/script/gi,'<\\/script')));assert.ok(html.includes(runtime.css.replace(/<\/style/gi,'<\\/style')));
for(const [name,expected]of Object.entries(artifacts.artifacts)){const value=await bytes(name);assert.equal(value.length,expected.byteLength);assert.equal(sha(value),expected.sha256);}
assert.equal(artifacts.unchangedSourceEntries,64);assert.equal(artifacts.unchangedMedia,25);assert.equal(artifacts.permissionsPending,25);
assert.equal(author.passed,true);assert.deepEqual(author.artifacts,artifacts.artifacts);assert.ok(author.checks.some(check=>check.name==='actual-editor-save-reopen-formal-1.7.5-dual-export'));
assert.equal(matrix.passed,true);assert.equal(matrix.candidateVersion,'1.7.5');assert.equal(matrix.priorVersion,'1.7.4');assert.equal(matrix.recoveryMatrixComplete,true);assert.equal(matrix.assertedBackgroundWorker,true);assert.deepEqual(matrix.errors,[]);
assert.equal(matrix.checks.length,matrix.sourceReused?16:17);assert.deepEqual(matrix.artifacts,artifacts.artifacts);assert.equal(matrix.routes.length,6);
for(const route of matrix.routes){assert.equal(route.endingRestoredAfterReload,true);assert.equal(route.restoredStageReady,true);assert.equal(route.naturallyEndedVoices,6);assert.ok(route.imageDecodeModes.length>0);assert.ok(route.imageDecodeModes.every(mode=>mode==='owned-blob-bitmap'));}
assert.ok(matrix.checks.find(check=>check.name==='chromium-file-html-actual-old-backup-and-media').imageDecodeModes.every(mode=>mode==='owned-blob-bitmap'));
assert.equal(continuous.passed,true);assert.equal(continuous.runtimeHash,runtimeHash);assert.equal(continuous.candidateArchiveSha256,sha(gameBytes));assert.equal(continuous.cycles.length,8);assert.deepEqual(continuous.errors,[]);
for(const cycle of continuous.cycles){
  assert.equal(cycle.texts,66);assert.equal(cycle.naturallyEndedVoices,6);assert.deepEqual(cycle.imageDecodeModes,['owned-blob-bitmap']);assert.equal(cycle.nativeWorkersLive,0);
  assert.equal(cycle.resources.atlas.accountedBytes,0);assert.equal(cycle.resources.atlas.ordinaryBitmapDecodes,0);assert.equal(cycle.resources.atlas.ordinaryQuarantinedDecodes,0);assert.ok(cycle.resources.atlas.peakBytes<=cycle.resources.atlas.budgetBytes);
  assert.equal(cycle.resources.ownedWorkerUrls.live,0);assert.equal(cycle.resources.ownedWorkerUrls.created,cycle.resources.ownedWorkerUrls.revoked);
}
assert.equal(parity.passed,true);assert.deepEqual(parity.errors,[]);assert.equal(parity.cases.length,117);assert.equal(parity.candidateArchiveSha256,sha(priorBytes));
const sourceSha=async name=>sha((await readFile(path.join(root,name),'utf8')).replaceAll('\r\n','\n'));
assert.equal(parity.currentSourceSha256,await sourceSha('apps/player-shell/src/native-atlas.ts'));assert.equal(parity.readerSourceSha256,await sourceSha('apps/player-shell/src/ordinary-png-source.ts'));assert.equal(parity.policySourceSha256,await sourceSha('apps/player-shell/src/image-resource-policy.ts'));
const priorSource=execFileSync('git',['show',`${parity.priorCommit}:apps/player-shell/src/native-atlas.ts`],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(parity.priorSourceSha256,sha(priorSource.replaceAll('\r\n','\n')));
assert.deepEqual(new Set(parity.cases.map(value=>`${value.engine}/${value.kind}/${value.name}`)).size,117);
for(const value of parity.cases){
  assert.equal(value.sourceSha256,sha(prior[value.name]));assert.equal(sha(game[value.name]),value.sourceSha256);
  const [old,fresh]=value.samples;assert.equal(old.digest,fresh.digest);assert.equal(old.width,fresh.width);assert.equal(old.height,fresh.height);assert.equal(fresh.decode,'owned-blob-bitmap');
  for(const d of value.diagnostics){assert.equal(d.accountedBytes,0);assert.equal(d.ordinaryBitmapDecodes,0);}
}
assert.equal(tests.success,true);assert.equal(tests.numFailedTests,0);assert.equal(tests.numPendingTests,0);
const repeated=new Set(['audio-playback-request.test.ts','player-audio-recovery.test.tsx','player-shell.test.tsx','player-reading-shell.test.tsx','player-reading-controls.test.tsx','player-preferences-shell.test.tsx','player-compatible-save.test.tsx','web-save-compatibility.test.ts']);
const overlap=tests.testResults.filter(result=>repeated.has(path.basename(result.name)));assert.equal(overlap.length,repeated.size);
const overlapTests=overlap.reduce((n,result)=>n+result.assertionResults.length,0);
const tap=execFileSync(process.execPath,['--test','tools/poll-browser-state.test.mjs','tools/player-fixture-build.test.mjs'],{cwd:root,encoding:'utf8',windowsHide:true});assert.match(tap,/^# fail 0\r?$/m);const nodeTests=Number(tap.match(/^# pass (\d+)\r?$/m)?.[1]);assert.equal(nodeTests,5);
const measurements=report=>report.results.map(run=>({run:run.run,longTasks:run.telemetry.longTasks.length,longTaskMs:run.telemetry.longTasks.reduce((n,value)=>n+value.duration,0),longestFrameMs:Math.max(0,...run.telemetry.frames.map(value=>value.duration))}));
await writeFile(path.join(output,'audit.json'),JSON.stringify({passed:true,scope:'exact production/candidate identity, real image pixel parity and bounded continuous use; not statistical or physical-device acceptance',priorRuntimeHash:sha(prior['player.js']),runtimeHash,artifacts:artifacts.artifacts,
  tests:{baseline:420,baselineFiles:45,playerHost:tests.numPassedTests,playerHostFiles:tests.testResults.length,overlapTests,overlapFiles:overlap.length,nodeTests,distinct:420+tests.numPassedTests-overlapTests+nodeTests,distinctFiles:45+tests.testResults.length-overlap.length+2},
  imageParityCases:parity.cases.length,baseline:measurements(baseline),current:measurements(current),browserChecks:matrix.checks.length+(matrix.sourceReused?1:0),continuousCycles:continuous.cycles.length,continuousWallMilliseconds:continuous.wallMilliseconds,
  physicalDevice:false,twoHourSoakPassed:false,physicalMemoryLeakFreeProven:false,fullOfflineAudioMatrixPassed:false,permissionsVerified:false,publicDeployment:false},null,2));
console.log('PASS production/dual-export identity, 117 pixel comparisons, full recovery matrix and eight continuous cycles');
