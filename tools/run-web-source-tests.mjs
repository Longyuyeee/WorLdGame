import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'evidence/web-source-hashing');await mkdir(output,{recursive:true});
const filters=['packages/project-domain/src','packages/project-compiler/src','apps/player-shell/src','packages/player-core/src','packages/runtime-host/src',
  ...['web-asset-sources.test.tsx','web-delivery-bundle.test.ts','web-credits.test.tsx','formal-web-export.test.ts','web-release-readiness.test.ts','web-release-workflow.test.tsx','portable-project-bundle.test.ts','web-offline-layout.test.ts','route-review.test.ts','playtest-progress.test.ts','formal-preview-hot-update.test.ts','canonical-project-save-app.test.tsx','page-leave-guard-app.test.tsx','web-offline-retry.test.ts'].map(name=>`apps/editor/src/${name}`),
  ...['canonical.test.ts','sha256.test.ts','runtime.test.ts','scheduler-validation.test.ts','scene-entry-trace.test.ts'].map(name=>`packages/runtime/src/${name}`)];
async function run(args,capture=false){let stdout='';const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:capture?['ignore','pipe','inherit']:'inherit',windowsHide:true});if(capture)child.stdout.on('data',value=>{stdout+=value;process.stdout.write(value);});child.on('error',reject);child.on('exit',code=>resolve(code??1));});if(code!==0)throw Error(`Command failed (${code}): ${args.join(' ')}`);return stdout;}
await run(['node_modules/vitest/vitest.mjs','run',...filters,'--maxWorkers=1','--reporter=default','--reporter=json',`--outputFile=${path.join(output,'tests.json')}`]);
const files=['tools/export-deployment-check.test.mjs','tools/poll-browser-state.test.mjs','tools/player-fixture-build.test.mjs'];
const tap=await run(['--test',...files],true),count=Number(tap.match(/^# pass (\d+)\r?$/m)?.[1]);if(!count||!/^# fail 0\r?$/m.test(tap))throw Error('Node test totals are missing or failed');
await writeFile(path.join(output,'node-tests.json'),JSON.stringify({passed:true,files,count,tap},null,2));
