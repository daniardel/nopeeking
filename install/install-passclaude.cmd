<# : passClaude installer. Double-click this file to add passClaude to Claude Code for your Windows user.
@echo off
rem All it runs is: claude mcp add --scope user passclaude -- npx -y passclaude
rem These first lines are a batch file that starts Windows PowerShell on the rest of this same file, which shows the
rem installer window. Everything below is plain text: open the file in Notepad to read it.
rem Full paths, and never look in the current folder for programs: a double-click starts this file in its own folder
rem (often Downloads), where a planted powershell.exe, cmd.exe, node.exe or claude.exe must never run.
set "NoDefaultCurrentDirectoryInExePath=1"
set "PASSCLAUDE_INSTALLER=%~f0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create([IO.File]::ReadAllText($env:PASSCLAUDE_INSTALLER)))"
exit /b %errorlevel%
#>

$ErrorActionPreference = 'Stop'
$Command = 'claude mcp add --scope user passclaude -- npx -y passclaude'
$NodeUrl = 'https://nodejs.org'
$ClaudeUrl = 'https://docs.claude.com/en/docs/claude-code/setup'
$HelpUrl = 'https://github.com/daniardel/passclaude#install'

function Test-NodeVersion([string]$Version) {
  if ($Version -match '^v?(\d+)\.') { return [int]$Matches[1] -ge 20 }
  return $false
}

function Get-NodeVersion {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return '' }
  try { return [string](& node -v 2>$null) } catch { return '' }
}

function Test-ClaudeInstalled { return [bool](Get-Command claude -ErrorAction SilentlyContinue) }

function Test-StepTimedOut([double]$StartedMs, [double]$NowMs) { return ($NowMs - $StartedMs) -gt 60000 }

# Starts a command through cmd.exe without a console window and returns the process; output is read asynchronously so
# a chatty command can never fill its pipe and hang.
function Start-Hidden([string]$CommandLine) {
  $info = New-Object Diagnostics.ProcessStartInfo (Join-Path $env:SystemRoot 'System32\cmd.exe'), "/d /c $CommandLine"
  $info.WorkingDirectory = $env:USERPROFILE  # not the download folder
  $info.CreateNoWindow = $true
  $info.UseShellExecute = $false
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($info)
  $null = $process.StandardOutput.ReadToEndAsync()
  $null = $process.StandardError.ReadToEndAsync()
  return $process
}

# Without WPF (rare: Windows Server Core), say the same things in the console.
function Install-InConsole {
  Write-Host ''
  Write-Host '  passClaude installer'
  Write-Host ''
  if (-not (Test-NodeVersion (Get-NodeVersion))) {
    Write-Host "  passClaude needs Node.js 20 or newer. Install the LTS version from $NodeUrl, then open this file again."
  } elseif (-not (Test-ClaudeInstalled)) {
    Write-Host "  Claude Code was not found. Install it first: $ClaudeUrl"
  } else {
    & cmd.exe /d /c 'claude mcp get passclaude >nul 2>nul'
    if ($LASTEXITCODE -eq 0) {
      Write-Host '  passClaude is already installed. If Claude Code does not show it, restart Claude Code.'
    } else {
      & cmd.exe /d /c $Command
      if ($LASTEXITCODE -eq 0) {
        Write-Host '  Done! Restart Claude Code, then try saying: "Save my Netflix password"'
      } else {
        Write-Host "  Something went wrong. Nothing was changed. You can also ask Claude: Run: $Command"
      }
    }
  }
  Write-Host ''
  Read-Host '  Press Enter to close this window' | Out-Null
}

try {
  Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Xaml
} catch {
  Install-InConsole
  return
}

$Xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Install passClaude" Width="560" SizeToContent="Height" WindowStyle="None" AllowsTransparency="True"
        Background="Transparent" ResizeMode="NoResize" WindowStartupLocation="CenterScreen" UseLayoutRounding="True"
        FontFamily="Segoe UI" Foreground="#17132E">
  <Window.Resources>
    <Style x:Key="Sticker" TargetType="Button">
      <Setter Property="Foreground" Value="#FFFFFF"/>
      <Setter Property="Background" Value="#5B2EFF"/>
      <Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="FontSize" Value="15"/>
      <Setter Property="MinHeight" Value="46"/>
      <Setter Property="Padding" Value="24,0"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="FocusVisualStyle" Value="{x:Null}"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Grid>
              <Border x:Name="Ring" CornerRadius="15" Margin="-5" BorderBrush="#C9BCFF" BorderThickness="3" Visibility="Collapsed"/>
              <Border CornerRadius="12" Background="#17132E" Margin="4,4,-4,-4"/>
              <Border x:Name="Face" CornerRadius="12" Background="{TemplateBinding Background}" BorderBrush="#17132E" BorderThickness="2"
                      Padding="{TemplateBinding Padding}">
                <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
            </Grid>
            <ControlTemplate.Triggers>
              <Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="Ring" Property="Visibility" Value="Visible"/></Trigger>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Face" Property="Background" Value="#3D17D6"/></Trigger>
              <Trigger Property="IsPressed" Value="True">
                <Setter TargetName="Face" Property="RenderTransform"><Setter.Value><TranslateTransform X="3" Y="3"/></Setter.Value></Setter>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="Plain" TargetType="Button">
      <Setter Property="Foreground" Value="#17132E"/>
      <Setter Property="Background" Value="#FFFFFF"/>
      <Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="FontSize" Value="15"/>
      <Setter Property="MinHeight" Value="46"/>
      <Setter Property="Padding" Value="20,0"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="FocusVisualStyle" Value="{x:Null}"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Grid>
              <Border x:Name="Ring" CornerRadius="15" Margin="-5" BorderBrush="#C9BCFF" BorderThickness="3" Visibility="Collapsed"/>
              <Border x:Name="Face" CornerRadius="12" Background="{TemplateBinding Background}" BorderBrush="#17132E" BorderThickness="2"
                      Padding="{TemplateBinding Padding}">
                <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
            </Grid>
            <ControlTemplate.Triggers>
              <Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="Ring" Property="Visibility" Value="Visible"/></Trigger>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Face" Property="Background" Value="#F3EFFF"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="LinkButton" TargetType="Button">
      <Setter Property="Foreground" Value="#3D17D6"/>
      <Setter Property="FontSize" Value="14"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <TextBlock x:Name="Text" Text="{TemplateBinding Content}" TextDecorations="Underline" Foreground="{TemplateBinding Foreground}"/>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Text" Property="Foreground" Value="#17132E"/></Trigger>
              <Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="Text" Property="Background" Value="#DCD3FF"/></Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>

  <Border Margin="32,24,32,40" CornerRadius="16" Background="#FFFFFF" BorderBrush="#2E17132E" BorderThickness="1">
    <Border.Effect><DropShadowEffect BlurRadius="40" ShadowDepth="12" Direction="270" Opacity="0.28" Color="#17132E"/></Border.Effect>
    <StackPanel>
      <Grid x:Name="Header" Background="#5B2EFF" Height="132">
        <Grid.Clip><RectangleGeometry Rect="0,0,496,140" RadiusX="15" RadiusY="15"/></Grid.Clip>
        <Ellipse Width="220" Height="220" Fill="#FFC92E" Opacity="0.18" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-90,-60,0"/>
        <Ellipse Width="320" Height="320" Stroke="#FFFFFF" StrokeThickness="2" Opacity="0.14" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-140,-110,0"/>
        <Button x:Name="CloseX" HorizontalAlignment="Right" VerticalAlignment="Top" Width="46" Height="40" Cursor="Hand" Focusable="False"
                AutomationProperties.Name="Close">
          <Button.Template>
            <ControlTemplate TargetType="Button">
              <Border x:Name="Face" Background="Transparent" CornerRadius="0,15,0,0">
                <Path Data="M1 1L11 11M11 1L1 11" Stroke="#FFFFFF" StrokeThickness="1.4" Width="12" Height="12" HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
              <ControlTemplate.Triggers>
                <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Face" Property="Background" Value="#3D17D6"/></Trigger>
              </ControlTemplate.Triggers>
            </ControlTemplate>
          </Button.Template>
        </Button>
        <StackPanel Orientation="Horizontal" VerticalAlignment="Center" Margin="28,8,0,0">
          <Border Width="72" Height="72" CornerRadius="20" Background="#FFC92E" BorderBrush="#17132E" BorderThickness="2">
            <Viewbox Width="52" Height="52">
              <Canvas Width="64" Height="64">
                <Path Data="M21 27V20a11 11 0 0 1 22 0v7" Stroke="#17132E" StrokeThickness="6" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
                <Rectangle Canvas.Left="9" Canvas.Top="24" Width="46" Height="34" RadiusX="13" RadiusY="13" Fill="#5B2EFF"/>
                <Path Data="M20.5 39.5q4 4.5 8 0M35.5 39.5q4 4.5 8 0" Stroke="#FFFFFF" StrokeThickness="3.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
                <Path x:Name="Mouth" Data="M28.5 48q3.5 2.6 7 0" Stroke="#FFFFFF" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
              </Canvas>
            </Viewbox>
          </Border>
          <StackPanel Margin="18,0,0,0" VerticalAlignment="Center">
            <TextBlock x:Name="Heading" Text="Install passClaude" FontFamily="Segoe UI Black" FontSize="28" Foreground="#FFFFFF"/>
            <TextBlock Text="For Windows &#183; free and open source" FontSize="14" Foreground="#E4DCFF" Margin="0,2,0,0"/>
          </StackPanel>
        </StackPanel>
      </Grid>

      <StackPanel Margin="28,22,28,26">
        <StackPanel x:Name="Rows"/>

        <Border x:Name="DonePanel" Margin="0,18,0,0" Padding="16,14" CornerRadius="14" Background="#F3EFFF" Visibility="Collapsed">
          <StackPanel>
            <TextBlock x:Name="DoneTitle" FontFamily="Segoe UI Black" FontSize="20"/>
            <TextBlock x:Name="DoneText" FontSize="14" Foreground="#4A4370" Margin="0,4,0,8" TextWrapping="Wrap"/>
            <Border x:Name="TryPill" HorizontalAlignment="Left" Padding="12,6" CornerRadius="16" Background="#FFC92E" BorderBrush="#17132E" BorderThickness="2">
              <TextBlock Text="&#8220;Save my Netflix password&#8221;" FontWeight="Bold" FontSize="14"/>
            </Border>
          </StackPanel>
        </Border>

        <Border x:Name="ProblemPanel" Margin="0,18,0,0" Padding="16,14" CornerRadius="14" Background="#1FE5432A" BorderBrush="#E5432A"
                BorderThickness="2" Visibility="Collapsed">
          <StackPanel>
            <TextBlock x:Name="ProblemTitle" FontWeight="Bold" FontSize="15" TextWrapping="Wrap"/>
            <TextBlock x:Name="ProblemText" FontSize="14" Margin="0,4,0,0" TextWrapping="Wrap"/>
            <TextBox x:Name="ProblemCommand" Margin="0,8,0,0" IsReadOnly="True" BorderThickness="0" Background="#FFFFFF" Padding="8,6"
                     FontFamily="Consolas" FontSize="13" TextWrapping="Wrap" Visibility="Collapsed"/>
          </StackPanel>
        </Border>

        <Grid Margin="0,24,4,4">
          <Button x:Name="HelpLink" Content="What does this change?" Style="{StaticResource LinkButton}" HorizontalAlignment="Left" VerticalAlignment="Center"/>
          <StackPanel Orientation="Horizontal" HorizontalAlignment="Right">
            <Button x:Name="CloseButton" Content="Close" Style="{StaticResource Plain}"/>
            <Button x:Name="ActionButton" Content="Add passClaude" Style="{StaticResource Sticker}" Margin="12,0,0,0" IsDefault="True"/>
          </StackPanel>
        </Grid>
      </StackPanel>
    </StackPanel>
  </Border>
