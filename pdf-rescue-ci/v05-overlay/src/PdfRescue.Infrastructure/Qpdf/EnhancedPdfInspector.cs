using PdfRescue.Core.Models;
using PdfRescue.Core.Services;

namespace PdfRescue.Infrastructure.Qpdf;

public sealed class EnhancedPdfInspector(IExternalProcessRunner runner, string qpdfExecutable = "qpdf") : IPdfInspector
{
    private readonly QpdfInspector _base = new(runner, qpdfExecutable);
    private readonly QpdfFeatureProbe _features = new(runner, qpdfExecutable);

    public async Task<PdfInspectionResult> InspectAsync(string path, CancellationToken cancellationToken = default)
    {
        var result = await _base.InspectAsync(path, cancellationToken).ConfigureAwait(false);
        var features = await _features.ReadAsync(result.FilePath, result.PageCount, result.IsEncrypted, cancellationToken)
            .ConfigureAwait(false);
        return result with { Features = features };
    }
}
