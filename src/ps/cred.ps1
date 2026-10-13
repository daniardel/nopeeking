# Credential Manager access for passClaude entries.
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
    foreach ($line in [PassClaude.Cred]::List('passclaude:*')) { [Console]::Out.Write("$line`n") }
  }
  'meta' {
    $comment = [PassClaude.Cred]::GetComment((Get-Target $Name))
    if ($null -eq $comment) { exit 3 }
    [Console]::Out.Write($comment)
  }
  'get' {
    $secret = [PassClaude.Cred]::GetSecret((Get-Target $Name))
    if ($null -eq $secret) { exit 3 }
    [Console]::Out.Write($secret)
  }
  'put' {
    $target = Get-Target $Name
    # Read with .NET calls only, never a cmdlet: PowerShell module logging can record the parameters a cmdlet receives.
    $comment = [Console]::In.ReadLine()
    $value = [Console]::In.ReadToEnd()
    if ([PassClaude.Cred]::Exists($target)) { exit 4 }
    if ([Text.Encoding]::Unicode.GetByteCount($value) -gt [PassClaude.Cred]::MAX_BLOB_BYTES) { exit 5 }
    [PassClaude.Cred]::Write($target, $value, $comment)
  }
  'delete' {
    if (-not [PassClaude.Cred]::Delete((Get-Target $Name))) { exit 3 }
  }
}
exit 0
