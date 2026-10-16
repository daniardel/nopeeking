# Shared WPF setup for passClaude's windows: brand colours (brand.xaml), the brand fonts from assets\fonts, shared
# styles (ui-styles.xaml), the padlock and the window icon. Dot-source it.
# Never put text from a request into XAML: load the markup, then set text on named elements, so nothing is parsed.
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml

$script:PcAssets = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\assets'))

# The server starts these scripts with a hidden console, and Windows then applies that "hide" to the first window the
# process shows. An explicit ShowWindow call once the window exists makes it visible.
Add-Type -Namespace PassClaude -Name Show -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ShowWindow(System.IntPtr hwnd, int cmd);
public static void Window(System.IntPtr hwnd) { ShowWindow(hwnd, 5); }
public static void WindowNoActivate(System.IntPtr hwnd) { ShowWindow(hwnd, 4); }
'@

# The padlock's faces, on the 64-unit grid of brand/logo/mark.svg.
$script:PcMouth = @{
  calm = 'M28.5 48q3.5 2.6 7 0'
  worried = 'M27.5 49.5q2.2-2.4 4.5 0t4.5 0'
  happy = 'M25.5 46.5q6.5 6 13 0'
}

function Get-PcFont([string]$Family) {
  $folder = New-Object Uri ((Join-Path $script:PcAssets 'fonts') + '\')
  # WPF names the static cuts after their optical size too, such as "DM Sans 14pt": match the start of the name.
  foreach ($found in [Windows.Media.Fonts]::GetFontFamilies($folder)) {
    # A new FontFamily, not the one found: the pipeline would hand WPF a PowerShell wrapper it can't use.
    if ($found.Source -like "./#$Family*") { return [Windows.Media.FontFamily]::new($folder, $found.Source) }
  }
  return [Windows.Media.FontFamily]::new('Segoe UI')
}

function Read-PcXaml([string]$Xaml) {
  return [Windows.Markup.XamlReader]::Parse($Xaml)
}

function New-PcResources {
  $resources = New-Object Windows.ResourceDictionary
  $resources['FontDisplay'] = Get-PcFont 'Bricolage Grotesque'
  $resources['FontBody'] = Get-PcFont 'DM Sans'
  $resources['FontMono'] = Get-PcFont 'JetBrains Mono'
  $resources.MergedDictionaries.Add((Read-PcXaml ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'brand.xaml')))))
  $resources.MergedDictionaries.Add((Read-PcXaml ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ui-styles.xaml')))))
  return $resources
}

# Markup for the padlock (64 x 64 units) to place inside a Viewbox. $MouthName names its mouth for Set-PcFace.
function Get-PcPadlockXaml([string]$Body = 'Violet', [string]$Shackle = 'Ink', [string]$Face = 'White', [string]$MouthName = '') {
  $name = if ($MouthName) { " x:Name=`"$MouthName`"" } else { '' }
  return @"
<Canvas Width="64" Height="64">
  <Path Data="M21 27V20a11 11 0 0 1 22 0v7" Stroke="{DynamicResource $Shackle}" StrokeThickness="6" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
  <Rectangle Canvas.Left="9" Canvas.Top="24" Width="46" Height="34" RadiusX="13" RadiusY="13" Fill="{DynamicResource $Body}"/>
  <Path Data="M20.5 39.5q4 4.5 8 0M35.5 39.5q4 4.5 8 0" Stroke="{DynamicResource $Face}" StrokeThickness="3.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
  <Path$name Data="$($script:PcMouth.calm)" Stroke="{DynamicResource $Face}" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
</Canvas>
"@
}

function Set-PcFace($Mouth, [string]$Mood) {
  $Mouth.Data = [Windows.Media.Geometry]::Parse($script:PcMouth[$Mood])
}

# Parses a window's markup and gives it the brand resources and the passClaude icon.
function New-PcWindow([string]$Xaml) {
  $window = Read-PcXaml $Xaml
  $window.Resources = New-PcResources
  $icon = Join-Path $script:PcAssets 'passclaude.ico'
  if (Test-Path -LiteralPath $icon) {
    $window.Icon = [Windows.Media.Imaging.BitmapFrame]::Create((New-Object Uri $icon))
  }
  return $window
}

# Shows a window as a dialog in front of everything and returns $true when it closed with DialogResult = $true.
function Show-PcDialog($Window) {
  $Window.Add_SourceInitialized({
      [PassClaude.Show]::Window((New-Object Windows.Interop.WindowInteropHelper $Window).Handle)
    }.GetNewClosure())
  $Window.Add_ContentRendered({ $Window.Activate() | Out-Null }.GetNewClosure())
  return [bool]$Window.ShowDialog()
}

# Draws a window's content to a PNG at $Scale x 96 dpi, laid out at the window's width, without showing anything.
function Save-PcPng($Window, [string]$Path, [double]$Scale = 1) {
  $Element = $Window.Content
  $available = if ([double]::IsNaN($Window.Width)) { [double]::PositiveInfinity } else { $Window.Width }
  $Element.Measure((New-Object Windows.Size $available, ([double]::PositiveInfinity)))
  # The window's width as on screen when it has one; DesiredSize includes the margin around the card.
  $size = if ([double]::IsNaN($Window.Width)) { $Element.DesiredSize } else { New-Object Windows.Size $Window.Width, $Element.DesiredSize.Height }
  $Element.Arrange((New-Object Windows.Rect (New-Object Windows.Point 0, 0), $size))
  $Element.UpdateLayout()
  $width = [int][Math]::Ceiling($size.Width * $Scale)
  $height = [int][Math]::Ceiling($size.Height * $Scale)
  $bitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap $width, $height, (96 * $Scale), (96 * $Scale), ([Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($Element)
  $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $stream = [IO.File]::Create($Path)
  try { $encoder.Save($stream) } finally { $stream.Dispose() }
}
