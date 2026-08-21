using System.Diagnostics;
using System.IO;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;

namespace PdfRescue.App.Services;

public sealed record PdfMetadataValues(string Title, string Author, string Subject, string Keywords);

public sealed class PdfFinishingService
{
    public Task AddWatermarkAsync(string inputPath, string outputPath, string text, CancellationToken token = default) =>
        RunAsync(inputPath, outputPath, document =>
        {
            if (string.IsNullOrWhiteSpace(text)) throw new ArgumentException("Watermark text cannot be empty.", nameof(text));
            var font = new XFont("Segoe UI", 48, XFontStyleEx.Bold);
            var brush = new XSolidBrush(XColor.FromArgb(52, 80, 80, 80));
            foreach (var page in document.Pages)
            {
                token.ThrowIfCancellationRequested();
                using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
                var width = page.Width.Point;
                var height = page.Height.Point;
                gfx.Save();
                gfx.TranslateTransform(width / 2d, height / 2d);
                gfx.RotateTransform(-35d);
                var size = gfx.MeasureString(text, font);
                gfx.DrawString(text, font, brush, -size.Width / 2d, size.Height / 2d);
                gfx.Restore();
            }
        }, token);

    public Task AddPageNumbersAsync(string inputPath, string outputPath, string prefix, int startNumber = 1, CancellationToken token = default) =>
        RunAsync(inputPath, outputPath, document =>
        {
            var font = new XFont("Segoe UI", 9, XFontStyleEx.Regular);
            var brush = XBrushes.DimGray;
            var format = new XStringFormat { Alignment = XStringAlignment.Center, LineAlignment = XLineAlignment.Center };
            for (var i = 0; i < document.Pages.Count; i++)
            {
                token.ThrowIfCancellationRequested();
                var page = document.Pages[i];
                using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
                var label = $"{prefix}{startNumber + i}";
                var width = page.Width.Point;
                var height = page.Height.Point;
                gfx.DrawString(label, font, brush, new XRect(24, Math.Max(0, height - 28), Math.Max(1, width - 48), 18), format);
            }
        }, token);

    public Task AddHeaderFooterAsync(string inputPath, string outputPath, string header, string footer, CancellationToken token = default) =>
        RunAsync(inputPath, outputPath, document =>
        {
            if (string.IsNullOrWhiteSpace(header) && string.IsNullOrWhiteSpace(footer))
                throw new ArgumentException("Enter a header, footer, or both.");
            var font = new XFont("Segoe UI", 8.5, XFontStyleEx.Regular);
            var brush = XBrushes.DimGray;
            var center = new XStringFormat { Alignment = XStringAlignment.Center, LineAlignment = XLineAlignment.Center };
            foreach (var page in document.Pages)
            {
                token.ThrowIfCancellationRequested();
                using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
                var width = page.Width.Point;
                var height = page.Height.Point;
                if (!string.IsNullOrWhiteSpace(header))
                    gfx.DrawString(header.Trim(), font, brush, new XRect(24, 10, Math.Max(1, width - 48), 18), center);
                if (!string.IsNullOrWhiteSpace(footer))
                    gfx.DrawString(footer.Trim(), font, brush, new XRect(24, Math.Max(0, height - 28), Math.Max(1, width - 48), 18), center);
            }
        }, token);

    public Task UpdateMetadataAsync(string inputPath, string outputPath, PdfMetadataValues metadata, CancellationToken token = default) =>
        RunAsync(inputPath, outputPath, document =>
        {
            token.ThrowIfCancellationRequested();
            document.Info.Title = metadata.Title?.Trim() ?? string.Empty;
            document.Info.Author = metadata.Author?.Trim() ?? string.Empty;
            document.Info.Subject = metadata.Subject?.Trim() ?? string.Empty;
            document.Info.Keywords = metadata.Keywords?.Trim() ?? string.Empty;
        }, token);

    public Task StampImageAsync(string inputPath, string outputPath, string imagePath, int pageNumber, CancellationToken token = default) =>
        RunAsync(inputPath, outputPath, document =>
        {
            if (!File.Exists(imagePath)) throw new FileNotFoundException("Stamp image was not found.", imagePath);
            if (pageNumber < 1 || pageNumber > document.Pages.Count) throw new ArgumentOutOfRangeException(nameof(pageNumber));
            var page = document.Pages[pageNumber - 1];
            using var image = XImage.FromFile(imagePath);
            using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
            var width = page.Width.Point;
            var height = page.Height.Point;
            var targetWidth = Math.Min(150d, Math.Max(60d, width * 0.22d));
            var targetHeight = targetWidth * image.PixelHeight / Math.Max(1d, image.PixelWidth);
            if (targetHeight > 90d)
            {
                var ratio = 90d / targetHeight;
                targetHeight *= ratio;
                targetWidth *= ratio;
            }
            var x = Math.Max(18d, width - targetWidth - 30d);
            var y = Math.Max(18d, height - targetHeight - 42d);
            gfx.DrawImage(image, x, y, targetWidth, targetHeight);
        }, token);

    private static Task RunAsync(string inputPath, string outputPath, Action<PdfDocument> edit, CancellationToken token)
    {
        return Task.Run(() =>
        {
            token.ThrowIfCancellationRequested();
            var input = Path.GetFullPath(inputPath);
            var output = Path.GetFullPath(outputPath);
            if (!File.Exists(input)) throw new FileNotFoundException("PDF was not found.", input);
            if (string.Equals(input, output, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Choose a different output file. PDF Rescue never overwrites the source PDF during finishing operations.");

            Directory.CreateDirectory(Path.GetDirectoryName(output)!);
            var nonce = Guid.NewGuid().ToString("N");
            var raw = output + "." + nonce + ".raw.pdf";
            var normalized = output + "." + nonce + ".normalized.pdf";
            try
            {
                using (var document = PdfReader.Open(input, PdfDocumentOpenMode.Modify))
                {
                    token.ThrowIfCancellationRequested();
                    edit(document);
                    token.ThrowIfCancellationRequested();
                    document.Save(raw);
                }

                token.ThrowIfCancellationRequested();
                var sourceForCommit = NormalizeWithQpdf(raw, normalized, token) ? normalized : raw;
                token.ThrowIfCancellationRequested();
                if (File.Exists(output)) File.Delete(output);
                File.Move(sourceForCommit, output);
            }
            catch
            {
                try { if (File.Exists(raw)) File.Delete(raw); } catch { }
                try { if (File.Exists(normalized)) File.Delete(normalized); } catch { }
                throw;
            }
            finally
            {
                try { if (File.Exists(raw)) File.Delete(raw); } catch { }
                try { if (File.Exists(normalized)) File.Delete(normalized); } catch { }
            }
        }, token);
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

        using var process = Process.Start(start) ?? throw new InvalidOperationException("Could not start the bundled qpdf normalizer.");
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        while (!process.WaitForExit(100))
        {
            token.ThrowIfCancellationRequested();
        }
        Task.WaitAll(stdoutTask, stderrTask);
        if (process.ExitCode is not (0 or 3) || !File.Exists(outputPath))
        {
            var details = string.Join(Environment.NewLine, stdoutTask.Result, stderrTask.Result).Trim();
            throw new InvalidDataException(string.IsNullOrWhiteSpace(details)
                ? $"qpdf could not normalize the edited PDF (exit {process.ExitCode})."
                : details);
        }
        return true;
    }
}
