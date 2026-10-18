import { spawn } from 'node:child_process';
const args=process.argv.slice(2),profile=args.includes('--profile'),currentOnly=args.includes('--current-only');
const env={...process.env,STUDIO_UI_URL:process.env.STUDIO_UI_URL??'http://127.0.0.1:5196/',
  STUDIO_CANDIDATE_OUTPUT_DIRECTORY:'evidence/web-reading-throughput',STUDIO_PRIOR_EVIDENCE_DIRECTORY:'evidence/web-load-responsiveness',STUDIO_CANDIDATE_VERSION:'1.7.14',
  STUDIO_ASSERT_RECOVERY_WORKER:'1',STUDIO_ASSERT_FOREGROUND_SESSION:'1',STUDIO_ASSERT_DIRECT_PNG:'1',
  STUDIO_MEDIA_PROBE_REPORT:'evidence/web-audio-compatibility/native-media-probe.json',STUDIO_BROWSER_ENGINES:process.env.STUDIO_BROWSER_ENGINES??'chromium',
  STUDIO_SESSION_OUTPUT_DIRECTORY:'evidence/web-reading-throughput',STUDIO_SESSION_BASELINE_FILE:'evidence/web-reading-throughput/baseline-sources.json',STUDIO_SESSION_FORMAL_STYLE:'1',STUDIO_SESSION_FIXTURE:'tools/fixtures/reading-advance-player.ts'};
const steps=profile?[...(!currentOnly?[['tools/run-web-long-story.mjs','--baseline','--profile']]:[]),['tools/run-web-long-story.mjs','--profile'],['tools/run-web-history-search.mjs']]:[['tools/run-web-audio-recovery.mjs',...args]];
for(const command of steps){const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,command,{cwd:new URL('..',import.meta.url),env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',value=>resolve(value??1));});if(code!==0){process.exitCode=code;break;}}