</Window>
'@

$RowXaml = @'
<Grid xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" Margin="0,0,0,12">
  <Grid.ColumnDefinitions><ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
  <Border Name="Dot" Width="26" Height="26" CornerRadius="13" BorderBrush="#17132E" BorderThickness="2">
    <Path Name="Icon" Width="14" Height="14" Stretch="Uniform" Stroke="#FFFFFF" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
  </Border>
  <TextBlock Grid.Column="1" Margin="12,0,0,0" VerticalAlignment="Center" FontSize="15">
    <Run Name="Label" FontWeight="Bold"/><Run Name="Detail" Foreground="#4A4370"/>
  </TextBlock>
  <StackPanel Grid.Column="2" Orientation="Horizontal" VerticalAlignment="Center">
    <TextBlock Name="Status" FontSize="14" Foreground="#4A4370" VerticalAlignment="Center"/>
  </StackPanel>
</Grid>
'@

$Icons = @{ ok = 'M5 12.5l4.5 4.5L19 7.5'; missing = 'M6 6L18 18M18 6L6 18'; waiting = 'M6 12h0.01M12 12h0.01M18 12h0.01' }
$Fills = @{ ok = '#0E9F6E'; missing = '#E5432A'; waiting = '#C9BCFF' }
$Mouths = @{ calm = 'M28.5 48q3.5 2.6 7 0'; worried = 'M27.5 49.5q2.2-2.4 4.5 0t4.5 0'; happy = 'M25.5 46.5q6.5 6 13 0' }

