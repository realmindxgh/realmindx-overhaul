$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'TestApp.cs'
$src = Get-Content $path -Raw

function Replace-Required([string]$old,[string]$new,[string]$label) {
  if (!$src.Contains($old)) { throw "Could not find $label." }
  $script:src = $src.Replace($old,$new)
}

Replace-Required `
'    readonly Button findDriverButton, installInfButton, testPrintButton, copyHwButton;' `
@'
    readonly Button findDriverButton, installInfButton, testPrintButton, copyHwButton;
    Button? scanButton, windowsButton, settingsButton;
    readonly ProgressBar activityProgress = new() { Height = 3, IsIndeterminate = true, Visibility = Visibility.Collapsed, VerticalAlignment = VerticalAlignment.Bottom };
    readonly Border emptyState = new() { Background = Brushes.White, Visibility = Visibility.Visible };
    readonly TextBlock emptyStateTitle = new(), emptyStateText = new();
    bool operationBusy;
'@.TrimEnd() `
'button fields'

Replace-Required `
'        Loaded += async (_, _) => await Scan();' `
@'
        Loaded += async (_, _) =>
        {
            var settings = SettingsWindow.LoadSettings();
            if (settings.ScanOnLaunch) await Scan();
            else
            {
                ShowEmptyState("Ready to scan", "Connect a printer if needed, then choose Scan Printers.");
                foot.Text = "Ready. Automatic scan on launch is turned off in Settings.";
            }
        };
'@.TrimEnd() `
'launch scan handler'

Replace-Required `
@'
        findDriverButton = Btn("Find Official Driver", true);
        installInfButton = Btn("Install Local INF");
        testPrintButton = Btn("Test Print");
        copyHwButton = Btn("Copy Hardware ID");
'@.Trim() `
@'
        findDriverButton = Btn("Find Official Driver", true);
        installInfButton = Btn("Install Local INF");
        testPrintButton = Btn("Test Print");
        copyHwButton = Btn("Copy Hardware ID");
        findDriverButton.ToolTip = "Open the printer manufacturer's official support page.";
        installInfButton.ToolTip = "Install a driver package you already have on this PC.";
        testPrintButton.ToolTip = "Ask Windows to print a test page using the selected printer queue.";
        copyHwButton.ToolTip = "Copy the hardware ID Windows reports for this device.";
'@.Trim() `
'action tooltips'

Replace-Required `
@'
        var scan = Btn("Scan Printers", true); scan.Click += async (_, _) => await Scan();
        var windows = Btn("Windows Printers"); windows.Click += (_,_) => OpenUri("ms-settings:printers");
        var settings = Btn("Settings"); settings.Click += (_,_) => MessageBox.Show("Settings will be expanded after the driver-matching prototype.", "Printer Rescue");
        actions.Children.Add(scan); actions.Children.Add(windows); actions.Children.Add(settings);
'@.Trim() `
@'
        scanButton = Btn("Scan Printers", true); scanButton.Click += async (_, _) => await Scan();
        scanButton.ToolTip = "Scan Windows printer queues and connected print devices.";
        windowsButton = Btn("Windows Printers"); windowsButton.Click += (_,_) => OpenUri("ms-settings:printers");
        windowsButton.ToolTip = "Open Windows printer settings.";
        settingsButton = Btn("Settings"); settingsButton.Click += async (_,_) =>
        {
            if (operationBusy) return;
            var before = SettingsWindow.LoadSettings();
            var dialog = new SettingsWindow(this);
            if (dialog.ShowDialog() == true)
            {
                var after = SettingsWindow.LoadSettings();
                foot.Text = "Settings saved.";
                if (before.IncludeVirtualPrinters != after.IncludeVirtualPrinters && table.ItemsSource != null) await Scan();
            }
        };
        settingsButton.ToolTip = "Change scanning preferences.";
        actions.Children.Add(scanButton); actions.Children.Add(windowsButton); actions.Children.Add(settingsButton);
