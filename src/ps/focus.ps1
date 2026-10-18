# Prints JSON for each Chrome window: [{"hwnd","url","foreground"}]. Never touches secrets.
. "$PSScriptRoot\common.ps1"
. "$PSScriptRoot\chromeui.ps1"

$fg = [NoPeeking.Win]::GetForegroundWindow()
$items = @()
foreach ($h in [NoPeeking.Win]::TopWindowsOfClass('Chrome_WidgetWin_1')) {
  if ([NoPeeking.Win]::ProcessName($h) -ne 'chrome') { continue }
  # Bubbles and popups (for example "Save password?") are owned by a browser window and are not browser windows.
  if ([NoPeeking.Win]::HasOwner($h)) { continue }
  $url = Get-AddressBarText $h
  if ($null -eq $url) { continue }
  $items += [pscustomobject]@{ hwnd = $h.ToInt64().ToString(); url = [string]$url; foreground = ($h -eq $fg) }
}
[Console]::Out.Write((ConvertTo-Json -InputObject @($items) -Compress -Depth 3))
exit 0
