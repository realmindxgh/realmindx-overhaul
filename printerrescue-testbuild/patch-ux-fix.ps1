$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'TestApp.cs'
$src = Get-Content $path -Raw

function Replace-Required([string]$old,[string]$new,[string]$label) {
  if (!$src.Contains($old)) { throw "Could not find $label." }
  $script:src = $src.Replace($old,$new)
}

Replace-Required 'Panel.SetZIndex(emptyState,2)' 'System.Windows.Controls.Panel.SetZIndex(emptyState,2)' 'empty-state z-index call'

Replace-Required `
'        copyHwButton.ToolTip = "Copy the hardware ID Windows reports for this device.";' `
@'
        copyHwButton.ToolTip = "Copy the hardware ID Windows reports for this device.";
        ToolTipService.SetShowOnDisabled(findDriverButton, true);
        ToolTipService.SetShowOnDisabled(installInfButton, true);
        ToolTipService.SetShowOnDisabled(testPrintButton, true);
        ToolTipService.SetShowOnDisabled(copyHwButton, true);
'@.TrimEnd() `
'disabled action tooltips'

Replace-Required `
@'
            else
            {
                ShowEmptyState("Ready to scan", "Connect a printer if needed, then choose Scan Printers.");
                foot.Text = "Ready. Automatic scan on launch is turned off in Settings.";
            }
'@.Trim() `
@'
            else
            {
                count.Text = "Not scanned yet";
                attention.Text = "";
                ShowEmptyState("Ready to scan", "Connect a printer if needed, then choose Scan Printers.");
                foot.Text = "Ready. Automatic scan on launch is turned off in Settings.";
            }
'@.Trim() `
'manual launch state'

Replace-Required `
@'
        SetBusy(true, "Scanning…", "Scanning Windows for printers and print devices…");
        scanTime.Text="Scanning…";
        ShowEmptyState("Scanning for printers", "Checking installed queues and connected Windows print devices. This can take a few seconds.");
'@.Trim() `
@'
        string? previousDeviceId = selected?.DeviceId;
        string? previousName = selected?.Name;
        SetBusy(true, "Scanning…", "Scanning Windows for printers and print devices…");
        count.Text="Scanning printers…";
        attention.Text="Checking status…";
        attention.Foreground=Muted;
        scanTime.Text="Scanning…";
        ShowEmptyState("Scanning for printers", "Checking installed queues and connected Windows print devices. This can take a few seconds.");
'@.Trim() `
'scan start summary'

Replace-Required `
@'
                HideEmptyState();
                table.SelectedIndex=0;
                foot.Text=attentionCount>0 ? $"Scan complete. {attentionCount} device{(attentionCount==1?" needs":"s need")} attention." : "Scan complete. No physical printer problems detected.";
'@.Trim() `
@'
                HideEmptyState();
                var previous = items.FirstOrDefault(x => (!string.IsNullOrWhiteSpace(previousDeviceId) && x.DeviceId == previousDeviceId) || (string.IsNullOrWhiteSpace(previousDeviceId) && !string.IsNullOrWhiteSpace(previousName) && x.Name.Equals(previousName, StringComparison.OrdinalIgnoreCase)));
                table.SelectedItem = previous ?? items[0];
                foot.Text=attentionCount>0 ? $"Scan complete. {attentionCount} device{(attentionCount==1?" needs":"s need")} attention." : "Scan complete. No physical printer problems detected.";
'@.Trim() `
'preserved printer selection'

Replace-Required `
@'
            scanTime.Text="Scan failed";
            selected=null; ClearDetail();
'@.Trim() `
@'
            count.Text="Scan failed";
            attention.Text="";
            scanTime.Text="Scan failed";
            selected=null; ClearDetail();
'@.Trim() `
'scan failure summary'

Set-Content $path $src -Encoding UTF8
Write-Host 'Final UX polish applied.'
