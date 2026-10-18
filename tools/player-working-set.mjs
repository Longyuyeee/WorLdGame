import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const execute=promisify(execFile);
export function validateWorkingSets(rows,pids){
  assert.ok(pids.length>0&&pids.every(pid=>Number.isSafeInteger(pid)&&pid>0));
  assert.equal(new Set(pids).size,pids.length);
  assert.ok(Array.isArray(rows));assert.equal(rows.length,pids.length);
  assert.deepEqual(rows.map(row=>row.pid).sort((a,b)=>a-b),[...pids].sort((a,b)=>a-b));
  const keys=['private','mapped','image','unknown'].flatMap(type=>['Private','Shareable'].map(sharing=>`${type}${sharing}Bytes`));
  for(const row of rows){
    assert.ok(row.residentBytes>0,'Exited or empty process snapshot');
    assert.deepEqual(Object.keys(row.categories).sort(),[...keys].sort());
    const values=keys.map(key=>row.categories[key]);
    for(const value of [...values,row.residentBytes,row.sharedWithOtherProcessesBytes])assert.ok(Number.isSafeInteger(value)&&value>=0&&value%4096===0);
    assert.equal(values.reduce((a,b)=>a+b,0),row.residentBytes);
    const shareable=keys.filter(key=>key.endsWith('ShareableBytes')).reduce((sum,key)=>sum+row.categories[key],0);
    assert.ok(row.sharedWithOtherProcessesBytes<=shareable);
  }
  return {source:'Windows-QueryWorkingSet-VirtualQueryEx',pageBytes:4096,processes:rows,
    limits:'Sequential metadata snapshots; shareable is not necessarily shared; mapped includes non-file mappings and private copy-on-write; no GPU attribution or physical unique-byte total'};
}
export async function sampleWorkingSets(processes){
  assert.equal(process.platform,'win32');
  const pids=processes.map(row=>row.pid);
  assert.ok(pids.length>0&&pids.every(pid=>Number.isSafeInteger(pid)&&pid>0));
  // Process-local policy for this checked-in diagnostic script; no machine policy changes.
  const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./player-working-set.ps1',import.meta.url)),'-ProcessIds',pids.join(',')],{windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  const rows=JSON.parse(stdout.replace(/^\uFEFF/,''));
  return validateWorkingSets(Array.isArray(rows)?rows:[rows],pids);
}
