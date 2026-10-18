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

# The password box that has keyboard focus in the window's process, or $null.
function Get-FocusedPassword([IntPtr]$Hwnd) {
  $windowPid = [NoPeeking.Win]::ProcessId($Hwnd)
  for ($i = 0; $i -lt 5; $i++) {
    try {
      $focused = $AE::FocusedElement
      if ($focused -and $focused.Current.IsPassword -and $focused.Current.ProcessId -eq $windowPid) { return $focused }
    } catch { }
    Start-Sleep -Milliseconds 200
  }
  return $null
}

# True while keyboard focus is still on this same box.
function Test-StillFocused($Box) {
  try {
    $focused = $AE::FocusedElement
    return [bool]($focused -and $focused.Current.IsPassword -and [System.Windows.Automation.Automation]::Compare($focused, $Box))
  } catch {
    return $false
  }
}

# Full address of the page or frame an element is in: Chrome gives each Document its address as its value, scheme included,
# which the address bar hides. A frame with no address of its own (about:blank, about:srcdoc) belongs to the one around it.
function Get-FrameUrl($Element) {
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  try {
    $node = $walker.GetParent($Element)
    while ($node) {
      if ($node.Current.ControlType -eq $CT::Document) {
        $value = $null
        try { $value = $node.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { }
        if ($value -match '^[a-z][a-z0-9+.-]*://') { return [string]$value }
      }
      $node = $walker.GetParent($node)
    }
  } catch { }
  return $null
}

# OK if a frame address is safe to type a password for the site into, otherwise the refusal code: PAGE_UNKNOWN when there is
# no address, NOT_HTTPS for a page that is not encrypted (plain http is allowed only for this PC itself), OTHER_FRAME for a
# box that belongs to another site.
function Test-FrameUrl([string]$Url, [string]$Site) {
  $uri = $null
  if (-not $Url -or -not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$uri)) { return 'PAGE_UNKNOWN' }
  $hostName = $uri.Host.ToLowerInvariant().TrimEnd('.')
  $local = $hostName -eq 'localhost' -or $hostName -eq '127.0.0.1' -or $hostName -eq '[::1]'
  if ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $local)) { return 'NOT_HTTPS' }
  if ($hostName -ne $Site -and -not $hostName.EndsWith(".$Site")) { return 'OTHER_FRAME' }
  return 'OK'
}
