# Chrome helpers using UI Automation: read a window's address bar, check the focused element.
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$CT = [System.Windows.Automation.ControlType]
$Descendants = [System.Windows.Automation.TreeScope]::Descendants

function Test-InsideDocument($Element) {
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $node = $walker.GetParent($Element)
  while ($node) {
    if ($node.Current.ControlType -eq $CT::Document) { return $true }
    $node = $walker.GetParent($node)
  }
  return $false
}

# Text in the address bar of a Chrome window, or $null if it cannot be found.
function Get-AddressBarText([IntPtr]$Hwnd) {
  try {
    $root = $AE::FromHandle($Hwnd)
    $isEdit = [System.Windows.Automation.PropertyCondition]::new($AE::ControlTypeProperty, $CT::Edit)
    $named = [System.Windows.Automation.PropertyCondition]::new($AE::NameProperty, 'Address and search bar')
    $both = [System.Windows.Automation.AndCondition]::new([System.Windows.Automation.Condition[]]@($isEdit, $named))
    $edit = $root.FindFirst($Descendants, $both)
    # Never read a password box, whatever it is called, or a box in the web page that only calls itself the address bar
    # (with aria-label, say). In non-English Chrome the real one has another name, so the page's would be the only match.
    if ($edit -and ($edit.Current.IsPassword -or (Test-InsideDocument $edit))) { $edit = $null }
    if (-not $edit) {
      # Non-English Chrome: the first edit box that is neither a password box nor inside the web page is the address bar.
      foreach ($candidate in $root.FindAll($Descendants, $isEdit)) {
        if ($candidate.Current.IsPassword) { continue }
        if (Test-InsideDocument $candidate) { continue }
        $edit = $candidate
        break
      }
    }
    if (-not $edit) { return $null }
    return $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
  } catch {
    return $null
  }
}

# True if keyboard focus is on a password box in the window's process.
function Test-FocusIsPassword([IntPtr]$Hwnd) {
  $windowPid = [PassClaude.Win]::ProcessId($Hwnd)
  for ($i = 0; $i -lt 5; $i++) {
    try {
      $focused = $AE::FocusedElement
      if ($focused -and $focused.Current.IsPassword -and $focused.Current.ProcessId -eq $windowPid) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 200
  }
  return $false
}
