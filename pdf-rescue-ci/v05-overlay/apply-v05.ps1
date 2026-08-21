$ErrorActionPreference = 'Stop'

Copy-Item 'pdf-rescue-ci/v05-overlay/src/*' 'pdf-rescue/src' -Recurse -Force

$main = 'pdf-rescue/src/PdfRescue.App/MainWindow.xaml.cs'
$text = Get-Content $main -Raw
$text = $text.Replace('private readonly PdfDoctor _doctor;', 'private readonly PdfDoctorV05 _doctor;')
$text = $text.Replace('_doctor = new PdfDoctor(new QpdfInspector(runner, qpdf));', '_doctor = new PdfDoctorV05(new EnhancedPdfInspector(runner, qpdf));')
$resetReplacement = 'InspectorSecurity.Text = "Not checked";' + "`r`n" +
    '            InspectorFeatures.Text = "Run PDF Doctor to inspect";' + "`r`n" +
    '            HealthText.Text = "Not checked";'
$text = $text -replace 'InspectorSecurity.Text = "Not checked";\r?\n\s*HealthText.Text = "Not checked";', $resetReplacement
$oldSecurity = 'InspectorSecurity.Text = report.Inspection.IsEncrypted ? "Encrypted" : "Not encrypted";'
$newSecurity = @'
var features = report.Inspection.Features ?? PdfFeatureSummary.Empty;
            InspectorSecurity.Text = report.Inspection.IsEncrypted
                ? string.IsNullOrWhiteSpace(features.EncryptionMethod) ? "Encrypted" : $"Encrypted · {features.EncryptionMethod}"
                : "Not encrypted";
            InspectorFeatures.Text = BuildDoctorFeatureSummary(report.Inspection);
'@
$text = $text.Replace($oldSecurity, $newSecurity.TrimEnd())
Set-Content $main $text -NoNewline

$xaml = 'pdf-rescue/src/PdfRescue.App/MainWindow.xaml'
$x = Get-Content $xaml -Raw
$old = '<TextBlock x:Name="InspectorSecurity" Text="Not checked" Margin="0,3,0,16" />'
$new = @'
<TextBlock x:Name="InspectorSecurity" Text="Not checked" Margin="0,3,0,10" TextWrapping="Wrap" />
                        <TextBlock Text="Document features" FontWeight="SemiBold" FontSize="12" Foreground="{StaticResource MutedTextBrush}" />
                        <TextBlock x:Name="InspectorFeatures" Text="Run PDF Doctor to inspect" Margin="0,3,0,16" TextWrapping="Wrap" />
'@
$x = $x.Replace($old, $new.TrimEnd())
$oldFindings = '<ItemsControl x:Name="FindingsList" Margin="0,10,0,0" />'
$newFindings = @'
<ItemsControl x:Name="FindingsList" Margin="0,10,0,10" />
                        <TextBlock Text="Recommended actions" FontWeight="SemiBold" FontSize="12" Foreground="{StaticResource MutedTextBrush}" Margin="0,8,0,6" />
                        <WrapPanel>
                            <Button Content="Repair Copy" Click="Repair_Click" Margin="0,0,6,6" Padding="8,4" />
                            <Button Content="Compress Copy" Click="Compress_Click" Margin="0,0,6,6" Padding="8,4" />
                            <Button Content="Optimize Web" Click="Linearize_Click" Margin="0,0,6,6" Padding="8,4" />
                        </WrapPanel>
'@
$x = $x.Replace($oldFindings, $newFindings.TrimEnd())
Set-Content $xaml $x -NoNewline

$cli = 'pdf-rescue/src/PdfRescue.Cli/Program.cs'
$c = Get-Content $cli -Raw
$c = $c.Replace('var inspector = new QpdfInspector(runner);', 'var inspector = new EnhancedPdfInspector(runner);')
$c = $c.Replace('var doctor = new PdfDoctor(inspector);', 'var doctor = new PdfDoctorV05(inspector);')
$cliFeatureOutput = 'Console.WriteLine($"Encrypted: {(report.Inspection.IsEncrypted ? "Yes" : "No")}");' + "`r`n" +
    '            var features = report.Inspection.Features ?? PdfFeatureSummary.Empty;' + "`r`n" +
    '            Console.WriteLine($"Features: images={features.ImageCount}; imagePages={features.PagesWithImages}; forms={features.HasForms}; js={features.HasJavaScript}; signatures={features.HasDigitalSignatures}; linearized={features.IsLinearized}");'
$c = $c.Replace('Console.WriteLine($"Encrypted: {(report.Inspection.IsEncrypted ? "Yes" : "No")}");', $cliFeatureOutput)
Set-Content $cli $c -NoNewline

$iss = 'pdf-rescue/installer/PdfRescue.iss'
$i = Get-Content $iss -Raw
$i = $i.Replace('#define MyAppVersion "0.4.0"', '#define MyAppVersion "0.5.0"')
Set-Content $iss $i -NoNewline

if ((Get-Content $main -Raw) -notmatch 'EnhancedPdfInspector') { throw '0.5 MainWindow patch failed.' }
if ((Get-Content $xaml -Raw) -notmatch 'InspectorFeatures') { throw '0.5 XAML patch failed.' }
if ((Get-Content $cli -Raw) -notmatch 'PdfDoctorV05') { throw '0.5 CLI patch failed.' }
Write-Host 'PASS: PDF Rescue 0.5 Doctor overlay applied.'
