using System.IO;
using PdfSharp.Pdf.IO;

namespace PdfRescue.App.Services;

public static class MarkupSelfTest
{
    public static async Task RunAsync(string samplePdf, string outputDirectory)
    {
        if (!File.Exists(samplePdf)) throw new FileNotFoundException("Self-test PDF is missing.", samplePdf);
        Directory.CreateDirectory(outputDirectory);

        var service = new PdfMarkupService();
        var textPdf = Path.Combine(outputDirectory, "markup-text.pdf");
        var highlightPdf = Path.Combine(outputDirectory, "markup-highlight.pdf");
        var redactedPdf = Path.Combine(outputDirectory, "markup-redacted.pdf");

        await service.AddTextAsync(samplePdf, textPdf, 1, 0.12, 0.14, "PDF RESCUE EDIT", 16);
        await service.AddHighlightAsync(textPdf, highlightPdf, 1, new NormalizedPdfRect(0.18, 0.22, 0.36, 0.10));
        await service.PermanentRedactAsync(highlightPdf, redactedPdf, 1, new NormalizedPdfRect(0.28, 0.36, 0.25, 0.09));

        foreach (var path in new[] { textPdf, highlightPdf, redactedPdf })
        {
            if (!File.Exists(path)) throw new InvalidDataException($"Markup output missing: {Path.GetFileName(path)}");
            using var doc = PdfReader.Open(path, PdfDocumentOpenMode.Import);
            if (doc.Pages.Count != 2) throw new InvalidDataException($"{Path.GetFileName(path)} did not preserve the two-page document.");
        }

        await File.WriteAllTextAsync(Path.Combine(outputDirectory, "markup-selftest-pass.flag"), "pass");
    }
}