'@.Trim() `
'header actions'

Replace-Required `
'        Grid.SetColumn(cat,3); strip.Children.Add(cat);' `
'        Grid.SetColumn(cat,3); strip.Children.Add(cat); Grid.SetColumnSpan(activityProgress,4); strip.Children.Add(activityProgress);' `
'activity progress placement'

Replace-Required `
'        ConfigureTable(); Grid.SetRow(table,1); lg.Children.Add(table);' `
@'
        ConfigureTable(); Grid.SetRow(table,1); lg.Children.Add(table);
        var emptyStack = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, MaxWidth = 390 };
        emptyStateTitle.FontSize = 19; emptyStateTitle.FontWeight = FontWeights.SemiBold; emptyStateTitle.Foreground = Ink; emptyStateTitle.TextAlignment = TextAlignment.Center;
        emptyStateText.FontSize = 13; emptyStateText.Foreground = Muted; emptyStateText.TextWrapping = TextWrapping.Wrap; emptyStateText.TextAlignment = TextAlignment.Center; emptyStateText.Margin = new Thickness(0,7,0,0);
        emptyStack.Children.Add(MakePrinterIcon("Unknown",72,.75));
        emptyStack.Children.Add(emptyStateTitle); emptyStack.Children.Add(emptyStateText);
        emptyState.Child = emptyStack; Grid.SetRow(emptyState,1); Panel.SetZIndex(emptyState,2); lg.Children.Add(emptyState);
        ShowEmptyState("Waiting for scan", "Printer Rescue will scan automatically, or you can choose Scan Printers.");
'@.TrimEnd() `
'empty state'

