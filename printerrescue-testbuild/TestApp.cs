using Microsoft.Win32;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Shapes;

namespace PrinterRescue;

public sealed class PrinterItem
{
    public string Name { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string Type { get; set; } = "";
    public string Connection { get; set; } = "";
    public string Driver { get; set; } = "";
    public string Status { get; set; } = "";
    public string Port { get; set; } = "";
    public string HardwareId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public bool IsVirtual { get; set; }
    public bool HasQueue { get; set; }
    public string SupportUrl { get; set; } = "";
}

public sealed class MainWindow : Window
{
    static readonly Brush Ink = B("#172033");
    static readonly Brush Muted = B("#5B6981");
    static readonly Brush Blue = B("#1E5BBF");
    static readonly Brush Navy = B("#174493");
    static readonly Brush Edge = B("#DBE1EB");
    static readonly Brush Bg = B("#F7F9FC");
    static readonly Brush Green = B("#168E51");
    static readonly Brush Amber = B("#D38910");
    static readonly Brush Red = B("#C93642");

    readonly Grid root = new();
    readonly DataGrid table = new();
    readonly TextBlock count = new(), attention = new(), scanTime = new(), foot = new();
    readonly TextBlock dn = new(), dman = new(), dt = new(), dc = new(), dd = new(), dp = new(), dh = new(), ds = new();
    readonly ContentControl detailIcon = new();
    readonly Button findDriverButton, installInfButton, testPrintButton, copyHwButton;
    PrinterItem? selected;

    static Brush B(string s) => (Brush)new BrushConverter().ConvertFromString(s)!;

    public MainWindow()
    {
        Title = "Printer Rescue";
        Width = 1320;
        Height = 820;
        MinWidth = 1040;
        MinHeight = 680;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        FontFamily = new("Segoe UI");
        Background = Bg;
        Content = root;

        findDriverButton = Btn("Find Official Driver", true);
        installInfButton = Btn("Install Local INF");
        testPrintButton = Btn("Test Print");
        copyHwButton = Btn("Copy Hardware ID");

        Build();
        Loaded += async (_, _) => await Scan();
    }

    Button Btn(string text, bool primary = false)
    {
        return new Button
        {
            Content = text,
            Height = 38,
            Padding = new(18, 0, 18, 0),
            Margin = new(7, 0, 0, 0),
            Background = primary ? Blue : Brushes.White,
            Foreground = primary ? Brushes.White : Ink,
            BorderBrush = primary ? Blue : Edge,
            BorderThickness = new(1),
            FontWeight = FontWeights.SemiBold,
            Cursor = System.Windows.Input.Cursors.Hand
        };
    }

