# Shows "Typed your <name> password" in the bottom-right corner for a few seconds, without taking focus.
# stdin: {"name","site"}. It never sees a secret.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
. "$PSScriptRoot\ui.ps1"
. "$PSScriptRoot\toast-ui.ps1"
$toast = New-ToastWindow -Name ([string]$req.name) -Site ([string]$req.site)
Show-PcToast $toast.Window
exit 0
