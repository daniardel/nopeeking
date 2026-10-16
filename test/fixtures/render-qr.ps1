# Test helper: builds the QR window from a request file (what the server sends on stdin) without showing it, draws it
# to qr.png in -Out, and prints one JSON line describing it.
param([Parameter(Mandatory = $true)][string]$Out, [Parameter(Mandatory = $true)][string]$Request)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\..\src\ps\ui.ps1"
. "$PSScriptRoot\..\..\src\ps\qr-ui.ps1"
$req = [IO.File]::ReadAllText($Request) | ConvertFrom-Json
$qr = New-QrWindow -Name ([string]$req.name) -Kind ([string]$req.kind) -PathData ([string]$req.path) -Modules ([int]$req.modules) -ExpiresAt ([double]$req.expiresAt)
Save-PcPng $qr.Window (Join-Path $Out 'qr.png') 2
[pscustomobject]@{
  heading = $qr.Window.FindName('Heading').Text
  what = $qr.Window.FindName('What').Text + ' ' + $qr.Window.FindName('SecretName').Text + ' ' + $qr.Window.FindName('Kind').Text
  countdown = $qr.Window.FindName('Countdown').Text
} | ConvertTo-Json -Compress
