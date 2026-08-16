using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace PrinterRescue;

public sealed class PrinterRescueSettings
{
    public bool ScanOnLaunch { get; set; } = true;
    public bool IncludeVirtualPrinters { get; set; } = true;
}

public sealed class SettingsWindow : Window
{
    static readonly Brush Ink = BrushFrom("#172033");
    static readonly Brush Muted = BrushFrom("#5B6981");
    static readonly Brush Blue = BrushFrom("#1E5BBF");
    static readonly Brush Edge = BrushFrom("#DBE1EB");
    static readonly Brush Bg = BrushFrom("#F7F9FC");

    readonly CheckBox scanOnLaunch = new();
    readonly CheckBox includeVirtual = new();
    readonly TextBlock changeHint = new();
    readonly PrinterRescueSettings original;

    static string SettingsDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PrinterRescue");
    static string SettingsPath => Path.Combine(SettingsDirectory, "settings.json");
    static Brush BrushFrom(string value) => (Brush)new BrushConverter().ConvertFromString(value)!;

    public static PrinterRescueSettings LoadSettings()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return new PrinterRescueSettings();
            return JsonSerializer.Deserialize<PrinterRescueSettings>(File.ReadAllText(SettingsPath)) ?? new PrinterRescueSettings();
        }
        catch
        {
            return new PrinterRescueSettings();
        }
    }

    public SettingsWindow(Window owner)
    {
        Owner = owner;
        Title = "Printer Rescue Settings";
        Width = 570;
        Height = 430;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;
        Background = Bg;
        FontFamily = new FontFamily("Segoe UI");
        original = LoadSettings();
        Content = BuildContent();
        Apply(original);

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) { DialogResult = false; Close(); }
        };
    }

    UIElement BuildContent()
    {
        var root = new Grid { Margin = new Thickness(24) };
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var heading = new StackPanel { Margin = new Thickness(0, 0, 0, 18) };
        heading.Children.Add(new TextBlock { Text = "Settings", FontSize = 25, FontWeight = FontWeights.Bold, Foreground = Ink });
        heading.Children.Add(new TextBlock { Text = "Choose what Printer Rescue scans and what happens when the app opens.", FontSize = 13, Foreground = Muted, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 5, 0, 0) });
        root.Children.Add(heading);

        var body = new StackPanel();
        body.Children.Add(SectionTitle("Scanning"));
        body.Children.Add(SettingRow(scanOnLaunch, "Scan automatically when Printer Rescue opens", "Turn this off if you prefer to start scans manually."));
        body.Children.Add(SettingRow(includeVirtual, "Show virtual printers", "Include Microsoft Print to PDF, OneNote, PDF tools and similar software printers."));
        scanOnLaunch.Checked += (_, _) => UpdateChangeHint();
        scanOnLaunch.Unchecked += (_, _) => UpdateChangeHint();
        includeVirtual.Checked += (_, _) => UpdateChangeHint();
        includeVirtual.Unchecked += (_, _) => UpdateChangeHint();

        changeHint.FontSize = 12;
        changeHint.Foreground = Muted;
        changeHint.Margin = new Thickness(2, 7, 0, 0);
        body.Children.Add(changeHint);

        var scroll = new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Grid.SetRow(scroll, 1);
        root.Children.Add(scroll);

        var footer = new Grid { Margin = new Thickness(0, 18, 0, 0) };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var reset = MakeButton("Reset defaults", false);
        reset.Click += (_, _) => Apply(new PrinterRescueSettings());
        footer.Children.Add(reset);

        var actions = new StackPanel { Orientation = Orientation.Horizontal };
        var cancel = MakeButton("Cancel", false);
        cancel.IsCancel = true;
        cancel.Click += (_, _) => { DialogResult = false; Close(); };
        var save = MakeButton("Save changes", true);
        save.IsDefault = true;
        save.Click += (_, _) => SaveAndClose();
        actions.Children.Add(cancel);
        actions.Children.Add(save);
        Grid.SetColumn(actions, 1);
        footer.Children.Add(actions);

        Grid.SetRow(footer, 2);
        root.Children.Add(footer);
        return root;
    }

    FrameworkElement SectionTitle(string text) => new TextBlock
    {
        Text = text,
        FontSize = 14,
        FontWeight = FontWeights.SemiBold,
        Foreground = Ink,
        Margin = new Thickness(0, 5, 0, 8)
    };

    FrameworkElement SettingRow(CheckBox box, string title, string description)
    {
        var border = new Border
        {
            Background = Brushes.White,
            BorderBrush = Edge,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Padding = new Thickness(14),
            Margin = new Thickness(0, 0, 0, 9)
        };
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        box.Width = 22;
        box.Height = 22;
        box.VerticalAlignment = VerticalAlignment.Top;
        box.Margin = new Thickness(0, 2, 12, 0);
        grid.Children.Add(box);

        var text = new StackPanel();
        text.Children.Add(new TextBlock { Text = title, FontSize = 14, FontWeight = FontWeights.SemiBold, Foreground = Ink, TextWrapping = TextWrapping.Wrap });
        text.Children.Add(new TextBlock { Text = description, FontSize = 12, Foreground = Muted, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0) });
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        border.Child = grid;
        return border;
    }

    Button MakeButton(string text, bool primary) => new()
    {
        Content = text,
        Height = 38,
        MinWidth = 100,
        Padding = new Thickness(16, 0, 16, 0),
        Margin = new Thickness(8, 0, 0, 0),
        Background = primary ? Blue : Brushes.White,
        Foreground = primary ? Brushes.White : Ink,
        BorderBrush = primary ? Blue : Edge,
        BorderThickness = new Thickness(1),
        FontWeight = FontWeights.SemiBold,
        Cursor = Cursors.Hand
    };

    void Apply(PrinterRescueSettings settings)
    {
        scanOnLaunch.IsChecked = settings.ScanOnLaunch;
        includeVirtual.IsChecked = settings.IncludeVirtualPrinters;
        UpdateChangeHint();
    }

    void UpdateChangeHint()
    {
        bool changed = scanOnLaunch.IsChecked != original.ScanOnLaunch || includeVirtual.IsChecked != original.IncludeVirtualPrinters;
        changeHint.Text = changed ? "Changes will apply as soon as you save." : "No unsaved changes.";
    }

    void SaveAndClose()
    {
        try
        {
            Directory.CreateDirectory(SettingsDirectory);
            var settings = new PrinterRescueSettings
            {
                ScanOnLaunch = scanOnLaunch.IsChecked == true,
                IncludeVirtualPrinters = includeVirtual.IsChecked == true
            };
            File.WriteAllText(SettingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Printer Rescue could not save settings.\n\n" + ex.Message, "Settings", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }
}
