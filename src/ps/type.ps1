# Types a saved secret into the focused password box of one Chrome window, after re-checking everything.
# stdin: {"name","hwnd","url"}. Prints TYPED or a refusal code. The secret never leaves this process.
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\chromeui.ps1"

$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
$target = Get-Target ([string]$req.name)
$hwnd = [IntPtr][long]$req.hwnd

if (-not [NoPeeking.Win]::Activate($hwnd)) { [Console]::Out.Write('NO_FOCUS'); exit 7 }
if ((Get-AddressBarText $hwnd) -cne [string]$req.url) { [Console]::Out.Write('URL_CHANGED'); exit 7 }
if (-not (Test-FocusIsPassword $hwnd)) { [Console]::Out.Write('NOT_PASSWORD_FIELD'); exit 7 }
# The focus check can take a second: make sure the page is still the one that was approved.
if ((Get-AddressBarText $hwnd) -cne [string]$req.url) { [Console]::Out.Write('URL_CHANGED'); exit 7 }

$secret = [NoPeeking.Cred]::GetSecret($target)
if ($null -eq $secret) { [Console]::Out.Write('NOT_FOUND'); exit 3 }
$ok = [NoPeeking.Keys]::TypeText($secret, $hwnd)
$secret = $null
if (-not $ok) { [Console]::Out.Write('INTERRUPTED'); exit 7 }
[Console]::Out.Write('TYPED')
exit 0
