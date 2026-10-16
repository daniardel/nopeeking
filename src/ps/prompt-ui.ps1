# Builds the "save a secret" window. prompt.ps1 shows it and saves what was typed; test/fixtures/render-ui.ps1 draws
# it to PNGs. Dot-source ui.ps1 first. The name and site are set as text after loading, never put into the markup.

# The message to show for what was typed, or $null when it can be saved.
function Test-PromptEntries([string]$First, [string]$Second) {
  if ($First.Length -lt 4) { return 'Too short: at least 4 characters.' }
  if ($First.Length -gt 1280) { return 'Too long: at most 1280 characters.' }
  if ($First -cne $Second) { return "The two entries don't match." }
  return $null
}

function New-PromptWindow([string]$Name, [string]$Kind, [string]$Site) {
  $padlock = Get-PcPadlockXaml -MouthName 'Mouth'
  $smallPadlock = Get-PcPadlockXaml
  $window = New-PcWindow @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="passClaude" Width="516" SizeToContent="Height" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
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
        <Button x:Name="CloseButton" Style="{DynamicResource TitleCloseButton}" HorizontalAlignment="Right" AutomationProperties.Name="Close"/>
      </Grid>

      <StackPanel Margin="28,10,28,28">
        <Grid>
          <Grid.ColumnDefinitions>
            <ColumnDefinition Width="Auto"/>
            <ColumnDefinition Width="*"/>
          </Grid.ColumnDefinitions>
          <Border Width="64" Height="64" CornerRadius="18" Background="{DynamicResource Yellow}" BorderBrush="{DynamicResource Ink}" BorderThickness="2">
            <Viewbox Width="46" Height="46">$padlock</Viewbox>
          </Border>
          <StackPanel Grid.Column="1" Margin="16,0,0,0" VerticalAlignment="Center">
            <TextBlock x:Name="Heading" FontFamily="{DynamicResource FontDisplay}" FontWeight="ExtraBold" FontSize="26"/>
            <WrapPanel Margin="0,4,0,0">
              <TextBlock x:Name="What" FontSize="15" Foreground="{DynamicResource Muted}" VerticalAlignment="Center"/>
              <TextBlock x:Name="SecretName" FontSize="15" FontWeight="Bold" Margin="4,0,0,0" VerticalAlignment="Center"/>
              <Border x:Name="SitePill" Margin="8,0,0,0" Padding="8,2" CornerRadius="999" Background="{DynamicResource Paper}" VerticalAlignment="Center">
                <TextBlock x:Name="Site" FontFamily="{DynamicResource FontMono}" FontWeight="Medium" FontSize="12" Foreground="{DynamicResource VioletDeep}"/>
              </Border>
            </WrapPanel>
          </StackPanel>
        </Grid>

        <TextBlock x:Name="FirstLabel" Style="{DynamicResource FieldLabel}" Margin="0,22,0,6"/>
        <Grid>
          <PasswordBox x:Name="First" Style="{DynamicResource PcPasswordBox}" MaxLength="4096"/>
          <TextBox x:Name="FirstShown" Style="{DynamicResource PcTextBox}" Visibility="Collapsed" MaxLength="4096"/>
        </Grid>
        <TextBlock Text="Type it again" Style="{DynamicResource FieldLabel}" Margin="0,14,0,6"/>
        <Grid>
          <PasswordBox x:Name="Second" Style="{DynamicResource PcPasswordBox}" MaxLength="4096" AutomationProperties.Name="Type it again"/>
          <TextBox x:Name="SecondShown" Style="{DynamicResource PcTextBox}" Visibility="Collapsed" MaxLength="4096" AutomationProperties.Name="Type it again"/>
        </Grid>
        <CheckBox x:Name="Show" Content="Show what I typed" Margin="0,12,0,0" FontSize="14" Foreground="{DynamicResource Muted}" VerticalContentAlignment="Center"/>

        <Border x:Name="ErrorBox" Margin="0,16,0,0" Padding="14,10" CornerRadius="12" Background="#1FE5432A" BorderBrush="{DynamicResource Coral}"
                BorderThickness="2" Visibility="Collapsed">
          <TextBlock x:Name="ErrorText" FontSize="14" FontWeight="Bold" TextWrapping="Wrap"/>
        </Border>

        <Border Margin="0,16,0,0" Padding="14,12" CornerRadius="12" Background="{DynamicResource Paper}">
          <TextBlock FontSize="14" TextWrapping="Wrap" LineHeight="20">
            <Run FontWeight="Bold" Text="Claude will never see it."/>
            <Run Text="It goes straight into Windows Credential Manager."/>
          </TextBlock>
        </Border>

        <StackPanel Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,22,4,4">
          <Button x:Name="CancelButton" Content="Cancel" Style="{DynamicResource PlainButton}" IsCancel="True"/>
          <Button x:Name="SaveButton" Content="Save it" Style="{DynamicResource StickerButton}" IsDefault="True" Margin="12,0,0,0"/>
        </StackPanel>
      </StackPanel>
    </StackPanel>
  </Border>
</Window>
"@

  $f = @{}
  foreach ($n in 'TitleBar', 'CloseButton', 'Heading', 'What', 'SecretName', 'SitePill', 'Site', 'FirstLabel', 'First', 'FirstShown',
    'Second', 'SecondShown', 'Show', 'ErrorBox', 'ErrorText', 'SaveButton', 'Mouth') {
    $f[$n] = $window.FindName($n)
  }

  if ($Kind -eq 'web') {
    $f.Heading.Text = 'Save a password'
    $f.What.Text = 'Password for'
    $f.Site.Text = $Site
    $f.FirstLabel.Text = 'Password'
  } else {
    $f.Heading.Text = 'Save a secret'
    $f.What.Text = 'Secret for'
    $f.SitePill.Visibility = 'Collapsed'
    $f.FirstLabel.Text = 'Secret'
  }
  $f.SecretName.Text = $Name
  [Windows.Automation.AutomationProperties]::SetName($f.First, $f.FirstLabel.Text)
  [Windows.Automation.AutomationProperties]::SetName($f.FirstShown, $f.FirstLabel.Text)

  $shown = { [bool]$f.Show.IsChecked }.GetNewClosure()
  $value = { if (& $shown) { $f.FirstShown.Text } else { $f.First.Password } }.GetNewClosure()
  $again = { if (& $shown) { $f.SecondShown.Text } else { $f.Second.Password } }.GetNewClosure()

  # "Show what I typed" swaps each password box for a text box holding the same text, and back.
  $f.Show.Add_Checked({
      $f.FirstShown.Text = $f.First.Password
      $f.SecondShown.Text = $f.Second.Password
      $f.First.Visibility = 'Collapsed'; $f.Second.Visibility = 'Collapsed'
      $f.FirstShown.Visibility = 'Visible'; $f.SecondShown.Visibility = 'Visible'
    }.GetNewClosure())
  $f.Show.Add_Unchecked({
      $f.First.Password = $f.FirstShown.Text
      $f.Second.Password = $f.SecondShown.Text
      $f.FirstShown.Text = ''; $f.SecondShown.Text = ''
      $f.FirstShown.Visibility = 'Collapsed'; $f.SecondShown.Visibility = 'Collapsed'
      $f.First.Visibility = 'Visible'; $f.Second.Visibility = 'Visible'
    }.GetNewClosure())

  $ui = [pscustomobject]@{ Window = $window }
  $ui | Add-Member ScriptMethod Value $value
  # Checks what was typed. Shows the problem (and a worried padlock) and returns it, or returns $null when it's fine.
  $ui | Add-Member ScriptMethod TrySave ({
      $problem = Test-PromptEntries (& $value) (& $again)
      if ($problem) {
        $f.ErrorText.Text = $problem
        $f.ErrorBox.Visibility = 'Visible'
        Set-PcFace $f.Mouth 'worried'
      }
      return $problem
    }.GetNewClosure())
  $ui | Add-Member ScriptMethod Clear ({
      $f.First.Password = ''; $f.Second.Password = ''
      $f.FirstShown.Text = ''; $f.SecondShown.Text = ''
    }.GetNewClosure())

  $calm = {
    if ($f.ErrorBox.Visibility -eq 'Visible') { $f.ErrorBox.Visibility = 'Collapsed'; Set-PcFace $f.Mouth 'calm' }
  }.GetNewClosure()
  foreach ($box in $f.First, $f.Second) { $box.Add_PasswordChanged($calm) }
  foreach ($box in $f.FirstShown, $f.SecondShown) { $box.Add_TextChanged($calm) }

  $f.SaveButton.Add_Click({ if ($null -eq $ui.TrySave()) { $window.DialogResult = $true } }.GetNewClosure())
  $f.CloseButton.Add_Click({ $window.DialogResult = $false }.GetNewClosure())
  $f.TitleBar.Add_MouseLeftButtonDown({ $window.DragMove() }.GetNewClosure())
  $window.Add_ContentRendered({ $f.First.Focus() | Out-Null }.GetNewClosure())
  return $ui
}
