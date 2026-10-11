import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

// Only the isolated test browser and its descendants; never report unrelated processes.
export function selectBrowserMemory(rows, browserPid) {
  if (!Number.isSafeInteger(browserPid) || browserPid <= 0) throw Error('Invalid browser PID');
  const selected = new Set([browserPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (selected.has(Number(row.ParentProcessId)) && !selected.has(Number(row.ProcessId))) {
      selected.add(Number(row.ProcessId)); changed = true;
    }
  }
  const processes = rows.filter(row => selected.has(Number(row.ProcessId))).map(row => {
    for (const key of ['ProcessId', 'WorkingSetSize', 'PrivatePageCount']) {
      if (row[key] === null || row[key] === undefined || row[key] === '') throw Error('Missing OS memory counter');
    }
    return { pid: Number(row.ProcessId), workingSetBytes: Number(row.WorkingSetSize), privateBytes: Number(row.PrivatePageCount) };
  });
  if (!processes.some(row => row.pid === browserPid)) throw Error('Test browser exited during memory sample');
  for (const row of processes) for (const value of Object.values(row)) if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid OS memory sample');
  if (new Set(processes.map(row => row.pid)).size !== processes.length) throw Error('Duplicate OS process sample');
  return { source: 'Windows-Win32_Process-browser-tree', processes,
    workingSetBytes: processes.reduce((total, row) => total + row.workingSetBytes, 0),
    privateBytes: processes.reduce((total, row) => total + row.privateBytes, 0) };
}

export async function sampleBrowserMemory(browserPid) {
  if (process.platform !== 'win32') throw Error('Natural-GC process sampling currently requires Windows');
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount | ConvertTo-Json -Compress'],
  { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  const rows = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  return selectBrowserMemory(Array.isArray(rows) ? rows : [rows], browserPid);
}
