using System.Text;

namespace PdfRescue.Infrastructure.Qpdf;

internal static class PdfStructuralProbe
{
    internal sealed record Result(
        bool HasForms, bool HasXfa, bool HasAttachments, bool HasJavaScript,
        bool HasOpenAction, bool HasDigitalSignatures, bool HasAnnotations,
        bool HasOutlines, bool HasMetadata, bool HasEmbeddedFontPrograms,
        bool IsLinearized);

    public static async Task<Result> ReadAsync(string path, CancellationToken token)
    {
        string[] names = ["/AcroForm", "/XFA", "/EmbeddedFiles", "/JavaScript", "/JS",
            "/OpenAction", "/Sig", "/Annots", "/Outlines", "/Metadata",
            "/FontFile", "/FontFile2", "/FontFile3"];
        var found = names.ToDictionary(x => x, _ => false, StringComparer.Ordinal);
        var buffer = new byte[1024 * 1024];
        var tail = string.Empty;
        var first = true;
        var linearized = false;

        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read,
            buffer.Length, useAsync: true);
        int read;
        while ((read = await stream.ReadAsync(buffer.AsMemory(), token).ConfigureAwait(false)) > 0)
        {
            var text = tail + Encoding.Latin1.GetString(buffer, 0, read);
            if (first) { linearized = text.Contains("/Linearized", StringComparison.Ordinal); first = false; }
            foreach (var name in names)
                if (!found[name] && text.Contains(name, StringComparison.Ordinal)) found[name] = true;
            tail = text.Length > 64 ? text[^64..] : text;
        }

        return new Result(found["/AcroForm"], found["/XFA"], found["/EmbeddedFiles"],
            found["/JavaScript"] || found["/JS"], found["/OpenAction"], found["/Sig"],
            found["/Annots"], found["/Outlines"], found["/Metadata"],
            found["/FontFile"] || found["/FontFile2"] || found["/FontFile3"], linearized);
    }
}
