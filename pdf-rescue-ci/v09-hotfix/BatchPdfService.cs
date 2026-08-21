using System.IO;
using PdfRescue.Core.Models;
using PdfRescue.Core.Services;

namespace PdfRescue.App.Services;

public enum BatchPdfOperation
{
    CompressBalanced,
    Repair,
    OptimizeForWeb
}

public sealed record BatchPdfResult(string InputPath, string OutputPath, bool Success, string? Error);

public sealed class BatchPdfService
{
    private readonly IPdfOperations _operations;

    public BatchPdfService(IPdfOperations operations) => _operations = operations;

    public async Task<IReadOnlyList<BatchPdfResult>> ProcessAsync(
        IReadOnlyList<string> inputs,
        string outputDirectory,
        BatchPdfOperation operation,
        IProgress<(int Completed, int Total, string FileName)>? progress = null,
        CancellationToken token = default)
    {
        if (inputs.Count == 0) throw new ArgumentException("Select at least one PDF.", nameof(inputs));
        Directory.CreateDirectory(outputDirectory);
        var results = new List<BatchPdfResult>(inputs.Count);

        for (var i = 0; i < inputs.Count; i++)
        {
            token.ThrowIfCancellationRequested();
            var input = Path.GetFullPath(inputs[i]);
            if (!File.Exists(input))
            {
                results.Add(new(input, string.Empty, false, "Input file not found."));
                continue;
            }

            var suffix = operation switch
            {
                BatchPdfOperation.CompressBalanced => "compressed",
                BatchPdfOperation.Repair => "repaired",
                _ => "web"
            };
            var output = UniqueOutput(outputDirectory, Path.GetFileNameWithoutExtension(input), suffix);
            progress?.Report((i, inputs.Count, Path.GetFileName(input)));
            try
            {
                switch (operation)
                {
                    case BatchPdfOperation.CompressBalanced:
                        await _operations.CompressAsync(input, PdfCompressionProfile.Balanced, output, token);
                        break;
                    case BatchPdfOperation.Repair:
                        await _operations.RepairAsync(input, output, token);
                        break;
                    case BatchPdfOperation.OptimizeForWeb:
                        await _operations.LinearizeAsync(input, output, token);
                        break;
                }
                results.Add(new(input, output, true, null));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                results.Add(new(input, output, false, ex.Message));
            }
            progress?.Report((i + 1, inputs.Count, Path.GetFileName(input)));
        }

        return results;
    }

    private static string UniqueOutput(string directory, string baseName, string suffix)
    {
        var candidate = Path.Combine(directory, $"{baseName}_{suffix}.pdf");
        var n = 2;
        while (File.Exists(candidate))
            candidate = Path.Combine(directory, $"{baseName}_{suffix}_{n++}.pdf");
        return candidate;
    }
}