function New-InstallerWindow {
  $window = [Windows.Markup.XamlReader]::Parse($Xaml)
  $ui = @{ Window = $window; RowParts = @{} }
  foreach ($n in 'Rows', 'Mouth', 'Heading', 'DonePanel', 'DoneTitle', 'DoneText', 'TryPill', 'ProblemPanel', 'ProblemTitle', 'ProblemText',
    'ProblemCommand', 'HelpLink', 'CloseButton', 'ActionButton', 'CloseX', 'Header') {
    $ui[$n] = $window.FindName($n)
  }
  foreach ($row in @(@('node', 'Node.js', ' 20 or newer'), @('claude', 'Claude Code', ''), @('add', 'Add passClaude', ' to Claude Code'))) {
    $grid = [Windows.Markup.XamlReader]::Parse($RowXaml)
    $ui['Rows'].Children.Add($grid) | Out-Null
    $parts = @{ Dot = $grid.FindName('Dot'); Icon = $grid.FindName('Icon'); Status = $grid.FindName('Status') }
    $grid.FindName('Label').Text = $row[1]
    $grid.FindName('Detail').Text = $row[2]
    $ui.RowParts[$row[0]] = $parts
  }
  return $ui
}

function Set-Row($Ui, [string]$Row, [string]$State, [string]$Status) {
  $parts = $Ui.RowParts[$Row]
  $parts.Dot.Background = [Windows.Media.BrushConverter]::new().ConvertFromString($Fills[$State])
  $parts.Icon.Data = [Windows.Media.Geometry]::Parse($Icons[$State])
  $parts.Icon.Stroke = if ($State -eq 'waiting') { [Windows.Media.Brushes]::Transparent } else { [Windows.Media.Brushes]::White }
  $parts.Status.Text = $Status
}

function Set-Mouth($Ui, [string]$Mood) { $Ui.Mouth.Data = [Windows.Media.Geometry]::Parse($Mouths[$Mood]) }

