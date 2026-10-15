import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),continuous=process.argv.includes('--continuous');
const env={...process.env,STUDIO_CANDIDATE_OUTPUT_DIRECTORY:'evidence/web-startup-and-long-story',STUDIO_CONTINUOUS_OUTPUT_DIRECTORY:'evidence/web-startup-and-long-story',STUDIO_PRIOR_EVIDENCE_DIRECTORY:'evidence/web-image-decode',STUDIO_CANDIDATE_VERSION:'1.7.6',STUDIO_ASSERT_RECOVERY_WORKER:'1',STUDIO_ASSERT_FOREGROUND_SESSION:'1',STUDIO_ASSERT_DIRECT_PNG:'1',STUDIO_MEDIA_PROBE_REPORT:'evidence/web-audio-compatibility/native-media-probe.json'};
const child=spawn(process.execPath,[continuous?'tools/run-recovery-continuous.mjs':'tools/run-web-audio-recovery.mjs',...process.argv.slice(2).filter(arg=>arg!=='--continuous')],{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
