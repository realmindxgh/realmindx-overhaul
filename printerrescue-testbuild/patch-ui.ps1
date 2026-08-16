$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'TestApp.cs'
$src = Get-Content $path -Raw

$oldFields = 'readonly Button findDriverButton, installInfButton, testPrintButton, copyHwButton;'
$newFields = @'
readonly Button findDriverButton, installInfButton, testPrintButton, copyHwButton;
    Button? scanButton;
    readonly ProgressBar scanProgress = new() { Height = 3, IsIndeterminate = true, Visibility = Visibility.Collapsed, VerticalAlignment = VerticalAlignment.Bottom };
'@
if (!$src.Contains($oldFields)) { throw 'Could not find button fields.' }
$src = $src.Replace($oldFields, $newFields.TrimEnd())

$oldActions = @'
var scan = Btn("Scan Printers", true); scan.Click += async (_, _) => await Scan();
        var windows = Btn("Windows Printers"); windows.Click += (_,_) => OpenUri("ms-settings:printers");
        var settings = Btn("Settings"); settings.Click += (_,_) => MessageBox.Show("Settings will be expanded after the driver-matching prototype.", "Printer Rescue");
        actions.Children.Add(scan); actions.Children.Add(windows); actions.Children.Add(settings);
'@
$newActions = @'
scanButton = Btn("Scan Printers", true); scanButton.Click += async (_, _) => await Scan();
        var windows = Btn("Windows Printers"); windows.Click += (_,_) => OpenUri("ms-settings:printers");
        var settings = Btn("Settings"); settings.Click += (_,_) => { var dialog = new SettingsWindow(this); dialog.ShowDialog(); };
        actions.Children.Add(scanButton); actions.Children.Add(windows); actions.Children.Add(settings);
'@
if (!$src.Contains($oldActions.Trim())) { throw 'Could not find header action block.' }
$src = $src.Replace($oldActions.Trim(), $newActions.Trim())

$oldStrip = 'Grid.SetColumn(cat,3); strip.Children.Add(cat);'
$newStrip = 'Grid.SetColumn(cat,3); strip.Children.Add(cat); Grid.SetColumnSpan(scanProgress,4); strip.Children.Add(scanProgress);'
if (!$src.Contains($oldStrip)) { throw 'Could not find status strip marker.' }
$src = $src.Replace($oldStrip, $newStrip)

$oldScan = @'
async Task Scan()
    {
        foot.Text="Scanning printer queues and Windows PnP devices…";
        try
        {
            var items=await Task.Run(Detect);
            table.ItemsSource=items;
            count.Text=$"{items.Count} print item{(items.Count==1?"":"s")} detected";
            int attentionCount=items.Count(x=>!x.IsVirtual && x.Status!="Installed");
            attention.Text=$"{attentionCount} need attention";
            attention.Foreground=attentionCount==0?Green:Amber;
            scanTime.Text=$"Last scan: {DateTime.Now:h:mm tt}";
            foot.Text=items.Count==0?"No printer queues or PnP printer devices were found.":"Scan complete.";
            if(items.Count>0) table.SelectedIndex=0; else { selected=null; ClearDetail(); }
        }
        catch(Exception ex)
        {
            foot.Text="Scan failed."; MessageBox.Show(ex.Message,"Printer Rescue scan error",MessageBoxButton.OK,MessageBoxImage.Warning);
        }
    }
'@
$newScan = @'
async Task Scan()
    {
        if (scanButton != null && !scanButton.IsEnabled) return;
        SetScanningState(true);
        foot.Text="Scanning printer queues and Windows PnP devices…";
        scanTime.Text="Scanning…";
        try
        {
            var items=await Task.Run(Detect);
            table.ItemsSource=items;
            count.Text=$"{items.Count} print item{(items.Count==1?"":"s")} detected";
            int attentionCount=items.Count(x=>!x.IsVirtual && x.Status!="Installed");
            attention.Text=$"{attentionCount} need attention";
            attention.Foreground=attentionCount==0?Green:Amber;
            scanTime.Text=$"Last scan: {DateTime.Now:h:mm tt}";
            foot.Text=items.Count==0?"No printer queues or PnP printer devices were found.":"Scan complete.";
            if(items.Count>0) table.SelectedIndex=0; else { selected=null; ClearDetail(); }
        }
        catch(Exception ex)
        {
            scanTime.Text="Scan failed";
            foot.Text="Scan failed."; MessageBox.Show(ex.Message,"Printer Rescue scan error",MessageBoxButton.OK,MessageBoxImage.Warning);
        }
        finally
        {
            SetScanningState(false);
        }
    }

    void SetScanningState(bool scanning)
    {
        scanProgress.Visibility = scanning ? Visibility.Visible : Visibility.Collapsed;
        if (scanButton != null)
        {
            scanButton.IsEnabled = !scanning;
            scanButton.Content = scanning ? "Scanning…" : "Scan Printers";
            scanButton.Cursor = scanning ? System.Windows.Input.Cursors.Wait : System.Windows.Input.Cursors.Hand;
        }
        table.IsEnabled = !scanning;
        System.Windows.Input.Mouse.OverrideCursor = scanning ? System.Windows.Input.Cursors.Wait : null;
    }
'@
if (!$src.Contains($oldScan.Trim())) { throw 'Could not find Scan method.' }
$src = $src.Replace($oldScan.Trim(), $newScan.Trim())

Set-Content $path $src -Encoding UTF8
Write-Host 'UI behavior patch applied.'
