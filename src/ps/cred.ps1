# Credential Manager access for passClaude entries.
# Usage: cred.ps1 list | meta <name> | get <name> | put <name> (stdin: {"comment","value"}) | delete <name>
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
    $req = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ([PassClaude.Cred]::Exists($target)) { exit 4 }
    if ([Text.Encoding]::Unicode.GetByteCount([string]$req.value) -gt [PassClaude.Cred]::MAX_BLOB_BYTES) { exit 5 }
    [PassClaude.Cred]::Write($target, [string]$req.value, [string]$req.comment)
  }
  'delete' {
    if (-not [PassClaude.Cred]::Delete((Get-Target $Name))) { exit 3 }
  }
}
exit 0
