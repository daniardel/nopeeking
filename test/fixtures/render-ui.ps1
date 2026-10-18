# Test helper: builds NoPeeking's WPF windows without showing them, draws each state to a PNG in -Out, and prints
# one JSON line describing what it found. Nothing here touches Credential Manager.
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\..\src\ps\ui.ps1"
. "$PSScriptRoot\..\..\src\ps\prompt-ui.ps1"
. "$PSScriptRoot\..\..\src\ps\toast-ui.ps1"

$web = New-PromptWindow -Name 'netflix' -Kind 'web' -Site 'netflix.com'
Save-PcPng $web.Window (Join-Path $Out 'prompt-web.png') 2

$command = New-PromptWindow -Name 'gh-token' -Kind 'command' -Site ''
Save-PcPng $command.Window (Join-Path $Out 'prompt-command.png') 2

# Text that would break XAML if it were ever pasted into the markup instead of set on a control.
$odd = New-PromptWindow -Name 'a.b' -Kind 'web' -Site 'ex&<am>"ple.com'
$oddSite = $odd.Window.FindName('Site').Text

$mismatch = New-PromptWindow -Name 'netflix' -Kind 'web' -Site 'netflix.com'
$mismatch.Window.FindName('First').Password = 'correct horse'
$mismatch.Window.FindName('Second').Password = 'correct horsf'
$mismatchError = $mismatch.TrySave()
Save-PcPng $mismatch.Window (Join-Path $Out 'prompt-error.png') 2

# "Show what I typed" and back must keep exactly what was typed, in both boxes. The u-umlaut is built in code because
# Windows PowerShell reads a script file without a byte order mark as ANSI.
$typed = 'Spike-"Test"-$1-' + [char]0x00FC
$toggle = New-PromptWindow -Name 'netflix' -Kind 'web' -Site 'netflix.com'
$toggle.Window.FindName('First').Password = $typed
$toggle.Window.FindName('Second').Password = $typed
$toggle.Window.FindName('Show').IsChecked = $true
$shownText = $toggle.Window.FindName('FirstShown').Text
Save-PcPng $toggle.Window (Join-Path $Out 'prompt-shown.png') 2
$toggle.Window.FindName('Show').IsChecked = $false
$okAfterToggle = ($null -eq $toggle.TrySave()) -and ($toggle.Value() -ceq $typed)

$toast = New-ToastWindow -Name 'netflix' -Site 'netflix.com'
Save-PcPng $toast.Window (Join-Path $Out 'toast.png') 2

[pscustomobject]@{
  display = $web.Window.Resources['FontDisplay'].Source
  body = $web.Window.Resources['FontBody'].Source
  mono = $web.Window.Resources['FontMono'].Source
  webTitle = $web.Window.FindName('Heading').Text
  commandTitle = $command.Window.FindName('Heading').Text
  oddSite = $oddSite
  mismatchError = $mismatchError
  errorShown = ($mismatch.Window.FindName('ErrorBox').Visibility -eq 'Visible')
  shownText = ($shownText -ceq $typed)
  okAfterToggle = $okAfterToggle
  toastTitle = $toast.Window.FindName('Title').Text
  toastDetail = $toast.Window.FindName('Detail').Text
  toastTakesFocus = [bool]$toast.Window.ShowActivated
  toastTopmost = [bool]$toast.Window.Topmost
  toastInTaskbar = [bool]$toast.Window.ShowInTaskbar
} | ConvertTo-Json -Compress
