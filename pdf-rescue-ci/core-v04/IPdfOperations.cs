using PdfRescue.Core.Models;

namespace PdfRescue.Core.Services;

public interface IPdfOperations
{
    Task MergeAsync(IReadOnlyList<string> inputs, string output, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> SplitAsync(string input, int pagesPerFile, string outputBase, CancellationToken cancellationToken = default);
    Task ReorderAsync(string input, IReadOnlyList<int> oneBasedPageOrder, string output, CancellationToken cancellationToken = default);
    Task RotateAsync(string input, int degreesClockwise, string pageRange, string output, CancellationToken cancellationToken = default);
    Task ExtractAsync(string input, string pageRange, string output, CancellationToken cancellationToken = default);
    Task ApplyPageLayoutAsync(string input, IReadOnlyList<PdfPageTransform> pages, string output, CancellationToken cancellationToken = default);
    Task CompressAsync(string input, PdfCompressionProfile profile, string output, CancellationToken cancellationToken = default);
    Task ProtectAsync(string input, string userPassword, string ownerPassword, string output, CancellationToken cancellationToken = default);
    Task DecryptAsync(string input, string password, string output, CancellationToken cancellationToken = default);
    Task RepairAsync(string input, string output, CancellationToken cancellationToken = default);
    Task LinearizeAsync(string input, string output, CancellationToken cancellationToken = default);
}
