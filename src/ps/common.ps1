# Shared setup for NoPeeking helper scripts: UTF-8 stdin/stdout and Windows API bindings.
# Secrets are read from stdin or Credential Manager and are never written to stderr.
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

function Get-Target([string]$Name) {
  if ($Name -cnotmatch '^[a-z0-9][a-z0-9._-]{0,63}$') { [Console]::Out.Write('BAD_NAME'); exit 1 }
  return "nopeeking:$Name"
}

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace NoPeeking {
  public static class Cred {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
      public int Flags;
      public int Type;
      public string TargetName;
      public string Comment;
      public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
      public int CredentialBlobSize;
      public IntPtr CredentialBlob;
      public int Persist;
      public int AttributeCount;
      public IntPtr Attributes;
      public string TargetAlias;
      public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite(ref CREDENTIAL credential, int flags);
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll", EntryPoint = "CredEnumerateW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredEnumerate(string filter, int flags, out int count, out IntPtr credentials);
    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDelete(string target, int type, int flags);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr buffer);

    private const int GENERIC = 1;
    private const int PERSIST_LOCAL_MACHINE = 2;
    private const int ERROR_NOT_FOUND = 1168;
    public const int MAX_BLOB_BYTES = 2560;

    private static CREDENTIAL At(IntPtr p) { return (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL)); }

    private static bool Read(string target, out IntPtr p) {
      if (CredRead(target, GENERIC, 0, out p)) return true;
      int e = Marshal.GetLastWin32Error();
      if (e == ERROR_NOT_FOUND) return false;
      throw new Win32Exception(e);
    }

    public static bool Exists(string target) { return GetComment(target) != null; }

    public static string GetComment(string target) {
      IntPtr p;
      if (!Read(target, out p)) return null;
      try { return At(p).Comment ?? ""; } finally { CredFree(p); }
    }

    public static string GetSecret(string target) {
      IntPtr p;
      if (!Read(target, out p)) return null;
      try {
        CREDENTIAL c = At(p);
        if (c.CredentialBlobSize == 0) return "";
        return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2);
      } finally { CredFree(p); }
    }

    public static void Write(string target, string secret, string comment) {
      byte[] blob = Encoding.Unicode.GetBytes(secret);
      if (blob.Length > MAX_BLOB_BYTES) throw new ArgumentException("TOO_LONG");
      CREDENTIAL c = new CREDENTIAL();
      c.Type = GENERIC;
      c.TargetName = target;
      c.Comment = comment;
      c.Persist = PERSIST_LOCAL_MACHINE;
      c.UserName = "nopeeking";
      c.CredentialBlobSize = blob.Length;
      c.CredentialBlob = Marshal.AllocHGlobal(Math.Max(blob.Length, 1));
      try {
        Marshal.Copy(blob, 0, c.CredentialBlob, blob.Length);
        if (!CredWrite(ref c, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
      } finally {
        Marshal.Copy(new byte[blob.Length], 0, c.CredentialBlob, blob.Length);
        Marshal.FreeHGlobal(c.CredentialBlob);
        Array.Clear(blob, 0, blob.Length);
      }
    }

    // One "target<TAB>comment" line per credential matching the filter. Never includes secrets.
    public static string[] List(string filter) {
      int count;
      IntPtr p;
      if (!CredEnumerate(filter, 0, out count, out p)) {
        int e = Marshal.GetLastWin32Error();
        if (e == ERROR_NOT_FOUND) return new string[0];
        throw new Win32Exception(e);
      }
      try {
        string[] lines = new string[count];
        for (int i = 0; i < count; i++) {
          CREDENTIAL c = At(Marshal.ReadIntPtr(p, i * IntPtr.Size));
          lines[i] = c.TargetName + "\t" + (c.Comment ?? "");
        }
        return lines;
      } finally { CredFree(p); }
    }

    public static bool Delete(string target) {
      if (CredDelete(target, GENERIC, 0)) return true;
      int e = Marshal.GetLastWin32Error();
      if (e == ERROR_NOT_FOUND) return false;
      throw new Win32Exception(e);
    }
  }

  public static class Win {
    private delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();

    public static int ProcessId(IntPtr hwnd) { uint pid; GetWindowThreadProcessId(hwnd, out pid); return (int)pid; }

    // True for owned windows (GW_OWNER = 4), such as Chrome's "Save password" bubble. Real browser windows have no owner.
    public static bool HasOwner(IntPtr hwnd) { return GetWindow(hwnd, 4) != IntPtr.Zero; }

    public static string ProcessName(IntPtr hwnd) {
      try { return System.Diagnostics.Process.GetProcessById(ProcessId(hwnd)).ProcessName; } catch { return ""; }
    }

    public static List<IntPtr> TopWindowsOfClass(string className) {
      List<IntPtr> found = new List<IntPtr>();
      EnumWindows(delegate (IntPtr h, IntPtr l) {
        if (IsWindowVisible(h) && GetWindowTextLength(h) > 0) {
          StringBuilder sb = new StringBuilder(256);
          GetClassName(h, sb, sb.Capacity);
          if (sb.ToString() == className) found.Add(h);
        }
        return true;
      }, IntPtr.Zero);
      return found;
    }

    // Brings a window to the front. False if Windows refused (for example on the lock screen).
    public static bool Activate(IntPtr hwnd) {
      if (GetForegroundWindow() == hwnd) return true;
      if (IsIconic(hwnd)) ShowWindow(hwnd, 9);
      uint ignored;
      uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
      uint me = GetCurrentThreadId();
      bool attached = fgThread != 0 && fgThread != me && AttachThreadInput(me, fgThread, true);
      try { BringWindowToTop(hwnd); SetForegroundWindow(hwnd); }
      finally { if (attached) AttachThreadInput(me, fgThread, false); }
      Thread.Sleep(200);
      return GetForegroundWindow() == hwnd;
    }
  }

  public static class Keys {
    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, INPUT[] inputs, int size);

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x2;
    private const uint KEYEVENTF_UNICODE = 0x4;

    // Types text as unicode key events. Stops (false) if another window takes the foreground.
    public static bool TypeText(string text, IntPtr hwnd) {
      foreach (char ch in text) {
        if (Win.GetForegroundWindow() != hwnd) return false;
        INPUT[] pair = new INPUT[2];
        pair[0].type = INPUT_KEYBOARD;
        pair[0].u.ki.wScan = (ushort)ch;
        pair[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
        pair[1].type = INPUT_KEYBOARD;
        pair[1].u.ki.wScan = (ushort)ch;
        pair[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        if (SendInput(2, pair, Marshal.SizeOf(typeof(INPUT))) != 2) return false;
        Thread.Sleep(8);
      }
      return true;
    }
  }
}
'@
