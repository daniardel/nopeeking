# Shows a masked password dialog on the PC and saves the result straight to Credential Manager.
# The value never leaves this process. stdin: {"comment","kind","site"}. Exit: 0 saved, 4 exists, 6 cancelled.
param([Parameter(Mandatory = $true)][string]$Name)
. "$PSScriptRoot\common.ps1"
$target = Get-Target $Name
$req = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ([PassClaude.Cred]::Exists($target)) { exit 4 }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
function At([int]$x, [int]$y) { New-Object System.Drawing.Point($x, $y) }

# The server starts this script with a hidden console, and Windows then applies that "hide" to the first window
# the process shows, which would be this dialog. An explicit second ShowWindow call makes it visible.
Add-Type -Namespace PassClaude -Name Show -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool ShowWindow(System.IntPtr hwnd, int cmd);
public static void Window(System.IntPtr hwnd) { ShowWindow(hwnd, 5); }
'@

$form = New-Object System.Windows.Forms.Form
$form.Text = 'passClaude'
$form.TopMost = $true
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ClientSize = New-Object System.Drawing.Size(380, 214)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

if ($req.kind -eq 'web') { $what = "Password for $Name ($($req.site))" } else { $what = "Secret for $Name (used in commands)" }
$label = New-Object System.Windows.Forms.Label
$label.Text = "$what`r`nType it twice. Claude will never see it."
$label.Location = At 16 12
$label.Size = New-Object System.Drawing.Size(350, 44)

$box1 = New-Object System.Windows.Forms.TextBox
$box1.UseSystemPasswordChar = $true
$box1.Location = At 16 64
$box1.Width = 348

$box2 = New-Object System.Windows.Forms.TextBox
$box2.UseSystemPasswordChar = $true
$box2.Location = At 16 98
$box2.Width = 348

$hint = New-Object System.Windows.Forms.Label
$hint.Location = At 16 132
$hint.Size = New-Object System.Drawing.Size(350, 24)
$hint.ForeColor = [System.Drawing.Color]::Firebrick

$save = New-Object System.Windows.Forms.Button
$save.Text = 'Save'
$save.Location = At 196 170
$save.Width = 80

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.Location = At 284 170
$cancel.Width = 80
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

$form.AcceptButton = $save
$form.CancelButton = $cancel
$form.Controls.AddRange(@($label, $box1, $box2, $hint, $save, $cancel))

$save.Add_Click({
  if ($box1.Text.Length -lt 4) { $hint.Text = 'Too short (at least 4 characters).'; return }
  if ($box1.Text.Length -gt 1280) { $hint.Text = 'Too long (max 1280 characters).'; return }
  if ($box1.Text -cne $box2.Text) { $hint.Text = 'The two entries do not match.'; return }
  $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 300000
$timer.Add_Tick({ $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel })
$timer.Start()
$form.Add_Shown({ [PassClaude.Show]::Window($form.Handle); $form.Activate(); $box1.Focus() })

$result = $form.ShowDialog()
$timer.Stop()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) { exit 6 }
[PassClaude.Cred]::Write($target, $box1.Text, [string]$req.comment)
$box1.Text = ''
$box2.Text = ''
exit 0
