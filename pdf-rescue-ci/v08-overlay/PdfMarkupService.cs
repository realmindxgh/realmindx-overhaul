using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

namespace PdfRescue.App.Services;

public readonly record struct NormalizedPdfRect(double X, double Y, double Width, double Height)
{
    public NormalizedPdfRect Clamp()
    {
        var x = Math.Clamp(X, 0d, 1d);
        var y = Math.Clamp(Y, 0d, 1d);
        var width = Math.Clamp(Width, 0d, 1d - x);
        var height = Math.Clamp(Height, 0d, 1d - y);
        return new NormalizedPdfRect(x, y, width, height);
    }
}

public sealed class PdfMarkupService
{
    public Task AddHighlightAsync(string inputPath, string outputPath, int pageNumber, NormalizedPdfRect area, CancellationToken token = default) =>
        ModifyPageAsync(inputPath, outputPath, pageNumber, (page, gfx) =>
        {
            var r = ToPageRect(page, area.Clamp());
            var brush = new XSolidBrush(XColor.FromArgb(90, 255, 235, 59));
            gfx.DrawRectangle(brush, r);
        }, token);

    public Task AddTextAsync(string inputPath, string outputPath, int pageNumber, double normalizedX, double normalizedY, string text, double fontSize = 14d, CancellationToken token = default) =>
        ModifyPageAsync(inputPath, outputPath, pageNumber, (page, gfx) =>
        {
            if (string.IsNullOrWhiteSpace(text)) throw new ArgumentException("Text cannot be empty.", nameof(text));
            var x = Math.Clamp(normalizedX, 0d, 1d) * page.Width.Point;
            var y = Math.Clamp(normalizedY, 0d, 1d) * page.Height.Point;
            var font = new XFont("Segoe UI", Math.Clamp(fontSize, 6d, 72d), XFontStyleEx.Regular);
            gfx.DrawString(text.Trim(), font, XBrushes.Black, new XPoint(x, y));
        }, token);

