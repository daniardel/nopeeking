# Builds the window that shows a phone link as a QR code. qr.ps1 shows it; test/fixtures/render-qr.ps1 draws it.
# Dot-source ui.ps1 first. The code arrives ready-made as path data (src/qr.js), so this file never parses the link.

function Format-Countdown([double]$ExpiresAt) {
  $left = [Math]::Max(0, [Math]::Ceiling(($ExpiresAt - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) / 1000))
  return 'Expires in {0}:{1:00}' -f [Math]::Floor($left / 60), ($left % 60)
}

function New-QrWindow([string]$Name, [string]$Kind, [string]$PathData, [int]$Modules, [double]$ExpiresAt) {
  $smallPadlock = Get-PcPadlockXaml
  $window = New-PcWindow @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="passClaude" Width="456" SizeToContent="Height" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="NoResize" WindowStartupLocation="CenterScreen" Topmost="True" ShowInTaskbar="True"
        FontFamily="{DynamicResource FontBody}" Foreground="{DynamicResource Ink}" UseLayoutRounding="True">
  <Border Margin="32,24,32,40" CornerRadius="14" Background="{DynamicResource White}" BorderBrush="#2E17132E" BorderThickness="1">
    <Border.Effect>
      <DropShadowEffect BlurRadius="40" ShadowDepth="12" Direction="270" Opacity="0.28" Color="#17132E"/>
    </Border.Effect>
    <StackPanel>
      <Grid x:Name="TitleBar" Height="40" Background="Transparent">
        <StackPanel Orientation="Horizontal" VerticalAlignment="Center" Margin="14,0,0,0">
          <Viewbox Width="16" Height="16">$smallPadlock</Viewbox>
          <TextBlock Text="passClaude" FontSize="12" FontWeight="Medium" Margin="8,0,0,0" VerticalAlignment="Center"/>
        </StackPanel>
        <Button x:Name="CloseX" Style="{DynamicResource TitleCloseButton}" HorizontalAlignment="Right" AutomationProperties.Name="Close"/>
      </Grid>
      <StackPanel Margin="28,6,28,28">
        <TextBlock x:Name="Heading" Text="Scan with your phone" FontFamily="{DynamicResource FontDisplay}" FontWeight="ExtraBold" FontSize="26"/>
        <TextBlock FontSize="15" Foreground="{DynamicResource Muted}" Margin="0,4,0,0">
          <Run x:Name="What" Text="to save your"/> <Run x:Name="SecretName" FontWeight="Bold" Foreground="{DynamicResource Ink}"/> <Run x:Name="Kind"/>
        </TextBlock>
        <Grid HorizontalAlignment="Center" Margin="0,20,6,6">
          <Border CornerRadius="20" Background="{DynamicResource Ink}" Margin="6,6,-6,-6"/>
          <Border CornerRadius="20" Background="{DynamicResource White}" BorderBrush="{DynamicResource Ink}" BorderThickness="2" Padding="10">
            <Viewbox x:Name="CodeBox" AutomationProperties.Name="QR code for the phone link">
              <Canvas x:Name="Code">
                <Path x:Name="Modules" Fill="{DynamicResource Ink}" RenderOptions.EdgeMode="Aliased"/>
              </Canvas>
            </Viewbox>
          </Border>
        </Grid>
        <Border HorizontalAlignment="Center" Margin="0,18,0,0" Padding="12,5" CornerRadius="14" Background="{DynamicResource Yellow}"
                BorderBrush="{DynamicResource Ink}" BorderThickness="2">
          <TextBlock x:Name="Countdown" FontFamily="{DynamicResource FontMono}" FontWeight="Medium" FontSize="13"/>
        </Border>
        <TextBlock Margin="0,14,0,0" FontSize="13" Foreground="{DynamicResource Muted}" TextAlignment="Center" TextWrapping="Wrap"
                   Text="Point your phone camera at the code. The link works once, and what you type there is encrypted on your phone."/>
        <Button x:Name="CloseButton" Content="Close" Style="{DynamicResource PlainButton}" HorizontalAlignment="Center" Margin="0,18,0,0" IsCancel="True"/>
      </StackPanel>
    </StackPanel>
  </Border>
</Window>
"@
  $code = $window.FindName('Code')
  $code.Width = $Modules
  $code.Height = $Modules
  # A whole number of pixels per module (a phone camera reads blurry, uneven modules badly), as large as fits the
  # 300 px the window has room for, and never under 3.
  $box = $window.FindName('CodeBox')
  $box.Width = $box.Height = $Modules * [Math]::Max(3, [Math]::Floor(300 / $Modules))
  $window.FindName('Modules').Data = [Windows.Media.Geometry]::Parse($PathData)
  $window.FindName('SecretName').Text = $Name
  $window.FindName('Kind').Text = if ($Kind -eq 'web') { 'password' } else { 'secret' }
  $countdown = $window.FindName('Countdown')
  $countdown.Text = Format-Countdown $ExpiresAt

  # Tick the countdown each second and close the window when the link expires.
  $timer = New-Object Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromSeconds(1)
  $timer.Add_Tick({
      $countdown.Text = Format-Countdown $ExpiresAt
      if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $ExpiresAt) { $timer.Stop(); $window.Close() }
    }.GetNewClosure())
  $window.Add_ContentRendered({ $timer.Start() }.GetNewClosure())
  $window.Add_Closed({ $timer.Stop() }.GetNewClosure())
  $window.FindName('CloseX').Add_Click({ $window.Close() }.GetNewClosure())
  $window.FindName('CloseButton').Add_Click({ $window.Close() }.GetNewClosure())
  $window.FindName('TitleBar').Add_MouseLeftButtonDown({ $window.DragMove() }.GetNewClosure())
  return [pscustomobject]@{ Window = $window }
}
