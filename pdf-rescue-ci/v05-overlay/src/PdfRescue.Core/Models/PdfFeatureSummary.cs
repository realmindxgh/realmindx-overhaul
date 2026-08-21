namespace PdfRescue.Core.Models;

public sealed record PdfFeatureSummary(
    bool HasForms,
    bool HasXfa,
    bool HasAttachments,
    bool HasJavaScript,
    bool HasOpenAction,
    bool HasDigitalSignatures,
    bool HasAnnotations,
    bool HasOutlines,
    bool HasMetadata,
    bool HasEmbeddedFontPrograms,
    bool IsLinearized,
    int ImageCount,
    int PagesWithImages,
    bool IsImageHeavy,
    bool LikelyScanned,
    string? EncryptionMethod,
    IReadOnlyList<string> EncryptionPermissions)
{
    public static PdfFeatureSummary Empty { get; } = new(
        false, false, false, false, false, false, false, false, false, false, false,
        0, 0, false, false, null, Array.Empty<string>());
}
