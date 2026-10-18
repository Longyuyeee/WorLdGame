import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
for(const baseline of (process.argv.includes('--current-only')?[false]:[true,false]))for(const script of ['run-web-startup-profile.mjs','run-web-long-story.mjs']){
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[`tools/${script}`,...(baseline?['--baseline']:[])],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>resolve(code??1));});if(code!==0){process.exitCode=code;process.exit(code);}
}
const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tools/run-web-startup-profile.mjs','--candidate'],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>resolve(code??1));});if(code!==0)process.exitCode=code;
