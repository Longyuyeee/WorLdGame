param([Parameter(Mandatory=$true)][string]$ProcessIds)
$ErrorActionPreference = 'Stop'
if ($ProcessIds -notmatch '^\d+(,\d+)*$') { throw 'Expected explicit process IDs' }
# Read metadata only, never process memory contents, paths or mapped-file names.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class PlayerWorkingSet {
  [StructLayout(LayoutKind.Sequential)] struct Region {
    public IntPtr BaseAddress, AllocationBase;
    public uint AllocationProtect;
    public UIntPtr RegionSize;
    public uint State, Protect, Type;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("psapi.dll", SetLastError=true)] static extern bool QueryWorkingSet(IntPtr process, IntPtr buffer, int bytes);
  [DllImport("kernel32.dll", SetLastError=true)] static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out Region region, UIntPtr bytes);
  public static object Read(int pid) {
    if (pid <= 0 || IntPtr.Size != 8 || Environment.SystemPageSize != 4096) throw new Exception("Requires positive PID and Windows x64 4 KiB pages");
    IntPtr process = OpenProcess(0x0400 | 0x0010, false, pid);
    if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr buffer = IntPtr.Zero;
    try {
      int bytes = 1024 * 1024;
      bool success = false;
      for (; bytes <= 64 * 1024 * 1024; bytes *= 2) {
        buffer = Marshal.AllocHGlobal(bytes);
        if (QueryWorkingSet(process, buffer, bytes)) { success = true; break; }
        int error = Marshal.GetLastWin32Error();
        Marshal.FreeHGlobal(buffer); buffer = IntPtr.Zero;
        if (error != 24) throw new Win32Exception(error);
      }
      if (!success) throw new Exception("Working set exceeded diagnostic buffer limit");
      long count = Marshal.ReadInt64(buffer);
      if (count < 0 || count > (bytes - 8) / 8) throw new Exception("Invalid page count");
      ulong[] pages = new ulong[count];
      for (int i = 0; i < count; i++) pages[i] = unchecked((ulong)Marshal.ReadInt64(buffer, 8 + i * 8));
      Array.Sort(pages);
      var totals = new Dictionary<string, long>();
      foreach (string type in new [] {"private", "mapped", "image", "unknown"})
        foreach (string sharing in new [] {"Private", "Shareable"}) totals[type + sharing + "Bytes"] = 0;
      ulong regionEnd = 0; string regionType = "unknown";
      long sharedNow = 0;
      foreach (ulong page in pages) {
        ulong address = page & ~4095UL;
        if (address >= regionEnd) {
          Region region;
          if (VirtualQueryEx(process, new IntPtr(unchecked((long)address)), out region, (UIntPtr)Marshal.SizeOf(typeof(Region))) == UIntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error());
          regionEnd = unchecked((ulong)region.BaseAddress.ToInt64()) + region.RegionSize.ToUInt64();
          if (regionEnd <= address) throw new Exception("Invalid memory region");
          regionType = region.State != 0x1000 ? "unknown" : region.Type == 0x20000 ? "private" : region.Type == 0x40000 ? "mapped" : region.Type == 0x1000000 ? "image" : "unknown";
        }
        bool shareable = (page & 256) != 0;
        totals[regionType + (shareable ? "Shareable" : "Private") + "Bytes"] += 4096;
        if (shareable && ((page >> 5) & 7) > 1) sharedNow += 4096;
      }
      return new { pid, residentBytes = count * 4096, sharedWithOtherProcessesBytes = sharedNow, categories = totals };
    } finally {
      if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
      CloseHandle(process);
    }
  }
}
'@
@($ProcessIds.Split(',') | ForEach-Object { [PlayerWorkingSet]::Read([int]$_) }) | ConvertTo-Json -Depth 5 -Compress
