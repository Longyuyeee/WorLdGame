import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

// Only the isolated test browser and its descendants; never report unrelated processes.
export function selectBrowserMemory(rows, browserPid) {
  if (!Number.isSafeInteger(browserPid) || browserPid <= 0) throw Error('Invalid browser PID');
  const byPid=new Map(rows.map(row=>[Number(row.ProcessId),row]));
  if(byPid.size!==rows.length)throw Error('Duplicate OS process sample');
  if(!byPid.has(browserPid))throw Error('Test browser exited during memory sample');
  const started=row=>{const value=Number(row.StartedAt);if(row.StartedAt==null||row.StartedAt===''||!Number.isSafeInteger(value)||value<0)throw Error('Missing process creation time');return value;};
  started(byPid.get(browserPid));
  const selected = new Set([browserPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (selected.has(Number(row.ParentProcessId)) && !selected.has(Number(row.ProcessId))) {
      // Windows retains a dead parent's numeric PID. That PID can later belong to
      // our renderer; an older process is NOT a descendant of the new owner.
      if(started(row)<started(byPid.get(Number(row.ParentProcessId))))continue;
      selected.add(Number(row.ProcessId)); changed = true;
    }
  }
  const processes = rows.filter(row => selected.has(Number(row.ProcessId))).map(row => {
    for (const key of ['ProcessId', 'WorkingSetSize', 'PrivatePageCount']) {
      if (row[key] === null || row[key] === undefined || row[key] === '') throw Error('Missing OS memory counter');
    }
    return { pid: Number(row.ProcessId), parentPid:Number(row.ParentProcessId), startedAtMilliseconds:started(row), workingSetBytes: Number(row.WorkingSetSize), privateBytes: Number(row.PrivatePageCount) };
  });
  if (!processes.some(row => row.pid === browserPid)) throw Error('Test browser exited during memory sample');
  for (const row of processes) for (const value of Object.values(row)) if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid OS memory sample');
  if (new Set(processes.map(row => row.pid)).size !== processes.length) throw Error('Duplicate OS process sample');
  return { source: 'Windows-Win32_Process-browser-tree', identityPolicy:'parent-chain-and-creation-time', browserPid, processes,
    workingSetBytes: processes.reduce((total, row) => total + row.workingSetBytes, 0),
    privateBytes: processes.reduce((total, row) => total + row.privateBytes, 0) };
}

export async function sampleBrowserMemory(browserPid) {
  if (process.platform !== 'win32') throw Error('Natural-GC process sampling currently requires Windows');
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,@{Name="StartedAt";Expression={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} | ConvertTo-Json -Compress'],
  { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  const rows = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  const result = selectBrowserMemory(Array.isArray(rows) ? rows : [rows], browserPid);
  // Query command-line classification only for the validated browser tree; never return command lines.
  const filter = result.processes.map(row => `ProcessId = ${row.pid}`).join(' OR ');
  const roles = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { $role = 'helper'; if ($_.ProcessId -eq ${browserPid}) { $role = 'browser' } elseif ($_.CommandLine -match '--type=([a-z-]+)') { $role = $Matches[1] }; [pscustomobject]@{pid=$_.ProcessId;role=$role;startedAt=([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()} } | ConvertTo-Json -Compress`],
  { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
  const classified = JSON.parse(roles.stdout.replace(/^\uFEFF/, ''));
  for (const row of result.processes){
    const found=(Array.isArray(classified)?classified:[classified]).find(item=>item.pid===row.pid);
    if(found&&found.startedAt!==row.startedAtMilliseconds)throw Error('PID reused during process classification');
    row.role=found?.role??'exited-before-classification';
  }
  return result;
}