    FrameworkElement MakePrinterIcon(string type, double size, double opacity = 1)
    {
        var c = new Canvas { Width = size, Height = size, Opacity = opacity };
        double s = size / 100.0;
        Brush body = B("#34445B"), paper = Brushes.White, line = B("#D7DFEA");

        void R(double x, double y, double w, double h, Brush fill, double radius = 3)
            => c.Children.Add(new Rectangle { Width = w*s, Height = h*s, RadiusX = radius*s, RadiusY = radius*s, Fill = fill, Margin = new Thickness(x*s,y*s,0,0) });
        void E(double x, double y, double w, double h, Brush fill)
            => c.Children.Add(new Ellipse { Width=w*s, Height=h*s, Fill=fill, Margin=new Thickness(x*s,y*s,0,0) });

        if (type == "Thermal Receipt")
        {
            R(25, 18, 50, 64, body, 7); R(34, 8, 32, 24, paper, 2); R(31, 31, 38, 8, B("#182130"), 2); R(36, 72, 28, 5, B("#192231"), 2); E(63, 44, 7, 7, Blue);
        }
        else if (type == "Inkjet")
        {
            R(12, 38, 76, 35, body, 6); R(24, 16, 52, 29, paper, 2); R(23, 63, 54, 25, paper, 2); E(28, 78, 5, 5, B("#2E9BD0")); E(36, 78, 5, 5, B("#D64190")); E(44, 78, 5, 5, B("#E6B51C"));
        }
        else if (type == "Multifunction")
        {
            R(17, 28, 66, 50, body, 5); R(22, 13, 56, 16, B("#202A3A"), 3); R(27, 7, 46, 7, line, 2); R(27, 65, 46, 24, paper, 2); E(69, 43, 6, 6, Green);
        }
        else if (type == "Label / Barcode")
        {
            R(22, 25, 56, 56, body, 7); R(31, 16, 38, 20, paper, 2); R(31, 64, 38, 18, paper, 2); R(36, 68, 2, 10, Ink, 0); R(42, 68, 4, 10, Ink, 0); R(50, 68, 2, 10, Ink, 0); R(56, 68, 5, 10, Ink, 0);
        }
        else if (type == "Virtual Printer")
        {
            R(25, 12, 50, 70, paper, 2); c.Children.Add(new Polygon { Points = new PointCollection { new(60*s,12*s), new(75*s,27*s), new(60*s,27*s) }, Fill = line }); R(34, 40, 32, 4, Navy, 1); R(34, 51, 26, 4, Muted, 1); R(34, 62, 30, 4, Muted, 1);
        }
        else if (type == "Unknown")
        {
            R(15, 36, 70, 34, body, 6); R(26, 15, 48, 30, paper, 2); R(27, 62, 46, 26, paper, 2); var q = new TextBlock { Text = "?", FontSize = 31*s, FontWeight = FontWeights.Bold, Foreground = Amber }; Canvas.SetLeft(q, 43*s); Canvas.SetTop(q, 29*s); c.Children.Add(q);
        }
        else
        {
            R(14, 36, 72, 36, body, 6); R(26, 13, 48, 31, paper, 2); R(27, 63, 46, 25, paper, 2); E(72, 47, 6, 6, Green);
        }
        return c;
    }

    void Build()
    {
        root.RowDefinitions.Add(new() { Height = new(102) });
        root.RowDefinitions.Add(new() { Height = new(46) });
        root.RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new() { Height = new(34) });

        var header = new Grid { Background = Brushes.White };
        header.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        header.ColumnDefinitions.Add(new() { Width = GridLength.Auto });

        var brand = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new(26,0,0,0) };
        brand.Children.Add(MakePrinterIcon("Laser", 54));
        var brandText = new StackPanel { Margin = new(15,0,0,0), VerticalAlignment = VerticalAlignment.Center };
        brandText.Children.Add(new TextBlock { Text = "Printer Rescue", FontSize = 29, FontWeight = FontWeights.Bold, Foreground = Ink });
        brandText.Children.Add(new TextBlock { Text = "Printer detection, diagnosis and recovery", FontSize = 13, Foreground = Muted, Margin = new(0,4,0,0) });
        brand.Children.Add(brandText);
        header.Children.Add(brand);

