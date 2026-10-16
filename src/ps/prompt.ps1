# Shows the "save a secret" window on the PC and saves the result straight to Credential Manager.
# The value never leaves this process. stdin: {"comment","kind","site"}. Exit: 0 saved, 4 exists, 6 cancelled.
param([Parameter(Mandatory = $true)][string]$Name)
. "$PSScriptRoot\common.ps1"
$target = Get-Target $Name
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ([PassClaude.Cred]::Exists($target)) { exit 4 }

. "$PSScriptRoot\ui.ps1"
. "$PSScriptRoot\prompt-ui.ps1"
$ui = New-PromptWindow -Name $Name -Kind ([string]$req.kind) -Site ([string]$req.site)

# Nobody answered in 5 minutes: treat it as Cancel (the server stops waiting at 6).
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMinutes(5)
$timer.Add_Tick({ $ui.Window.DialogResult = $false })
$timer.Start()
$saved = Show-PcDialog $ui.Window
$timer.Stop()

if (-not $saved) { $ui.Clear(); exit 6 }
if ([PassClaude.Cred]::Exists($target)) { $ui.Clear(); exit 4 }  # saved elsewhere while the window was open: never overwrite
[PassClaude.Cred]::Write($target, $ui.Value(), [string]$req.comment)
$ui.Clear()
exit 0