    /// <summary>
    /// Permanently redacts an area by rasterizing only the affected page, painting the
    /// selected pixels black, and replacing the original page with that raster image.
    /// Other pages remain imported as their original PDF content.
    /// </summary>
    public async Task PermanentRedactAsync(string inputPath, string outputPath, int pageNumber, NormalizedPdfRect area, CancellationToken token = default)
    {
        var input = Path.GetFullPath(inputPath);
        var output = Path.GetFullPath(outputPath);
        ValidatePaths(input, output);
        var rect = area.Clamp();
        if (rect.Width < 0.002 || rect.Height < 0.002)
            throw new ArgumentException("The redaction area is too small.", nameof(area));

        var tempDir = Path.Combine(Path.GetTempPath(), "PDF Rescue", "redaction", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var rasterPath = Path.Combine(tempDir, "redacted-page.png");
        var rawOutput = Path.Combine(tempDir, "redacted-raw.pdf");
        var normalizedOutput = Path.Combine(tempDir, "redacted-normalized.pdf");

        try
        {
            using var renderer = new WindowsPdfRenderer();
            await renderer.OpenAsync(input, token);
            if (pageNumber < 1 || pageNumber > renderer.PageCount)
                throw new ArgumentOutOfRangeException(nameof(pageNumber));

            var bitmap = await renderer.RenderAsync(pageNumber, 2400, token);
            token.ThrowIfCancellationRequested();

            var visual = new DrawingVisual();
            using (var dc = visual.RenderOpen())
            {
                dc.DrawImage(bitmap, new Rect(0, 0, bitmap.PixelWidth, bitmap.PixelHeight));
                var pixelRect = new Rect(
                    rect.X * bitmap.PixelWidth,
                    rect.Y * bitmap.PixelHeight,
                    rect.Width * bitmap.PixelWidth,
                    rect.Height * bitmap.PixelHeight);
                dc.DrawRectangle(Brushes.Black, null, pixelRect);
            }

            var redactedBitmap = new RenderTargetBitmap(
                bitmap.PixelWidth, bitmap.PixelHeight,
                bitmap.DpiX > 0 ? bitmap.DpiX : 96,
                bitmap.DpiY > 0 ? bitmap.DpiY : 96,
                PixelFormats.Pbgra32);
            redactedBitmap.Render(visual);
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(redactedBitmap));
            await using (var stream = new FileStream(rasterPath, FileMode.Create, FileAccess.Write, FileShare.None))
                encoder.Save(stream);

            token.ThrowIfCancellationRequested();
            using (var source = PdfReader.Open(input, PdfDocumentOpenMode.Import))
            using (var target = new PdfDocument())
            {
                for (var i = 0; i < source.Pages.Count; i++)
                {
                    token.ThrowIfCancellationRequested();
                    if (i != pageNumber - 1)
                    {
                        target.AddPage(source.Pages[i]);
                        continue;
                    }

                    var sourcePage = source.Pages[i];
                    var width = sourcePage.Width.Point;
                    var height = sourcePage.Height.Point;
                    var rasterLandscape = redactedBitmap.PixelWidth > redactedBitmap.PixelHeight;
                    var pageLandscape = width > height;
                    if (rasterLandscape != pageLandscape)
                        (width, height) = (height, width);

                    var replacement = target.AddPage();
                    replacement.Width = XUnit.FromPoint(width);
                    replacement.Height = XUnit.FromPoint(height);
                    using var gfx = XGraphics.FromPdfPage(replacement);
                    using var image = XImage.FromFile(rasterPath);
                    gfx.DrawImage(image, 0, 0, width, height);
                }
                target.Save(rawOutput);
            }

            token.ThrowIfCancellationRequested();
            var sourceForCommit = NormalizeWithQpdf(rawOutput, normalizedOutput, token) ? normalizedOutput : rawOutput;
            CommitTransactional(sourceForCommit, output);
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    private static Task ModifyPageAsync(
        string inputPath,
        string outputPath,
        int pageNumber,
        Action<PdfPage, XGraphics> edit,
        CancellationToken token)
    {
        return Task.Run(() =>
        {
            var input = Path.GetFullPath(inputPath);
            var output = Path.GetFullPath(outputPath);
            ValidatePaths(input, output);
            var tempDir = Path.Combine(Path.GetTempPath(), "PDF Rescue", "markup", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            var raw = Path.Combine(tempDir, "edited-raw.pdf");
            var normalized = Path.Combine(tempDir, "edited-normalized.pdf");

            try
            {
                using (var document = PdfReader.Open(input, PdfDocumentOpenMode.Modify))
                {
                    if (pageNumber < 1 || pageNumber > document.Pages.Count)
                        throw new ArgumentOutOfRangeException(nameof(pageNumber));
                    token.ThrowIfCancellationRequested();
                    var page = document.Pages[pageNumber - 1];
                    using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
                    edit(page, gfx);
                    token.ThrowIfCancellationRequested();
                    document.Save(raw);
                }

                token.ThrowIfCancellationRequested();
                var sourceForCommit = NormalizeWithQpdf(raw, normalized, token) ? normalized : raw;
                CommitTransactional(sourceForCommit, output);
            }
            finally
            {
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }, token);
    }

    private static XRect ToPageRect(PdfPage page, NormalizedPdfRect area) =>
        new(area.X * page.Width.Point,
            area.Y * page.Height.Point,
            area.Width * page.Width.Point,
            area.Height * page.Height.Point);

    private static void ValidatePaths(string input, string output)
    {
        if (!File.Exists(input)) throw new FileNotFoundException("PDF was not found.", input);
        if (string.Equals(input, output, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Choose a different output file. PDF Rescue never overwrites the source PDF.");
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
    }

    private static void CommitTransactional(string source, string output)
    {
        var staged = output + "." + Guid.NewGuid().ToString("N") + ".staged";
        File.Copy(source, staged, true);
        try
        {
            if (File.Exists(output))
                File.Replace(staged, output, null, true);
            else
                File.Move(staged, output);
        }
        finally
        {
            try { if (File.Exists(staged)) File.Delete(staged); } catch { }
        }
    }

    private static bool NormalizeWithQpdf(string inputPath, string outputPath, CancellationToken token)
    {
        var qpdf = Path.Combine(AppContext.BaseDirectory, "engines", "qpdf", "qpdf.exe");
        if (!File.Exists(qpdf)) return false;

        var start = new ProcessStartInfo(qpdf)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        start.ArgumentList.Add(inputPath);
        start.ArgumentList.Add(outputPath);

        using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start bundled qpdf.");
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        while (!process.WaitForExit(100))
            token.ThrowIfCancellationRequested();
        Task.WaitAll(stdoutTask, stderrTask);

        if (process.ExitCode is not (0 or 3) || !File.Exists(outputPath))
        {
            var details = string.Join(Environment.NewLine, stdoutTask.Result, stderrTask.Result).Trim();
            throw new InvalidDataException(string.IsNullOrWhiteSpace(details)
                ? $"qpdf normalization failed with exit {process.ExitCode}."
                : details);
        }
        return true;
    }
}
