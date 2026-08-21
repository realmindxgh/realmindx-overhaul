using PdfRescue.Core.Models;

namespace PdfRescue.App;

public partial class MainWindow
{
    private static string BuildDoctorFeatureSummary(PdfInspectionResult inspection)
    {
        var f = inspection.Features ?? PdfFeatureSummary.Empty;
        var items = new List<string>();
        if (f.HasForms) items.Add(f.HasXfa ? "XFA form" : "Form fields");
        if (f.HasAttachments) items.Add("Attachments");
        if (f.HasDigitalSignatures) items.Add("Digital signatures");
        if (f.HasAnnotations) items.Add("Annotations");
        if (f.HasOutlines) items.Add("Bookmarks/outlines");
        if (f.HasJavaScript) items.Add("JavaScript");
        if (f.HasOpenAction) items.Add("Open action");
        if (f.HasMetadata) items.Add("Metadata");
        if (f.HasEmbeddedFontPrograms) items.Add("Embedded fonts");
        if (f.IsLinearized) items.Add("Fast-web optimized");
        if (f.ImageCount > 0) items.Add($"{f.ImageCount:N0} images on {f.PagesWithImages:N0} page(s)");
        if (f.LikelyScanned) items.Add("Likely scanned/image-based");
        return items.Count == 0 ? "No special document features detected." : string.Join(" · ", items);
    }
}