Replace-Required `
'        table.AutoGenerateColumns=false; table.HeadersVisibility=DataGridHeadersVisibility.Column; table.GridLinesVisibility=DataGridGridLinesVisibility.Horizontal; table.BorderThickness=new(0); table.RowHeight=66; table.ColumnHeaderHeight=38; table.IsReadOnly=true; table.SelectionMode=DataGridSelectionMode.Single; table.Background=Brushes.White; table.HorizontalGridLinesBrush=Edge; table.SelectionChanged+=(_,_)=>SelectCurrent();' `
'        table.AutoGenerateColumns=false; table.HeadersVisibility=DataGridHeadersVisibility.Column; table.GridLinesVisibility=DataGridGridLinesVisibility.Horizontal; table.BorderThickness=new(0); table.RowHeight=66; table.ColumnHeaderHeight=38; table.IsReadOnly=true; table.SelectionMode=DataGridSelectionMode.Single; table.SelectionUnit=DataGridSelectionUnit.FullRow; table.Background=Brushes.White; table.HorizontalGridLinesBrush=Edge; table.SelectionChanged+=(_,_)=>SelectCurrent();' `
'data grid selection behavior'

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
        if (operationBusy) return;
        SetBusy(true, "Scanning…", "Scanning Windows for printers and print devices…");
        scanTime.Text="Scanning…";
        ShowEmptyState("Scanning for printers", "Checking installed queues and connected Windows print devices. This can take a few seconds.");
        try
        {
            var detected=await Task.Run(Detect);
            var settings=SettingsWindow.LoadSettings();
            var items=settings.IncludeVirtualPrinters ? detected : detected.Where(x=>!x.IsVirtual).ToList();
            table.ItemsSource=items;
            count.Text=$"{items.Count} print item{(items.Count==1?"":"s")} detected";
            int attentionCount=items.Count(x=>!x.IsVirtual && x.Status!="Installed");
            attention.Text=$"{attentionCount} need attention";
            attention.Foreground=attentionCount==0?Green:Amber;
            scanTime.Text=$"Last scan: {DateTime.Now:h:mm tt}";
            if(items.Count>0)
            {
                HideEmptyState();
                table.SelectedIndex=0;
                foot.Text=attentionCount>0 ? $"Scan complete. {attentionCount} device{(attentionCount==1?" needs":"s need")} attention." : "Scan complete. No physical printer problems detected.";
            }
            else
            {
                selected=null; ClearDetail();
                ShowEmptyState(settings.IncludeVirtualPrinters ? "No printers found" : "No physical printers found", settings.IncludeVirtualPrinters ? "Connect a printer, switch it on, and scan again." : "Virtual printers are hidden in Settings. Connect a physical printer or enable virtual printers.");
                foot.Text="Scan complete. No matching print devices were found.";
            }
        }
        catch(Exception ex)
        {
            scanTime.Text="Scan failed";
            selected=null; ClearDetail();
            ShowEmptyState("Scan could not finish", "Printer Rescue could not read Windows printer information. Try Scan Printers again.");
            foot.Text="Scan failed. No changes were made.";
            MessageBox.Show(this, ex.Message,"Printer Rescue scan error",MessageBoxButton.OK,MessageBoxImage.Warning);
        }
        finally
        {
            SetBusy(false);
        }
    }

    void ShowEmptyState(string title, string text)
    {
        emptyStateTitle.Text=title; emptyStateText.Text=text; emptyState.Visibility=Visibility.Visible;
    }
    void HideEmptyState() => emptyState.Visibility=Visibility.Collapsed;

    void SetBusy(bool busy, string? buttonText=null, string? statusText=null)
    {
        operationBusy=busy;
        activityProgress.Visibility=busy?Visibility.Visible:Visibility.Collapsed;
        if(scanButton!=null){scanButton.IsEnabled=!busy;scanButton.Content=busy?(buttonText??"Working…"):"Scan Printers";scanButton.Cursor=busy?System.Windows.Input.Cursors.Wait:System.Windows.Input.Cursors.Hand;}
        if(windowsButton!=null) windowsButton.IsEnabled=!busy;
        if(settingsButton!=null) settingsButton.IsEnabled=!busy;
        table.IsEnabled=!busy;
        if(busy && statusText!=null) foot.Text=statusText;
        System.Windows.Input.Mouse.OverrideCursor=busy?System.Windows.Input.Cursors.Wait:null;
        UpdateActions();
    }
'@
Replace-Required $oldScan.Trim() $newScan.Trim() 'scan workflow'

Replace-Required `
'    void UpdateActions(){bool has=selected!=null;findDriverButton.IsEnabled=has&&!selected!.IsVirtual&&!string.IsNullOrWhiteSpace(selected.SupportUrl);installInfButton.IsEnabled=has&&!selected!.IsVirtual;testPrintButton.IsEnabled=has&&selected!.HasQueue&&!selected.IsVirtual;copyHwButton.IsEnabled=has&&!string.IsNullOrWhiteSpace(selected!.HardwareId);}' `
@'
    void UpdateActions()
    {
        bool has=selected!=null && !operationBusy;
        findDriverButton.IsEnabled=has&&!selected!.IsVirtual&&!string.IsNullOrWhiteSpace(selected.SupportUrl);
        installInfButton.IsEnabled=has&&!selected!.IsVirtual;
        testPrintButton.IsEnabled=has&&selected!.HasQueue&&!selected.IsVirtual;
        copyHwButton.IsEnabled=has&&!string.IsNullOrWhiteSpace(selected!.HardwareId);
        if(selected==null) return;
        findDriverButton.ToolTip = selected.IsVirtual ? "Virtual printers do not need a manufacturer hardware driver." : string.IsNullOrWhiteSpace(selected.SupportUrl) ? "Printer Rescue does not yet have an official support route for this manufacturer." : "Open the manufacturer's official support page.";
        testPrintButton.ToolTip = !selected.HasQueue ? "A Windows printer queue is required before a test page can be sent." : selected.IsVirtual ? "Test printing is intended for physical printers in this prototype." : "Ask Windows to print a test page.";
        copyHwButton.ToolTip = string.IsNullOrWhiteSpace(selected.HardwareId) ? "Windows did not expose a hardware ID for this item." : "Copy this device's hardware ID.";
    }
'@.Trim() `
'action enablement'

