# Credential Manager access for NoPeeking entries.
# Usage: cred.ps1 list | meta <name> | get <name> | put <name> | delete <name>
# put reads stdin: the comment (metadata JSON) on the first line, then the value, exactly, after the first newline.
# Exit codes: 0 ok, 3 not found, 4 already exists, 5 too long.
param(
  [Parameter(Mandatory = $true)][ValidateSet('list', 'meta', 'get', 'put', 'delete')][string]$Op,
  [string]$Name
)
. "$PSScriptRoot\common.ps1"

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
}
exit 0