# Each screen sets everything it shows, so any screen can follow any other.
function Show-Screen($Ui, [string]$Screen) {
  $Ui.DonePanel.Visibility = 'Collapsed'
  $Ui.ProblemPanel.Visibility = 'Collapsed'
  $Ui.ProblemCommand.Visibility = 'Collapsed'
  $Ui.ActionButton.Visibility = 'Visible'
  $Ui.ActionButton.IsEnabled = $true
  $Ui.CloseButton.Content = 'Close'
  $Ui.Heading.Text = 'Install passClaude'
  Set-Mouth $Ui 'calm'
  switch ($Screen) {
    'checking' {
      foreach ($r in 'node', 'claude', 'add') { Set-Row $Ui $r 'waiting' 'Checking...' }
      Set-Row $Ui 'add' 'waiting' ''
      $Ui.ActionButton.IsEnabled = $false
    }
    'ready' {
      Set-Row $Ui 'node' 'ok' 'Found'; Set-Row $Ui 'claude' 'ok' 'Found'; Set-Row $Ui 'add' 'waiting' 'Ready'
      $Ui.ActionButton.Content = 'Add passClaude'
    }
    'missing-node' {
      Set-Row $Ui 'node' 'missing' 'Not found'; Set-Row $Ui 'claude' 'waiting' ''; Set-Row $Ui 'add' 'waiting' ''
      Show-Problem $Ui 'passClaude needs Node.js 20 or newer.' 'Install the LTS version from nodejs.org, then open this file again.'
      $Ui.ActionButton.Content = 'Get Node.js'
    }
    'missing-claude' {
      Set-Row $Ui 'node' 'ok' 'Found'; Set-Row $Ui 'claude' 'missing' 'Not found'; Set-Row $Ui 'add' 'waiting' ''
      Show-Problem $Ui 'Claude Code was not found.' 'Install Claude Code first, then open this file again.'
      $Ui.ActionButton.Content = 'Get Claude Code'
    }
    'working' {
      Set-Row $Ui 'node' 'ok' 'Found'; Set-Row $Ui 'claude' 'ok' 'Found'; Set-Row $Ui 'add' 'waiting' 'Adding...'
      $Ui.ActionButton.Content = 'Adding...'
      $Ui.ActionButton.IsEnabled = $false
    }
    'done' {
      Set-Row $Ui 'node' 'ok' 'Found'; Set-Row $Ui 'claude' 'ok' 'Found'; Set-Row $Ui 'add' 'ok' 'Done'
      $Ui.Heading.Text = "You're all set."
      $Ui.DoneTitle.Text = 'passClaude is installed.'
      $Ui.DoneText.Text = 'Restart Claude Code, then try saying:'
      $Ui.DonePanel.Visibility = 'Visible'
      $Ui.ActionButton.Visibility = 'Collapsed'
      Set-Mouth $Ui 'happy'
    }
    'already' {
      Set-Row $Ui 'node' 'ok' 'Found'; Set-Row $Ui 'claude' 'ok' 'Found'; Set-Row $Ui 'add' 'ok' 'Already added'
      $Ui.Heading.Text = "You're all set."
      $Ui.DoneTitle.Text = 'passClaude is already installed.'
      $Ui.DoneText.Text = "If Claude Code doesn't show it, restart Claude Code. Then try saying:"
      $Ui.DonePanel.Visibility = 'Visible'
      $Ui.ActionButton.Visibility = 'Collapsed'
      Set-Mouth $Ui 'happy'
    }
    'failed' {
      Set-Row $Ui 'node' 'ok' 'Found'; Set-Row $Ui 'claude' 'ok' 'Found'; Set-Row $Ui 'add' 'missing' 'Failed'
      Show-Problem $Ui 'Something went wrong. Nothing was changed.' 'You can try again, or open Claude Code and ask it to run:'
      $Ui.ProblemCommand.Text = $Command
      $Ui.ProblemCommand.Visibility = 'Visible'
      $Ui.ActionButton.Content = 'Try again'
    }
  }
}

function Show-Problem($Ui, [string]$Title, [string]$Text) {
  $Ui.ProblemTitle.Text = $Title
  $Ui.ProblemText.Text = $Text
  $Ui.ProblemPanel.Visibility = 'Visible'
  Set-Mouth $Ui 'worried'
}

function Save-WindowPng($Window, [string]$Path) {
  $content = $Window.Content
  $content.Measure((New-Object Windows.Size $Window.Width, ([double]::PositiveInfinity)))
  $size = New-Object Windows.Size $Window.Width, $content.DesiredSize.Height  # the full window width, as on screen
  $content.Arrange((New-Object Windows.Rect (New-Object Windows.Point 0, 0), $size))
  $content.UpdateLayout()
  $bitmap = New-Object Windows.Media.Imaging.RenderTargetBitmap ([int]($size.Width * 2)), ([int]($size.Height * 2)), 192, 192, ([Windows.Media.PixelFormats]::Pbgra32)
  $bitmap.Render($content)
  $encoder = New-Object Windows.Media.Imaging.PngBitmapEncoder
  $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $stream = [IO.File]::Create($Path)
  try { $encoder.Save($stream) } finally { $stream.Dispose() }
}

# Test mode (used by passClaude's own tests): draw every screen into the folder and change nothing.
if ($env:PASSCLAUDE_INSTALLER_TEST) {
  $screens = 'checking', 'ready', 'missing-node', 'missing-claude', 'working', 'done', 'already', 'failed'
  foreach ($screen in $screens) {
    $ui = New-InstallerWindow
    Show-Screen $ui $screen
    Save-WindowPng $ui.Window (Join-Path $env:PASSCLAUDE_INSTALLER_TEST "installer-$screen.png")
  }
  $versions = [ordered]@{}
  foreach ($v in 'v18.19.0', 'v19.9.0', 'v20.0.0', 'v22.11.0', 'v100.1.0', '', 'garbage') { $versions[$v] = Test-NodeVersion $v }
  $timedOut = [ordered]@{ '59s' = (Test-StepTimedOut 0 59000); '61s' = (Test-StepTimedOut 0 61000) }
  [pscustomobject]@{ screens = $screens; command = $Command; nodeVersions = $versions; stepTimedOut = $timedOut } | ConvertTo-Json -Compress
  return
}