        var actions = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Margin = new(0,0,26,0) };
        var scan = Btn("Scan Printers", true); scan.Click += async (_, _) => await Scan();
        var windows = Btn("Windows Printers"); windows.Click += (_,_) => OpenUri("ms-settings:printers");
        var settings = Btn("Settings"); settings.Click += (_,_) => MessageBox.Show("Settings will be expanded after the driver-matching prototype.", "Printer Rescue");
        actions.Children.Add(scan); actions.Children.Add(windows); actions.Children.Add(settings);
        Grid.SetColumn(actions, 1); header.Children.Add(actions); root.Children.Add(header);

        var strip = new Grid { Background = B("#F0F5FD"), Margin = new(20,0,20,0) };
        for (int i=0;i<4;i++) strip.ColumnDefinitions.Add(new(){ Width=new(1,GridUnitType.Star)});
        count.Text="0 printers detected"; attention.Text="0 need attention"; scanTime.Text="Last scan: not yet";
        S(strip,count,0); S(strip,attention,1); attention.Foreground=Amber; S(strip,scanTime,2);
        var cat = new TextBlock { Text="●  Local catalogue", Foreground=Green, FontWeight=FontWeights.SemiBold, VerticalAlignment=VerticalAlignment.Center, HorizontalAlignment=HorizontalAlignment.Right };
        Grid.SetColumn(cat,3); strip.Children.Add(cat);
        var stripBorder = new Border { Background=B("#F0F5FD"), BorderBrush=Edge, BorderThickness=new(0,1,0,1), Child=strip };
        Grid.SetRow(stripBorder,1); root.Children.Add(stripBorder);

        var main = new Grid { Margin=new(20,16,20,16) };
        main.ColumnDefinitions.Add(new(){Width=new(57,GridUnitType.Star)}); main.ColumnDefinitions.Add(new(){Width=new(12)}); main.ColumnDefinitions.Add(new(){Width=new(43,GridUnitType.Star)});

        var lg = new Grid(); lg.RowDefinitions.Add(new(){Height=new(48)}); lg.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});
        lg.Children.Add(new TextBlock{Text="Printers and print devices",FontSize=16,FontWeight=FontWeights.SemiBold,Foreground=Ink,VerticalAlignment=VerticalAlignment.Center,Margin=new(16,0,0,0)});
        ConfigureTable(); Grid.SetRow(table,1); lg.Children.Add(table);
        var left=Panel(lg); main.Children.Add(left);

        var detail = new Grid { Margin=new(22) };
        detail.RowDefinitions.Add(new(){Height=GridLength.Auto}); detail.RowDefinitions.Add(new(){Height=GridLength.Auto}); detail.RowDefinitions.Add(new(){Height=GridLength.Auto}); detail.RowDefinitions.Add(new(){Height=GridLength.Auto}); detail.RowDefinitions.Add(new(){Height=GridLength.Auto}); detail.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});
        detail.Children.Add(new TextBlock{Text="Selected Printer",FontSize=16,FontWeight=FontWeights.SemiBold,Foreground=Ink});

        var hero = new Grid{Margin=new(0,18,0,18)}; hero.ColumnDefinitions.Add(new(){Width=new(150)}); hero.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        detailIcon.Content=MakePrinterIcon("Unknown",105); hero.Children.Add(detailIcon);
        var heroText = new StackPanel{VerticalAlignment=VerticalAlignment.Center};
        dn.Text="Select a printer"; dn.FontSize=21; dn.FontWeight=FontWeights.Bold; dn.Foreground=Ink; dn.TextWrapping=TextWrapping.Wrap;
        dman.Foreground=Muted; dman.Margin=new(0,4,0,0); ds.Margin=new(0,12,0,0); ds.FontWeight=FontWeights.SemiBold;
        heroText.Children.Add(dn); heroText.Children.Add(dman); heroText.Children.Add(ds); Grid.SetColumn(heroText,1); hero.Children.Add(heroText); Grid.SetRow(hero,1); detail.Children.Add(hero);

        var wm = MakePrinterIcon("Laser",210,.035); wm.HorizontalAlignment=HorizontalAlignment.Right; wm.VerticalAlignment=VerticalAlignment.Top; wm.Margin=new(0,55,-18,0); Grid.SetRowSpan(wm,6); detail.Children.Add(wm);

        var fields = new Grid(); fields.ColumnDefinitions.Add(new(){Width=new(145)}); fields.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        for(int i=0;i<6;i++) fields.RowDefinitions.Add(new(){Height=new(39)});
        F(fields,"Type",dt,0); F(fields,"Connection",dc,1); F(fields,"Port",dp,2); F(fields,"Driver",dd,3); F(fields,"Hardware ID",dh,4);
        var rr = new TextBlock{Text="Recovery path",Foreground=Muted,VerticalAlignment=VerticalAlignment.Center}; Grid.SetRow(rr,5); fields.Children.Add(rr);
        var rv = new TextBlock{Text="Select a printer",Foreground=Ink,FontWeight=FontWeights.SemiBold,VerticalAlignment=VerticalAlignment.Center}; Grid.SetRow(rv,5); Grid.SetColumn(rv,1); fields.Children.Add(rv);
        fields.Tag=rv; Grid.SetRow(fields,2); detail.Children.Add(fields);

        var note = new TextBlock{Text="Automatic online matching is the next layer. This prototype already performs real Windows detection, test printing, official support routing and local INF installation.",Foreground=Muted,TextWrapping=TextWrapping.Wrap,Margin=new(0,14,0,18)}; Grid.SetRow(note,3); detail.Children.Add(note);

        var buttons = new Grid(); buttons.ColumnDefinitions.Add(new()); buttons.ColumnDefinitions.Add(new());
        findDriverButton.Margin=new(0,0,6,8); installInfButton.Margin=new(6,0,0,8); testPrintButton.Margin=new(0,0,6,0); copyHwButton.Margin=new(6,0,0,0);
        Grid.SetColumn(installInfButton,1); Grid.SetRow(testPrintButton,1); Grid.SetColumn(copyHwButton,1); Grid.SetRow(copyHwButton,1);
        buttons.RowDefinitions.Add(new(){Height=GridLength.Auto}); buttons.RowDefinitions.Add(new(){Height=GridLength.Auto});
        buttons.Children.Add(findDriverButton); buttons.Children.Add(installInfButton); buttons.Children.Add(testPrintButton); buttons.Children.Add(copyHwButton); Grid.SetRow(buttons,4); detail.Children.Add(buttons);
        findDriverButton.Click += (_,_) => FindDriver(); installInfButton.Click += async (_,_) => await InstallInf(); testPrintButton.Click += async(_,_)=>await TestPrint(); copyHwButton.Click += (_,_)=>CopyHardwareId();

        var right=Panel(new ScrollViewer{Content=detail,VerticalScrollBarVisibility=ScrollBarVisibility.Auto}); Grid.SetColumn(right,2); main.Children.Add(right); Grid.SetRow(main,2); root.Children.Add(main);

        foot.Text="Ready. No driver changes are made unless you explicitly choose a local INF file."; foot.Foreground=Muted; foot.FontSize=12; foot.HorizontalAlignment=HorizontalAlignment.Center; foot.VerticalAlignment=VerticalAlignment.Center; Grid.SetRow(foot,3); root.Children.Add(foot);
        UpdateActions();
    }

    void ConfigureTable()
    {
        table.AutoGenerateColumns=false; table.HeadersVisibility=DataGridHeadersVisibility.Column; table.GridLinesVisibility=DataGridGridLinesVisibility.Horizontal; table.BorderThickness=new(0); table.RowHeight=66; table.ColumnHeaderHeight=38; table.IsReadOnly=true; table.SelectionMode=DataGridSelectionMode.Single; table.Background=Brushes.White; table.HorizontalGridLinesBrush=Edge; table.SelectionChanged+=(_,_)=>SelectCurrent();
        table.Columns.Add(MakePrinterColumn());
        Col("Type","Type",1.05); Col("Connection","Connection",.9); Col("Driver","Driver",1.7); Col("Status","Status",1.0);
    }

    DataGridTemplateColumn MakePrinterColumn()
    {
        var template = new DataTemplate();
        var root = new FrameworkElementFactory(typeof(StackPanel)); root.SetValue(StackPanel.OrientationProperty, Orientation.Horizontal); root.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
        var icon = new FrameworkElementFactory(typeof(ContentControl)); icon.SetValue(FrameworkElement.WidthProperty, 38.0); icon.SetValue(FrameworkElement.HeightProperty, 38.0); icon.SetValue(FrameworkElement.MarginProperty, new Thickness(4,0,10,0)); icon.SetBinding(ContentControl.ContentProperty,new Binding("Type"){Converter=new TypeIconConverter()});
        var text = new FrameworkElementFactory(typeof(StackPanel)); text.SetValue(StackPanel.OrientationProperty,Orientation.Vertical);
        var name = new FrameworkElementFactory(typeof(TextBlock)); name.SetBinding(TextBlock.TextProperty,new Binding("Name")); name.SetValue(TextBlock.FontWeightProperty,FontWeights.SemiBold); name.SetValue(TextBlock.ForegroundProperty,Ink); name.SetValue(TextBlock.TextTrimmingProperty,TextTrimming.CharacterEllipsis);
        var man = new FrameworkElementFactory(typeof(TextBlock)); man.SetBinding(TextBlock.TextProperty,new Binding("Manufacturer")); man.SetValue(TextBlock.FontSizeProperty,11.0); man.SetValue(TextBlock.ForegroundProperty,Muted); man.SetValue(FrameworkElement.MarginProperty,new Thickness(0,3,0,0));
        text.AppendChild(name); text.AppendChild(man); root.AppendChild(icon); root.AppendChild(text); template.VisualTree=root;
        return new DataGridTemplateColumn{Header="Printer",CellTemplate=template,Width=new DataGridLength(2.2,DataGridLengthUnitType.Star)};
    }

    public static FrameworkElement SmallIcon(string type)
    {
        var border = new Border{Width=30,Height=30,CornerRadius=new CornerRadius(7),Background=B("#EEF4FD"),HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
        string glyph = type switch { "Thermal Receipt"=>"▥", "Inkjet"=>"◫", "Multifunction"=>"▤", "Label / Barcode"=>"▧", "Virtual Printer"=>"◇", "Unknown"=>"?", _=>"▣" };
        border.Child=new TextBlock{Text=glyph,Foreground=Navy,FontSize=18,FontWeight=FontWeights.Bold,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center}; return border;
    }

    sealed class TypeIconConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture) => SmallIcon(value?.ToString() ?? "Unknown");
        public object ConvertBack(object value, Type targetType, object parameter, System.Globalization.CultureInfo culture) => throw new NotSupportedException();
    }

    Border Panel(UIElement child)=>new(){Background=Brushes.White,BorderBrush=Edge,BorderThickness=new(1),CornerRadius=new(9),Child=child};
    void S(Grid g,TextBlock t,int c){t.Foreground=Ink;t.FontWeight=FontWeights.SemiBold;t.VerticalAlignment=VerticalAlignment.Center;t.Margin=new(10,0,10,0);Grid.SetColumn(t,c);g.Children.Add(t);}
    void F(Grid g,string label,TextBlock value,int row){var l=new TextBlock{Text=label,Foreground=Muted,VerticalAlignment=VerticalAlignment.Center};value.Foreground=Ink;value.VerticalAlignment=VerticalAlignment.Center;value.TextTrimming=TextTrimming.CharacterEllipsis;Grid.SetRow(l,row);Grid.SetRow(value,row);Grid.SetColumn(value,1);g.Children.Add(l);g.Children.Add(value);}
    void Col(string h,string binding,double width)=>table.Columns.Add(new DataGridTextColumn{Header=h,Binding=new Binding(binding),Width=new DataGridLength(width,DataGridLengthUnitType.Star)});

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

    List<PrinterItem> Detect()
    {
        string script=@"
$ErrorActionPreference='SilentlyContinue'
$queues=@(Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Network,Local,WorkOffline,PrinterStatus)
$pnp=@(Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Printer' -or $_.PNPClass -eq 'PrintQueue' } | Select-Object Name,Manufacturer,PNPDeviceID,HardwareID,Status,ConfigManagerErrorCode)
$out=@()
foreach($q in $queues){
  $best=$pnp | Where-Object { $_.Name -eq $q.Name -or ($_.Name -and $q.Name -and ($_.Name.Contains($q.Name) -or $q.Name.Contains($_.Name))) } | Select-Object -First 1
  $out += [pscustomobject]@{Kind='Queue';Name=$q.Name;DriverName=$q.DriverName;PortName=$q.PortName;Network=$q.Network;Local=$q.Local;WorkOffline=$q.WorkOffline;PrinterStatus=$q.PrinterStatus;Manufacturer=if($best){$best.Manufacturer}else{''};DeviceId=if($best){$best.PNPDeviceID}else{''};HardwareId=if($best -and $best.HardwareID){($best.HardwareID -join ';')}else{''};PnpStatus=if($best){$best.Status}else{''};ErrorCode=if($best){$best.ConfigManagerErrorCode}else{0}}
}
foreach($d in $pnp){
  if(-not ($out | Where-Object { $_.DeviceId -and $_.DeviceId -eq $d.PNPDeviceID })){
    $out += [pscustomobject]@{Kind='Device';Name=$d.Name;DriverName='';PortName='';Network=$false;Local=$true;WorkOffline=$false;PrinterStatus=0;Manufacturer=$d.Manufacturer;DeviceId=$d.PNPDeviceID;HardwareId=if($d.HardwareID){($d.HardwareID -join ';')}else{''};PnpStatus=$d.Status;ErrorCode=$d.ConfigManagerErrorCode}
  }
}
$out | ConvertTo-Json -Compress -Depth 4
";
        string json=RunPowerShell(script);
        if(string.IsNullOrWhiteSpace(json)) return new();
        using var doc=JsonDocument.Parse(json);
        var els=doc.RootElement.ValueKind==JsonValueKind.Array?doc.RootElement.EnumerateArray().ToArray():new[]{doc.RootElement};
        var list=new List<PrinterItem>();
        foreach(var z in els)
        {
            string G(string n)=>z.TryGetProperty(n,out var v)&&v.ValueKind!=JsonValueKind.Null?v.ToString():"";
            bool GB(string n)=>z.TryGetProperty(n,out var v)&&v.ValueKind==JsonValueKind.True;
            int GI(string n)=>z.TryGetProperty(n,out var v)&&v.TryGetInt32(out var i)?i:0;
            var name=G("Name"); if(string.IsNullOrWhiteSpace(name)) continue;
            var driver=G("DriverName"); var port=G("PortName"); var dev=G("DeviceId"); var hw=G("HardwareId"); var man=CleanManufacturer(G("Manufacturer"),name,driver);
            bool virt=IsVirtual(name,driver,port);
            string type=virt?"Virtual Printer":InferType(name+" "+driver+" "+man);
            string connection=virt?"Virtual":(dev.StartsWith("USB",StringComparison.OrdinalIgnoreCase)||port.StartsWith("USB",StringComparison.OrdinalIgnoreCase)?"USB":(GB("Network")||port.StartsWith("IP_",StringComparison.OrdinalIgnoreCase)||port.Contains('.')?"Network":"Local"));
            bool hasQueue=G("Kind")=="Queue";
            int err=GI("ErrorCode"); string pnp=G("PnpStatus");
            string status=virt?"Virtual":(!hasQueue||string.IsNullOrWhiteSpace(driver)?(err!=0?"Problem":"Driver missing"):(err!=0||pnp.Equals("Error",StringComparison.OrdinalIgnoreCase)?"Problem":"Installed"));
            list.Add(new PrinterItem{Name=name,Manufacturer=man,Type=type,Connection=connection,Driver=string.IsNullOrWhiteSpace(driver)?"No installed queue driver":driver,Status=status,Port=port,HardwareId=hw,DeviceId=dev,IsVirtual=virt,HasQueue=hasQueue,SupportUrl=SupportUrl(man,name)});
        }
        return list.GroupBy(x=>x.DeviceId.Length>0?x.DeviceId:x.Name,StringComparer.OrdinalIgnoreCase).Select(g=>g.OrderByDescending(x=>x.HasQueue).First()).OrderBy(x=>x.IsVirtual).ThenBy(x=>x.Name).ToList();
    }

    static string RunPowerShell(string script)
    {
        var pi=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -Command -"){UseShellExecute=false,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true,StandardOutputEncoding=Encoding.UTF8};
        using var p=Process.Start(pi)??throw new Exception("Could not start PowerShell."); p.StandardInput.Write(script); p.StandardInput.Close(); string o=p.StandardOutput.ReadToEnd(); string e=p.StandardError.ReadToEnd(); p.WaitForExit(); if(p.ExitCode!=0 && string.IsNullOrWhiteSpace(o)) throw new Exception(e); return o.Trim();
    }

    static bool IsVirtual(string n,string d,string p)
    {
        string s=(n+" "+d+" "+p).ToLowerInvariant(); string[] keys={"microsoft print to pdf","onenote","pdf24","adobe pdf","xps document","fax","dopdf","cutepdf","foxit pdf","portprompt:"}; return keys.Any(s.Contains);
    }
    static string CleanManufacturer(string m,string n,string d){if(!string.IsNullOrWhiteSpace(m)&&!m.Equals("Microsoft",StringComparison.OrdinalIgnoreCase))return m;string s=(n+" "+d).ToLowerInvariant();if(s.Contains("hp ")||s.Contains("hewlett"))return"HP";if(s.Contains("canon"))return"Canon";if(s.Contains("epson"))return"Epson";if(s.Contains("brother"))return"Brother";if(s.Contains("xprinter")||s.Contains("x printer"))return"Xprinter";if(s.Contains("ricoh"))return"Ricoh";if(s.Contains("kyocera"))return"Kyocera";if(s.Contains("zebra"))return"Zebra";return string.IsNullOrWhiteSpace(m)?"Unknown manufacturer":m;}
    static string InferType(string s){if(s.Contains("receipt",StringComparison.OrdinalIgnoreCase)||s.Contains("thermal",StringComparison.OrdinalIgnoreCase)||s.Contains("xprinter",StringComparison.OrdinalIgnoreCase)||s.Contains("pos",StringComparison.OrdinalIgnoreCase))return"Thermal Receipt";if(s.Contains("label",StringComparison.OrdinalIgnoreCase)||s.Contains("barcode",StringComparison.OrdinalIgnoreCase)||s.Contains("zebra",StringComparison.OrdinalIgnoreCase))return"Label / Barcode";if(s.Contains("inkjet",StringComparison.OrdinalIgnoreCase)||s.Contains("deskjet",StringComparison.OrdinalIgnoreCase)||s.Contains("ecotank",StringComparison.OrdinalIgnoreCase)||s.Contains("officejet",StringComparison.OrdinalIgnoreCase))return"Inkjet";if(s.Contains("mfp",StringComparison.OrdinalIgnoreCase)||s.Contains("multifunction",StringComparison.OrdinalIgnoreCase)||s.Contains("all-in-one",StringComparison.OrdinalIgnoreCase))return"Multifunction";if(s.Contains("laser",StringComparison.OrdinalIgnoreCase)||s.Contains("laserjet",StringComparison.OrdinalIgnoreCase)||s.Contains("hl-",StringComparison.OrdinalIgnoreCase))return"Laser";return"Printer";}
    static string SupportUrl(string m,string n){string x=m.ToLowerInvariant();if(x.Contains("hp"))return"https://support.hp.com/emea_africa-en/drivers/printers";if(x.Contains("canon"))return"https://www.canon-europe.com/support/consumer/products/printers/";if(x.Contains("epson"))return"https://support.epson.com/";if(x.Contains("brother"))return"https://support.brother.com/";if(x.Contains("xprinter"))return"https://www.xprintertech.com/download.html";if(x.Contains("ricoh"))return"https://support.ricoh.com/";if(x.Contains("kyocera"))return"https://www.kyoceradocumentsolutions.com/download/";if(x.Contains("zebra"))return"https://www.zebra.com/us/en/support-downloads/printers.html";return"";}

    void SelectCurrent()
    {
        selected=table.SelectedItem as PrinterItem; if(selected==null){ClearDetail();return;}
        dn.Text=selected.Name; dman.Text=selected.Manufacturer; dt.Text=selected.Type; dc.Text=selected.Connection; dp.Text=string.IsNullOrWhiteSpace(selected.Port)?"Not assigned":selected.Port; dd.Text=selected.Driver; dh.Text=string.IsNullOrWhiteSpace(selected.HardwareId)?"Not exposed by Windows for this item":selected.HardwareId; detailIcon.Content=MakePrinterIcon(selected.Type,105);
        ds.Text=selected.Status switch{"Installed"=>"●  Installed","Virtual"=>"●  Virtual printer","Driver missing"=>"●  Driver missing","Problem"=>"●  Device problem",_=>"●  "+selected.Status}; ds.Foreground=selected.Status=="Installed"?Green:selected.Status=="Virtual"?Muted:selected.Status=="Problem"?Red:Amber;
        if(FindVisualChild<Grid>(detailIcon.Parent as DependencyObject)?.Tag is TextBlock) { }
        var fields = FindTaggedRecovery(); if(fields!=null) fields.Text=selected.IsVirtual?"No hardware driver required":(selected.Status=="Installed"?"Driver already present":selected.SupportUrl.Length>0?"Official vendor support available":"Local INF installation available");
        UpdateActions();
    }
    TextBlock? FindTaggedRecovery(){if(root==null)return null;return FindByTag(root); TextBlock? FindByTag(DependencyObject d){for(int i=0;i<VisualTreeHelper.GetChildrenCount(d);i++){var c=VisualTreeHelper.GetChild(d,i);if(c is Grid g&&g.Tag is TextBlock t)return t;var x=FindByTag(c);if(x!=null)return x;}return null;}}
    static T? FindVisualChild<T>(DependencyObject? d) where T:DependencyObject{if(d==null)return null;for(int i=0;i<VisualTreeHelper.GetChildrenCount(d);i++){var c=VisualTreeHelper.GetChild(d,i);if(c is T t)return t;var x=FindVisualChild<T>(c);if(x!=null)return x;}return null;}
    void ClearDetail(){dn.Text="Select a printer";dman.Text="";dt.Text=dc.Text=dp.Text=dd.Text=dh.Text=ds.Text="";detailIcon.Content=MakePrinterIcon("Unknown",105);UpdateActions();}
    void UpdateActions(){bool has=selected!=null;findDriverButton.IsEnabled=has&&!selected!.IsVirtual&&!string.IsNullOrWhiteSpace(selected.SupportUrl);installInfButton.IsEnabled=has&&!selected!.IsVirtual;testPrintButton.IsEnabled=has&&selected!.HasQueue&&!selected.IsVirtual;copyHwButton.IsEnabled=has&&!string.IsNullOrWhiteSpace(selected!.HardwareId);}

    void FindDriver(){if(selected==null||string.IsNullOrWhiteSpace(selected.SupportUrl))return;OpenUri(selected.SupportUrl);foot.Text=$"Opened {selected.Manufacturer} support for {selected.Name}.";}
    static void OpenUri(string uri){try{Process.Start(new ProcessStartInfo(uri){UseShellExecute=true});}catch(Exception ex){MessageBox.Show(ex.Message,"Printer Rescue");}}
    void CopyHardwareId(){if(selected==null||string.IsNullOrWhiteSpace(selected.HardwareId))return;Clipboard.SetText(selected.HardwareId);foot.Text="Hardware ID copied.";}

    async Task TestPrint()
    {
        if(selected==null||!selected.HasQueue)return;
        foot.Text=$"Sending Windows test page to {selected.Name}…";
        string safe=selected.Name.Replace("'","''");
        try{string r=await Task.Run(()=>RunPowerShell($"$p=Get-CimInstance Win32_Printer | Where-Object {{$_.Name -eq '{safe}'}} | Select-Object -First 1; if(-not $p){{throw 'Printer queue not found'}}; $x=Invoke-CimMethod -InputObject $p -MethodName PrintTestPage; $x.ReturnValue")); if(r.Trim()=="0"){foot.Text="Test page sent successfully.";MessageBox.Show("Windows accepted the test-page request.","Printer Rescue",MessageBoxButton.OK,MessageBoxImage.Information);}else{foot.Text=$"Test page returned code {r}.";MessageBox.Show($"Windows returned code {r}.","Printer Rescue",MessageBoxButton.OK,MessageBoxImage.Warning);}}catch(Exception ex){foot.Text="Test print failed.";MessageBox.Show(ex.Message,"Test print failed",MessageBoxButton.OK,MessageBoxImage.Warning);}
    }

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
}

public static class Program
{
    [STAThread]
    public static void Main() => new Application().Run(new MainWindow());
}
