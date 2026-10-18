# Credential Manager access for NoPeeking entries.
# Usage: cred.ps1 list | meta <name> | get <name> | put <name> | delete <name> | old | migrate
# put reads stdin: the comment (metadata JSON) on the first line, then the value, exactly, after the first newline.
# old prints how many entries passClaude (the old name, before 0.2.0) saved under passclaude:. migrate moves each of them to
# nopeeking: and prints "moved<TAB>name", or "kept<TAB>name" when a NoPeeking entry of that name already exists. Given a name,
# both only look at entries whose names start with it (the tests use this to leave real entries alone).
# Exit codes: 0 ok, 3 not found, 4 already exists, 5 too long.
param(
  [Parameter(Mandatory = $true)][ValidateSet('list', 'meta', 'get', 'put', 'delete', 'old', 'migrate')][string]$Op,
  [string]$Name
)
. "$PSScriptRoot\common.ps1"

function Get-OldPrefix([string]$Prefix) {
  if ($Prefix -cnotmatch '^[a-z0-9._-]*$') { [Console]::Out.Write('BAD_NAME'); exit 1 }
  return $Prefix
}

switch ($Op) {
  'list' {
    foreach ($line in [NoPeeking.Cred]::List('nopeeking:*')) { [Console]::Out.Write("$line`n") }
  }
  'meta' {
    $comment = [NoPeeking.Cred]::GetComment((Get-Target $Name))
    if ($null -eq $comment) { exit 3 }
    [Console]::Out.Write($comment)
  }
  'get' {
    $secret = [NoPeeking.Cred]::GetSecret((Get-Target $Name))
    if ($null -eq $secret) { exit 3 }
    [Console]::Out.Write($secret)
  }
  'put' {
    $target = Get-Target $Name
    # Read with .NET calls only, never a cmdlet: PowerShell module logging can record the parameters a cmdlet receives.
    $comment = [Console]::In.ReadLine()
    $value = [Console]::In.ReadToEnd()
    if ([NoPeeking.Cred]::Exists($target)) { exit 4 }
    if ([Text.Encoding]::Unicode.GetByteCount($value) -gt [NoPeeking.Cred]::MAX_BLOB_BYTES) { exit 5 }
    [NoPeeking.Cred]::Write($target, $value, $comment)
  }
  'delete' {
    if (-not [NoPeeking.Cred]::Delete((Get-Target $Name))) { exit 3 }
  }
  'old' {
    [Console]::Out.Write([string]@([NoPeeking.Cred]::List("passclaude:$(Get-OldPrefix $Name)*")).Count)
  }
  'migrate' {
    foreach ($line in [NoPeeking.Cred]::List("passclaude:$(Get-OldPrefix $Name)*")) {
      $tab = $line.IndexOf("`t")
      $old = $line.Substring(0, $tab)
      $oldName = $old.Substring('passclaude:'.Length)
      if ($oldName -cnotmatch '^[a-z0-9][a-z0-9._-]{0,63}$') { continue }
      $new = "nopeeking:$oldName"
      if ([NoPeeking.Cred]::Exists($new)) { [Console]::Out.Write("kept`t$oldName`n"); continue }
      $secret = [NoPeeking.Cred]::GetSecret($old)
      if ($null -eq $secret) { continue }
      [NoPeeking.Cred]::Write($new, $secret, $line.Substring($tab + 1))
      # The old entry goes only once the new one reads back the same.
      if ([NoPeeking.Cred]::GetSecret($new) -ceq $secret) { [void][NoPeeking.Cred]::Delete($old) }
      $secret = $null
      [Console]::Out.Write("moved`t$oldName`n")
    }
  }
}
exit 0