$oldTest = @'
    async Task TestPrint()
    {
        if(selected==null||!selected.HasQueue)return;
        foot.Text=$"Sending Windows test page to {selected.Name}…";
        string safe=selected.Name.Replace("'","''");
        try{string r=await Task.Run(()=>RunPowerShell($"$p=Get-CimInstance Win32_Printer | Where-Object {{$_.Name -eq '{safe}'}} | Select-Object -First 1; if(-not $p){{throw 'Printer queue not found'}}; $x=Invoke-CimMethod -InputObject $p -MethodName PrintTestPage; $x.ReturnValue")); if(r.Trim()=="0"){foot.Text="Test page sent successfully.";MessageBox.Show("Windows accepted the test-page request.","Printer Rescue",MessageBoxButton.OK,MessageBoxImage.Information);}else{foot.Text=$"Test page returned code {r}.";MessageBox.Show($"Windows returned code {r}.","Printer Rescue",MessageBoxButton.OK,MessageBoxImage.Warning);}}catch(Exception ex){foot.Text="Test print failed.";MessageBox.Show(ex.Message,"Test print failed",MessageBoxButton.OK,MessageBoxImage.Warning);}
    }
'@
$newTest = @'
    async Task TestPrint()
    {
        if(selected==null||!selected.HasQueue||operationBusy)return;
        var printerName=selected.Name;
        string safe=printerName.Replace("'","''");
        SetBusy(true,"Printing…",$"Sending a Windows test page to {printerName}…");
        try
        {
            string r=await Task.Run(()=>RunPowerShell($"$p=Get-CimInstance Win32_Printer | Where-Object {{$_.Name -eq '{safe}'}} | Select-Object -First 1; if(-not $p){{throw 'Printer queue not found'}}; $x=Invoke-CimMethod -InputObject $p -MethodName PrintTestPage; $x.ReturnValue"));
            if(r.Trim()=="0") foot.Text=$"Test page sent to {printerName}.";
            else { foot.Text=$"Windows could not send the test page. Code {r}."; MessageBox.Show(this,$"Windows returned code {r} while requesting a test page.","Test print",MessageBoxButton.OK,MessageBoxImage.Warning); }
        }
        catch(Exception ex){foot.Text="Test print failed. No printer settings were changed.";MessageBox.Show(this,ex.Message,"Test print failed",MessageBoxButton.OK,MessageBoxImage.Warning);}
        finally{SetBusy(false);}
    }
'@
Replace-Required $oldTest.Trim() $newTest.Trim() 'test print workflow'

$oldInstall = @'
    async Task InstallInf()
    {
        if(selected==null||selected.IsVirtual)return;
        var dlg=new OpenFileDialog{Title="Choose a printer driver INF",Filter="Driver INF (*.inf)|*.inf",CheckFileExists=true,Multiselect=false}; if(dlg.ShowDialog()!=true)return;
        var answer=MessageBox.Show($"Printer Rescue will ask Windows to add and install this driver package:\n\n{dlg.FileName}\n\nWindows will show an administrator prompt. Continue?","Install local driver",MessageBoxButton.YesNo,MessageBoxImage.Warning); if(answer!=MessageBoxResult.Yes)return;
        try
        {
            foot.Text="Waiting for Windows driver installation…";
            var psi=new ProcessStartInfo("pnputil.exe",$"/add-driver \"{dlg.FileName}\" /install"){UseShellExecute=true,Verb="runas",WindowStyle=ProcessWindowStyle.Normal};
            using var p=Process.Start(psi); if(p==null)throw new Exception("Windows could not start PnPUtil."); await p.WaitForExitAsync();
            if(p.ExitCode==0){foot.Text="Windows completed the driver installation request. Rescanning…";await Scan();}else{foot.Text=$"PnPUtil exited with code {p.ExitCode}.";MessageBox.Show($"Windows PnPUtil exited with code {p.ExitCode}. Review the PnPUtil window for details.","Driver installation",MessageBoxButton.OK,MessageBoxImage.Warning);}
        }
        catch(System.ComponentModel.Win32Exception ex) when(ex.NativeErrorCode==1223){foot.Text="Driver installation cancelled.";}
        catch(Exception ex){foot.Text="Driver installation failed.";MessageBox.Show(ex.Message,"Driver installation failed",MessageBoxButton.OK,MessageBoxImage.Error);}
    }
