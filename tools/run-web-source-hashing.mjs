import { spawn } from 'node:child_process';
import { sourceHashContext } from './web-source-hash-context.mjs';
const args=process.argv.slice(2),continuous=args.includes('--continuous'),profile=args.includes('--profile');
const child=spawn(process.execPath,[profile?'tools/run-web-session-profile.mjs':continuous?'tools/run-recovery-continuous.mjs':'tools/run-web-audio-recovery.mjs',...args.filter(arg=>!['--continuous','--profile'].includes(arg))],{cwd:new URL('..',import.meta.url),env:{...process.env,...sourceHashContext},stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
