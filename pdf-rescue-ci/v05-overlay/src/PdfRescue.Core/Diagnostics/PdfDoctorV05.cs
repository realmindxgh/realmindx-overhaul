using PdfRescue.Core.Models;
using PdfRescue.Core.Services;

namespace PdfRescue.Core.Diagnostics;

public sealed class PdfDoctorV05(IPdfInspector inspector)
{
    public async Task<PdfDoctorReport> DiagnoseAsync(string path, CancellationToken token = default)
    {
        var i = await inspector.InspectAsync(path, token).ConfigureAwait(false);
        var f = i.Features ?? PdfFeatureSummary.Empty;
        var issues = new List<PdfDoctorIssue>();
        var score = 100;

        Add(i.HasErrors, "STRUCTURE_ERROR", "PDF structure needs repair",
            "The PDF engine found structural errors. Repair a copy and keep the original untouched.", PdfHealthSeverity.Error, 40, true);
        Add(i.HasWarnings, "STRUCTURE_WARNING", "PDF contains recoverable warnings",
            "The document opens, but its internal structure is not fully clean.", PdfHealthSeverity.Warning, 15, true);
        Add(f.HasJavaScript, "JAVASCRIPT_PRESENT", "Embedded JavaScript detected",
            "Active-content indicators were found. Review them before sharing with untrusted recipients.", PdfHealthSeverity.Warning, 8);
        Add(f.HasOpenAction, "OPEN_ACTION_PRESENT", "Automatic open action detected",
            "The PDF contains an action that may run or navigate when the file opens.", PdfHealthSeverity.Recommendation, 3);
        Add(f.HasXfa, "XFA_FORM", "XFA form detected",
            "XFA forms are not handled consistently by all PDF viewers and conversion tools.", PdfHealthSeverity.Warning, 5);
        Add(!f.HasXfa && f.HasForms, "FORM_PRESENT", "Interactive form detected",
            "Form fields are present and should be preserved during editing or conversion.", PdfHealthSeverity.Info, 0);
        Add(f.HasDigitalSignatures, "SIGNATURE_PRESENT", "Digital signature data detected",
            "Structural edits may invalidate existing digital signatures. Preserve an untouched original.", PdfHealthSeverity.Warning, 5);
        Add(f.HasAttachments, "ATTACHMENTS_PRESENT", "Embedded attachments detected",
            "Embedded-file indicators are present. Keep attachments in mind during repair or conversion.", PdfHealthSeverity.Info, 0);
        Add(f.LikelyScanned, "LIKELY_SCAN", "Document appears image-based",
            $"Images were detected on {f.PagesWithImages:N0} of {i.PageCount:N0} pages. OCR may be needed for searchable text.", PdfHealthSeverity.Recommendation, 4);
        Add(!f.LikelyScanned && f.IsImageHeavy, "IMAGE_HEAVY", "Image-heavy PDF",
            $"PDF Doctor found {f.ImageCount:N0} image objects across {f.PagesWithImages:N0} page(s). Compression may help.", PdfHealthSeverity.Recommendation, 3, true);
        Add(i.FileSizeBytes >= 25L * 1024 * 1024, "LARGE_FILE", "Large PDF",
            "This is a large PDF. Compression may reduce storage and sharing size.", PdfHealthSeverity.Recommendation, 5, true);
        Add(!f.IsLinearized && i.FileSizeBytes >= 2L * 1024 * 1024, "NOT_LINEARIZED", "Not optimized for fast web viewing",
            "Web optimization can make the first pages available sooner over a network.", PdfHealthSeverity.Recommendation, 2, true);
        Add(i.PageCount >= 500, "VERY_LONG_DOCUMENT", "Very long document",
            $"The document contains {i.PageCount:N0} pages. Heavy tasks should remain cancellable.", PdfHealthSeverity.Info, 0);

        if (i.IsEncrypted)
        {
            var method = string.IsNullOrWhiteSpace(f.EncryptionMethod) ? "" : $" ({f.EncryptionMethod})";
            var blocked = f.EncryptionPermissions.Count(x => x.Contains("not allowed", StringComparison.OrdinalIgnoreCase));
            Add(true, "ENCRYPTED", $"Document is encrypted{method}", blocked == 0
                ? "Some operations may require the document password."
                : $"Password protection is active with {blocked} reported restriction(s).", PdfHealthSeverity.Info, 0);
        }

        return new PdfDoctorReport(i, Math.Clamp(score, 0, 100), issues);

        void Add(bool condition, string code, string title, string description,
            PdfHealthSeverity severity, int penalty, bool autoFix = false)
        {
            if (!condition) return;
            issues.Add(new PdfDoctorIssue(code, title, description, severity, autoFix));
            score -= penalty;
        }
    }
}
