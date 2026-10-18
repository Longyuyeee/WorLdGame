import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { build } from './player-fixture-build.mjs';
import { sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { sourceHashContext as settings } from './web-source-hash-context.mjs';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,settings.STUDIO_SESSION_OUTPUT_DIRECTORY);await mkdir(output,{recursive:true});
const baseline=process.argv.includes('--baseline'),label=baseline?'baseline':'current',commit=settings.STUDIO_SESSION_BASELINE_COMMIT;
const old=new Map(baseline?JSON.parse(settings.STUDIO_SESSION_BASELINE_PATHS).map(file=>[path.join(root,file).replaceAll('\\','/'),execFileSync('git',['show',`${commit}:${file}`],{cwd:root,encoding:'utf8',windowsHide:true})]):[]);
const bundle=await build({configFile:false,logLevel:'error',plugins:[{name:'source-hash-frozen-baseline',load(id){return old.get(id.replaceAll('\\','/'));}}],define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,lib:{entry:path.join(root,'tools/fixtures/source-hash-player.ts'),name:'SourceHash',formats:['iife']}}});
const code=(Array.isArray(bundle)?bundle:[bundle]).flatMap(value=>value.output).filter(value=>value.type==='chunk').map(value=>value.code).join('\n'),fixtureSourceHash=sha((await readFile(path.join(root,'tools/fixtures/source-hash-player.ts'),'utf8')).replaceAll('\r\n','\n'));
const archive=await readFile(path.join(root,settings.STUDIO_SESSION_BASELINE_ARCHIVE)),game=unzipSync(archive),project=readGamePayload(strFromU8(game['index.html'])).project;
const identity={bundleHash:sha(code),fixtureSourceHash,archiveSha256:sha(archive),projectHash:sha(JSON.stringify(project)),priorCommit:commit};
if(process.argv.includes('--audit-only')){const report=JSON.parse(await readFile(path.join(output,`source-${label}.json`),'utf8'));assert.deepEqual(report.identity,identity);console.log(`PASS ${label} source-scaling exact bundle identity`);process.exit(0);}
const server=createServer((req,res)=>req.url==='/player.js'?res.writeHead(200,{'Content-Type':'text/javascript'}).end(code):res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><meta charset="utf-8"><script src="/player.js"></script>'));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const browser=await chromium.launch({headless:true}),samples=[],errors=[];
try{
  for(const count of [1,8,32])for(let run=0;run<5;run++){
    const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>typeof window.sourceHashCase==='function');
    const row=await page.evaluate(({project,count})=>window.sourceHashCase(project,count),{project,count});
    assert.equal(row.compatibleBuildIds.length,count);assert.equal(new Set(row.compatibleBuildIds).size,count);samples.push({count,run,...row});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(output,`source-${label}.json`),JSON.stringify({passed:true,identity,browser:browser.version(),samples,errors,scope:'synthetic 1/8/32 valid version lists on the actual fixed source; public Core after receipt preparation, five fresh contexts per count; no throttling, not statistical/device/cold-page acceptance'},null,2));console.log(`PASS ${label}: exact public Core source identities at 1/8/32 versions`);
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