'@
$newInstall = @'
    async Task InstallInf()
    {
        if(selected==null||selected.IsVirtual||operationBusy)return;
        var dlg=new OpenFileDialog{Title="Choose a printer driver INF",Filter="Printer driver INF (*.inf)|*.inf",CheckFileExists=true,Multiselect=false};
        if(dlg.ShowDialog(this)!=true){foot.Text="Driver installation cancelled before any changes were made.";return;}
        var answer=MessageBox.Show(this,$"Printer Rescue will ask Windows to add and install this driver package:\n\n{dlg.FileName}\n\nOnly continue if you trust this driver package. Windows will request administrator permission.","Install local driver",MessageBoxButton.YesNo,MessageBoxImage.Warning,MessageBoxResult.No);
        if(answer!=MessageBoxResult.Yes){foot.Text="Driver installation cancelled. No changes were made.";return;}
        SetBusy(true,"Installing…","Waiting for Windows driver installation…");
        try
        {
            var psi=new ProcessStartInfo("pnputil.exe",$"/add-driver \"{dlg.FileName}\" /install"){UseShellExecute=true,Verb="runas",WindowStyle=ProcessWindowStyle.Normal};
            using var p=Process.Start(psi); if(p==null)throw new Exception("Windows could not start PnPUtil."); await p.WaitForExitAsync();
            if(p.ExitCode==0)
            {
                foot.Text="Driver installation completed. Rescanning printers…";
                SetBusy(false);
                await Scan();
                return;
            }
            foot.Text=$"Windows driver installation ended with code {p.ExitCode}.";
            MessageBox.Show(this,$"Windows PnPUtil exited with code {p.ExitCode}. The driver may not have been installed.","Driver installation",MessageBoxButton.OK,MessageBoxImage.Warning);
        }
        catch(System.ComponentModel.Win32Exception ex) when(ex.NativeErrorCode==1223){foot.Text="Administrator permission was cancelled. No driver was installed.";}
        catch(Exception ex){foot.Text="Driver installation failed.";MessageBox.Show(this,ex.Message,"Driver installation failed",MessageBoxButton.OK,MessageBoxImage.Error);}
        finally{if(operationBusy)SetBusy(false);}
    }
'@
Replace-Required $oldInstall.Trim() $newInstall.Trim() 'driver install workflow'

Replace-Required `
'    void FindDriver(){if(selected==null||string.IsNullOrWhiteSpace(selected.SupportUrl))return;OpenUri(selected.SupportUrl);foot.Text=$"Opened {selected.Manufacturer} support for {selected.Name}.";}' `
'    void FindDriver(){if(selected==null||string.IsNullOrWhiteSpace(selected.SupportUrl)||operationBusy)return;OpenUri(selected.SupportUrl);foot.Text=$"Opened {selected.Manufacturer} official support for {selected.Name}.";}' `
'official driver action'

Replace-Required `
'    void CopyHardwareId(){if(selected==null||string.IsNullOrWhiteSpace(selected.HardwareId))return;Clipboard.SetText(selected.HardwareId);foot.Text="Hardware ID copied.";}' `
'    void CopyHardwareId(){if(selected==null||string.IsNullOrWhiteSpace(selected.HardwareId)||operationBusy)return;Clipboard.SetText(selected.HardwareId);foot.Text="Hardware ID copied to the clipboard.";}' `
'copy hardware action'

Set-Content $path $src -Encoding UTF8
Write-Host 'Comprehensive UX patch applied.'