try {
  $ui = New-InstallerWindow
  $state = @{ Screen = 'checking'; Process = $null; Next = $null; Started = 0 }
  $timer = New-Object Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(150)
  $now = { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

  # Anything unexpected ends on the "failed" screen, never on a window stuck at "Checking..." or "Adding...".
  function Invoke-Safely([scriptblock]$Work) {
    try { & $Work } catch { $timer.Stop(); $state.Screen = 'failed'; Show-Screen $ui 'failed' }
  }

  # One step at a time: start a hidden command, and when it ends hand its exit code to the next step. A command that
  # hangs is stopped after 60 seconds and counts as failed.
  function Wait-ForProcess([scriptblock]$Then) {
    $state.Next = $Then
    $state.Started = & $now
    $timer.Start()
  }
  $timer.Add_Tick({
      Invoke-Safely {
        if (-not $state.Process) { return }
        if ($state.Process.HasExited) {
          $code = $state.Process.ExitCode
        } elseif (Test-StepTimedOut $state.Started (& $now)) {
          try { $state.Process.Kill() } catch {}
          $code = -1
        } else {
          return
        }
        $timer.Stop()
        $state.Process = $null
        & $state.Next $code
      }
    })

  function Start-Checks {
    Show-Screen $ui 'checking'
    $ui.Window.Dispatcher.Invoke([action] {}, 'Render')  # paint "Checking..." before the checks run
    if (-not (Test-NodeVersion (Get-NodeVersion))) { $state.Screen = 'missing-node'; Show-Screen $ui 'missing-node'; return }
    if (-not (Test-ClaudeInstalled)) { $state.Screen = 'missing-claude'; Show-Screen $ui 'missing-claude'; return }
    Set-Row $ui 'node' 'ok' 'Found'
    Set-Row $ui 'claude' 'ok' 'Found'
    $state.Process = Start-Hidden 'claude mcp get passclaude'
    Wait-ForProcess { param($code) if ($code -eq 0) { $state.Screen = 'already' } else { $state.Screen = 'ready' }; Show-Screen $ui $state.Screen }
  }

  function Start-Install {
    $state.Screen = 'working'
    Show-Screen $ui 'working'
    $state.Process = Start-Hidden $Command
    Wait-ForProcess { param($code) if ($code -eq 0) { $state.Screen = 'done' } else { $state.Screen = 'failed' }; Show-Screen $ui $state.Screen }
  }

  $ui.ActionButton.Add_Click({
      Invoke-Safely {
        switch ($state.Screen) {
          'missing-node' { Start-Process $NodeUrl }
          'missing-claude' { Start-Process $ClaudeUrl }
          default { Start-Install }
        }
      }
    })
  $ui.HelpLink.Add_Click({ Invoke-Safely { Start-Process $HelpUrl } })
  $ui.CloseButton.Add_Click({ $ui.Window.Close() })
  $ui.CloseX.Add_Click({ $ui.Window.Close() })
  $ui.Header.Add_MouseLeftButtonDown({ $ui.Window.DragMove() })
  $ui.Window.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Escape') { $ui.Window.Close() } })
  $ui.Window.Add_ContentRendered({ $ui.Window.Activate() | Out-Null; Invoke-Safely { Start-Checks } })

  # The window is ready: hide the empty console behind it. If this fails the console simply stays.
  try {
    Add-Type -Namespace PassClaude -Name Console -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hwnd, int cmd);
'@
    $null = [PassClaude.Console]::ShowWindow([PassClaude.Console]::GetConsoleWindow(), 0)
  } catch {}
  $null = $ui.Window.ShowDialog()
} catch {
  # The window itself could not be built: say so in the console instead of closing without a word.
  Write-Host ''
  Write-Host "  The installer window could not open ($($_.Exception.Message))."
  Install-InConsole
}
