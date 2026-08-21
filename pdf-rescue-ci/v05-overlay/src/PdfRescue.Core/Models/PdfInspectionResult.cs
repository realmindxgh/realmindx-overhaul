namespace PdfRescue.Core.Models;

public sealed record PdfInspectionResult(
    string FilePath,
    long FileSizeBytes,
    int PageCount,
    string? PdfVersion,
    bool IsEncrypted,
    bool HasWarnings,
    bool HasErrors,
    IReadOnlyList<string> Messages,
    PdfFeatureSummary? Features = null);
