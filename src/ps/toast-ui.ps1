# Builds the "typed your password" notification. toast.ps1 shows it; test/fixtures/render-ui.ps1 draws it to a PNG.
# Dot-source ui.ps1 first. It never takes focus from Chrome, where the user is about to click Sign in.

function New-ToastWindow([string]$Name, [string]$Site) {
  $padlock = Get-PcPadlockXaml -MouthName 'Mouth'
  $window = New-PcWindow @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="NoPeeking" SizeToContent="WidthAndHeight" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        ResizeMode="NoResize" Topmost="True" ShowInTaskbar="False" ShowActivated="False" Focusable="False"
        FontFamily="{DynamicResource FontBody}" Foreground="{DynamicResource Ink}" UseLayoutRounding="True">
  <Grid Margin="12,12,20,20" Width="368">
    <Border CornerRadius="18" Background="{DynamicResource Ink}" Margin="6,6,-6,-6"/>
    <Border x:Name="Card" CornerRadius="18" Background="{DynamicResource White}" BorderBrush="{DynamicResource Ink}" BorderThickness="2"
            Padding="16,12,10,16" AutomationProperties.LiveSetting="Polite">
      <StackPanel>
        <Grid>
          <TextBlock Text="NoPeeking &#183; now" FontFamily="{DynamicResource FontMono}" FontWeight="Medium" FontSize="11"
                     Foreground="{DynamicResource Muted}" VerticalAlignment="Center"/>
          <Button x:Name="Dismiss" Style="{DynamicResource TitleCloseButton}" Width="30" Height="26" HorizontalAlignment="Right"
                  AutomationProperties.Name="Dismiss"/>
        </Grid>
        <Grid Margin="0,6,6,0">
          <Grid.ColumnDefinitions>
            <ColumnDefinition Width="Auto"/>
            <ColumnDefinition Width="*"/>
          </Grid.ColumnDefinitions>
          <Border Width="48" Height="48" CornerRadius="14" Background="{DynamicResource Yellow}" BorderBrush="{DynamicResource Ink}"
                  BorderThickness="2" VerticalAlignment="Top">
            <Viewbox Width="34" Height="34">$padlock</Viewbox>
          </Border>
          <StackPanel Grid.Column="1" Margin="14,0,0,0" VerticalAlignment="Center">
            <TextBlock x:Name="Title" FontFamily="{DynamicResource FontDisplay}" FontWeight="ExtraBold" FontSize="18" TextWrapping="Wrap"/>
            <TextBlock x:Name="Detail" FontSize="13" Foreground="{DynamicResource Muted}" TextWrapping="Wrap" Margin="0,3,0,0"/>
          </StackPanel>
        </Grid>
      </StackPanel>
    </Border>
  </Grid>
</Window>
"@
  $window.FindName('Title').Text = "Typed your $Name password"
  $window.FindName('Detail').Text = "Into $Site in Chrome. It never went through the chat."
  Set-PcFace $window.FindName('Mouth') 'happy'
  $window.FindName('Dismiss').Add_Click({ $window.Close() }.GetNewClosure())
  return [pscustomobject]@{ Window = $window }
}

# Shows the notification in the bottom-right corner of the screen, without activating it, and closes it after $Seconds.
# Returns once it has closed.
function Show-PcToast($Window, [double]$Seconds = 5) {
  $Window.Add_SourceInitialized({
      [NoPeeking.Show]::WindowNoActivate((New-Object Windows.Interop.WindowInteropHelper $Window).Handle)
    }.GetNewClosure())
  $Window.Add_ContentRendered({
      $area = [Windows.SystemParameters]::WorkArea
      $Window.Left = $area.Right - $Window.ActualWidth - 4
      $Window.Top = $area.Bottom - $Window.ActualHeight - 4
    }.GetNewClosure())
  $timer = New-Object Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromSeconds($Seconds)
  $timer.Add_Tick({ $timer.Stop(); $Window.Close() }.GetNewClosure())
  $Window.Add_Closed({ $timer.Stop(); [Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown() }.GetNewClosure())
  # Off screen until laid out, then moved into the corner, so it never flashes in the middle.
  $Window.WindowStartupLocation = 'Manual'
  $Window.Left = -10000
  $Window.Top = -10000
  $Window.Show()
  $timer.Start()
  [Windows.Threading.Dispatcher]::Run()
}
