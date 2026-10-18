# Types a saved secret into the focused password box of one Chrome window, after re-checking everything.
# stdin: {"name","hwnd","url","site"}. Prints TYPED or a refusal code. The secret never leaves this process.
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\chromeui.ps1"

$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
$target = Get-Target ([string]$req.name)
$hwnd = [IntPtr][long]$req.hwnd

if (-not [NoPeeking.Win]::Activate($hwnd)) { [Console]::Out.Write('NO_FOCUS'); exit 7 }
if ((Get-AddressBarText $hwnd) -cne [string]$req.url) { [Console]::Out.Write('URL_CHANGED'); exit 7 }
$box = Get-FocusedPassword $hwnd
if (-not $box) { [Console]::Out.Write('NOT_PASSWORD_FIELD'); exit 7 }
# The address bar hides the scheme and shows only the top page: the box's own frame must be https and on the locked site.
$frame = Test-FrameUrl (Get-FrameUrl $box) ([string]$req.site)
if ($frame -ne 'OK') { [Console]::Out.Write($frame); exit 7 }
# The focus check can take a second: make sure the page is still the one that was approved.
if ((Get-AddressBarText $hwnd) -cne [string]$req.url) { [Console]::Out.Write('URL_CHANGED'); exit 7 }

$secret = [NoPeeking.Cred]::GetSecret($target)
if ($null -eq $secret) { [Console]::Out.Write('NOT_FOUND'); exit 3 }
$result = 'TYPED'
# Focus is checked again before every character (about 15 ms each), so if the page moves it, no character lands anywhere else.
for ($i = 0; $i -lt $secret.Length; $i++) {
  if ($i -gt 0 -and -not (Test-StillFocused $box)) { $result = 'FOCUS_MOVED'; break }
  if (-not [NoPeeking.Keys]::TypeText($secret, $i, 1, $hwnd)) { $result = 'INTERRUPTED'; break }
}
$secret = $null
[Console]::Out.Write($result)
if ($result -ne 'TYPED') { exit 7 }
exit 0
