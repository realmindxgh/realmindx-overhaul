using System.Text.Json;
using PdfRescue.Core.Models;
using PdfRescue.Core.Services;

namespace PdfRescue.Infrastructure.Qpdf;

internal sealed class QpdfFeatureProbe(IExternalProcessRunner runner, string executable)
{
    public async Task<PdfFeatureSummary> ReadAsync(string path, int pageCount, bool encrypted, CancellationToken token)
    {
        var raw = await PdfStructuralProbe.ReadAsync(path, token).ConfigureAwait(false);
        var (images, pagesWithImages) = await ReadImagesAsync(path, token).ConfigureAwait(false);
        var (method, permissions) = encrypted
            ? await ReadEncryptionAsync(path, token).ConfigureAwait(false)
            : (null, Array.Empty<string>() as IReadOnlyList<string>);
        var imageHeavy = pageCount > 0 && pagesWithImages >= Math.Max(2, (int)Math.Ceiling(pageCount * .6));
        var likelyScan = pageCount > 0 && pagesWithImages >= Math.Max(1, (int)Math.Ceiling(pageCount * .9)) && images >= pageCount;

        return new PdfFeatureSummary(raw.HasForms, raw.HasXfa, raw.HasAttachments, raw.HasJavaScript,
            raw.HasOpenAction, raw.HasDigitalSignatures, raw.HasAnnotations, raw.HasOutlines,
            raw.HasMetadata, raw.HasEmbeddedFontPrograms, raw.IsLinearized, images, pagesWithImages,
            imageHeavy, likelyScan, method, permissions);
    }

    private async Task<(int Images, int Pages)> ReadImagesAsync(string path, CancellationToken token)
    {
        try
        {
            var result = await runner.RunAsync(executable,
                [path, "--json", "--json-key=pages", "--json-stream-data=none"], token).ConfigureAwait(false);
            if (result.ExitCode is not (0 or 3)) return (0, 0);
            using var doc = JsonDocument.Parse(result.StandardOutput);
            if (!doc.RootElement.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) return (0, 0);
            var images = 0; var withImages = 0;
            foreach (var page in pages.EnumerateArray())
            {
                if (!page.TryGetProperty("images", out var list) || list.ValueKind != JsonValueKind.Array) continue;
                var count = list.GetArrayLength(); images += count; if (count > 0) withImages++;
            }
            return (images, withImages);
        }
        catch (OperationCanceledException) { throw; }
        catch { return (0, 0); }
    }

    private async Task<(string? Method, IReadOnlyList<string> Permissions)> ReadEncryptionAsync(string path, CancellationToken token)
    {
        try
        {
            var result = await runner.RunAsync(executable, [path, "--show-encryption"], token).ConfigureAwait(false);
            if (result.ExitCode is not (0 or 3)) return (null, Array.Empty<string>());
            var lines = (result.StandardOutput + "\n" + result.StandardError)
                .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var permissions = lines.Where(x => x.Contains(": allowed", StringComparison.OrdinalIgnoreCase) ||
                x.Contains(": not allowed", StringComparison.OrdinalIgnoreCase)).ToArray();
            var line = lines.FirstOrDefault(x => x.StartsWith("file encryption method:", StringComparison.OrdinalIgnoreCase))
                ?? lines.FirstOrDefault(x => x.StartsWith("stream encryption method:", StringComparison.OrdinalIgnoreCase));
            var method = line is null ? null : line[(line.IndexOf(':') + 1)..].Trim();
            return (method, permissions);
        }
        catch (OperationCanceledException) { throw; }
        catch { return (null, Array.Empty<string>()); }
    }
}
