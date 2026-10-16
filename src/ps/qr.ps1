# Shows a phone link as a QR code to scan, until the link expires, the user closes it, or the server stops it once the
# secret has arrived. stdin: {"name","kind","expiresAt","path","modules"}. It never sees a secret,
# nor the link: the code arrives already drawn.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
. "$PSScriptRoot\ui.ps1"
. "$PSScriptRoot\qr-ui.ps1"
$qr = New-QrWindow -Name ([string]$req.name) -Kind ([string]$req.kind) -PathData ([string]$req.path) -Modules ([int]$req.modules) -ExpiresAt ([double]$req.expiresAt)
$null = Show-PcDialog $qr.Window
exit 0
