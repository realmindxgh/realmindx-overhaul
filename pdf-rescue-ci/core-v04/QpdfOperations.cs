using PdfRescue.Core.Models;
using PdfRescue.Core.Services;

namespace PdfRescue.Infrastructure.Qpdf;

public sealed class QpdfOperations(IExternalProcessRunner processRunner, string qpdfExecutable = "qpdf") : IPdfOperations
{
    public async Task MergeAsync(IReadOnlyList<string> inputs, string output, CancellationToken cancellationToken = default)
    {
        if (inputs is null || inputs.Count < 2)
            throw new ArgumentException("Merge requires at least two PDF files.", nameof(inputs));

        ValidateOutput(output);
        var args = new List<string> { "--empty", "--pages" };
        foreach (var input in inputs)
        {
            ValidateInput(input);
            ValidateDistinctOutput(input, output);
            args.Add(Path.GetFullPath(input));
        }
        args.Add("--");
        args.Add(Path.GetFullPath(output));
        await RunWriteAsync(args, output, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<string>> SplitAsync(
        string input,
        int pagesPerFile,
        string outputBase,
        CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(outputBase);
        ValidateDistinctOutput(input, outputBase);
        if (pagesPerFile < 1)
            throw new ArgumentOutOfRangeException(nameof(pagesPerFile), "Pages per file must be at least 1.");

        var fullBase = Path.GetFullPath(outputBase);
        var outputDirectory = Path.GetDirectoryName(fullBase)!;
        Directory.CreateDirectory(outputDirectory);
        var stagingDirectory = Path.Combine(Path.GetTempPath(), "PDF Rescue", "split", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stagingDirectory);
        var stagedBase = Path.Combine(stagingDirectory, Path.GetFileName(fullBase));

        try
        {
            var result = await processRunner.RunAsync(
                qpdfExecutable,
                [$"--split-pages={pagesPerFile}", Path.GetFullPath(input), stagedBase],
                cancellationToken).ConfigureAwait(false);

            if (result.ExitCode == 2 || result.ExitCode is not (0 or 3))
                throw new InvalidDataException($"qpdf split failed. {result.StandardError}".Trim());

            var stagedFiles = Directory.GetFiles(stagingDirectory)
                .Where(path => string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase))
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            if (stagedFiles.Length == 0)
                throw new IOException("The PDF engine reported success but produced no split files.");

            var destinations = stagedFiles
                .Select(path => Path.Combine(outputDirectory, Path.GetFileName(path)))
                .ToArray();
            var collisions = destinations.Where(File.Exists).ToArray();
            if (collisions.Length > 0)
                throw new IOException($"Split stopped because {collisions.Length:N0} output file(s) already exist. Choose a different base name.");

            for (var index = 0; index < stagedFiles.Length; index++)
                File.Move(stagedFiles[index], destinations[index]);

            return destinations;
        }
        finally
        {
            TryDeleteDirectory(stagingDirectory);
        }
    }

    public async Task ReorderAsync(string input, IReadOnlyList<int> oneBasedPageOrder, string output, CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        ValidatePageOrder(oneBasedPageOrder);

        var range = string.Join(',', oneBasedPageOrder);
        await RunWriteAsync(
            ["--empty", "--pages", Path.GetFullPath(input), range, "--", Path.GetFullPath(output)],
            output,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task RotateAsync(string input, int degreesClockwise, string pageRange, string output, CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        if (degreesClockwise is not (90 or 180 or 270))
            throw new ArgumentOutOfRangeException(nameof(degreesClockwise), "Rotation must be 90, 180, or 270 degrees.");
        if (string.IsNullOrWhiteSpace(pageRange))
            throw new ArgumentException("A page range is required.", nameof(pageRange));

        await RunWriteAsync(
            [Path.GetFullPath(input), Path.GetFullPath(output), $"--rotate=+{degreesClockwise}:{pageRange}"],
            output,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task ExtractAsync(string input, string pageRange, string output, CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        if (string.IsNullOrWhiteSpace(pageRange))
            throw new ArgumentException("A page range is required.", nameof(pageRange));

        await RunWriteAsync(
            ["--empty", "--pages", Path.GetFullPath(input), pageRange, "--", Path.GetFullPath(output)],
            output,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task ApplyPageLayoutAsync(
        string input,
        IReadOnlyList<PdfPageTransform> pages,
        string output,
        CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        if (pages is null || pages.Count == 0)
            throw new ArgumentException("The resulting PDF must contain at least one page.", nameof(pages));
        if (pages.Any(page => page.SourcePageNumber < 1))
            throw new ArgumentException("Source page numbers are one-based and must be positive.", nameof(pages));
        if (pages.Any(page => page.NormalizedRotation is not (0 or 90 or 180 or 270)))
            throw new ArgumentException("Page rotations must resolve to 0, 90, 180, or 270 degrees.", nameof(pages));

        var fullOutput = Path.GetFullPath(output);
        var outputDirectory = Path.GetDirectoryName(fullOutput)!;
        Directory.CreateDirectory(outputDirectory);
        var staged = Path.Combine(outputDirectory, $".{Path.GetFileNameWithoutExtension(output)}.{Guid.NewGuid():N}.layout.pdf");
        var rotatedStaged = Path.Combine(outputDirectory, $".{Path.GetFileNameWithoutExtension(output)}.{Guid.NewGuid():N}.rotated.pdf");

        try
        {
            await ReorderAsync(input, pages.Select(page => page.SourcePageNumber).ToArray(), staged, cancellationToken)
                .ConfigureAwait(false);

            var rotations = pages
                .Select((page, index) => new { OutputPage = index + 1, Rotation = page.NormalizedRotation })
                .Where(item => item.Rotation != 0)
                .GroupBy(item => item.Rotation)
                .OrderBy(group => group.Key)
                .ToArray();

            if (rotations.Length == 0)
            {
                File.Move(staged, fullOutput, overwrite: true);
                return;
            }

            var args = new List<string> { staged, rotatedStaged };
            foreach (var rotation in rotations)
            {
                var pageRange = string.Join(',', rotation.Select(item => item.OutputPage));
                args.Add($"--rotate=+{rotation.Key}:{pageRange}");
            }

            await RunWriteAsync(args, rotatedStaged, cancellationToken).ConfigureAwait(false);
            File.Move(rotatedStaged, fullOutput, overwrite: true);
        }
        finally
        {
            TryDelete(staged);
            TryDelete(rotatedStaged);
        }
    }

    public Task CompressAsync(
        string input,
        PdfCompressionProfile profile,
        string output,
        CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);

        var args = new List<string>
        {
            Path.GetFullPath(input),
            Path.GetFullPath(output),
            "--object-streams=generate",
            "--recompress-flate",
            "--compression-level=9"
        };

        if (profile is PdfCompressionProfile.Balanced or PdfCompressionProfile.Strong)
        {
            args.Add("--optimize-images");
            args.Add(profile == PdfCompressionProfile.Strong ? "--jpeg-quality=55" : "--jpeg-quality=75");
        }

        return RunWriteAsync(args, output, cancellationToken);
    }

    public Task ProtectAsync(
        string input,
        string userPassword,
        string ownerPassword,
        string output,
        CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        if (string.IsNullOrEmpty(userPassword))
            throw new ArgumentException("An opening password is required.", nameof(userPassword));
        if (string.IsNullOrEmpty(ownerPassword))
            throw new ArgumentException("An owner password is required.", nameof(ownerPassword));

        return RunSensitiveWriteAsync(
            [
                Path.GetFullPath(input),
                Path.GetFullPath(output),
                "--encrypt",
                $"--user-password={userPassword}",
                $"--owner-password={ownerPassword}",
                "--bits=256",
                "--"
            ],
            output,
            cancellationToken);
    }

    public Task DecryptAsync(string input, string password, string output, CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        if (password is null)
            throw new ArgumentNullException(nameof(password));

        return RunSensitiveWriteAsync(
            [$"--password={password}", "--decrypt", Path.GetFullPath(input), Path.GetFullPath(output)],
            output,
            cancellationToken);
    }

    public Task RepairAsync(string input, string output, CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        return RunWriteAsync(
            [Path.GetFullPath(input), Path.GetFullPath(output), "--object-streams=preserve"],
            output,
            cancellationToken);
    }

    public async Task LinearizeAsync(string input, string output, CancellationToken cancellationToken = default)
    {
        ValidateInput(input);
        ValidateOutput(output);
        ValidateDistinctOutput(input, output);
        await RunWriteAsync(
            [Path.GetFullPath(input), Path.GetFullPath(output), "--linearize"],
            output,
            cancellationToken).ConfigureAwait(false);
    }

    private async Task RunWriteAsync(IReadOnlyList<string> args, string output, CancellationToken cancellationToken)
    {
        var fullOutput = Path.GetFullPath(output);
        var outputDirectory = Path.GetDirectoryName(fullOutput)!;
        Directory.CreateDirectory(outputDirectory);
        var stagedOutput = Path.Combine(
            outputDirectory,
            $".{Path.GetFileNameWithoutExtension(fullOutput)}.{Guid.NewGuid():N}.write.pdf");

        var stagedArgs = args
            .Select(argument => PathsEqual(argument, fullOutput) ? stagedOutput : argument)
            .ToArray();

        try
        {
            var result = await processRunner.RunAsync(qpdfExecutable, stagedArgs, cancellationToken).ConfigureAwait(false);
            ValidateWriteResult(result, stagedOutput);
            File.Move(stagedOutput, fullOutput, overwrite: true);
        }
        finally
        {
            TryDelete(stagedOutput);
        }
    }

    private async Task RunSensitiveWriteAsync(IReadOnlyList<string> args, string output, CancellationToken cancellationToken)
    {
        var fullOutput = Path.GetFullPath(output);
        var outputDirectory = Path.GetDirectoryName(fullOutput)!;
        Directory.CreateDirectory(outputDirectory);
        var stagedOutput = Path.Combine(
            outputDirectory,
            $".{Path.GetFileNameWithoutExtension(fullOutput)}.{Guid.NewGuid():N}.write.pdf");
        var argumentFile = Path.Combine(Path.GetTempPath(), $"pdfrescue-qpdf-{Guid.NewGuid():N}.args");

        var stagedArgs = args
            .Select(argument => PathsEqual(argument, fullOutput) ? stagedOutput : argument)
            .ToArray();

        try
        {
            await File.WriteAllLinesAsync(argumentFile, stagedArgs, cancellationToken).ConfigureAwait(false);
            var result = await processRunner.RunAsync(qpdfExecutable, [$"@{argumentFile}"], cancellationToken).ConfigureAwait(false);
            ValidateWriteResult(result, stagedOutput);
            File.Move(stagedOutput, fullOutput, overwrite: true);
        }
        finally
        {
            TryDelete(argumentFile);
            TryDelete(stagedOutput);
        }
    }

    private static void ValidateWriteResult(ProcessResult result, string stagedOutput)
    {
        if (result.ExitCode == 2 || result.ExitCode is not (0 or 3))
            throw new InvalidDataException($"qpdf operation failed. {result.StandardError}".Trim());
        if (!File.Exists(stagedOutput))
            throw new IOException("The PDF engine reported success but no output file was created.");
    }

    private static bool PathsEqual(string candidate, string fullPath)
    {
        if (string.IsNullOrWhiteSpace(candidate) || candidate.StartsWith("--", StringComparison.Ordinal))
            return false;

        try
        {
            return string.Equals(Path.GetFullPath(candidate), fullPath, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static void ValidatePageOrder(IReadOnlyList<int> oneBasedPageOrder)
    {
        if (oneBasedPageOrder is null || oneBasedPageOrder.Count == 0 || oneBasedPageOrder.Any(page => page < 1))
            throw new ArgumentException("Page order must contain one-based positive page numbers.", nameof(oneBasedPageOrder));
    }

    private static void ValidateInput(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            throw new FileNotFoundException("Input PDF was not found.", path);
    }

    private static void ValidateOutput(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("Output path is required.", nameof(path));
        if (!string.Equals(Path.GetExtension(path), ".pdf", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Output file must use the .pdf extension.", nameof(path));
    }

    private static void ValidateDistinctOutput(string input, string output)
    {
        if (string.Equals(Path.GetFullPath(input), Path.GetFullPath(output), StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("For safety, PDF Rescue writes to a different output file and never overwrites the open source PDF.", nameof(output));
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // Best effort. Stale temporary files can be cleaned on a later app start.
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
                Directory.Delete(path, recursive: true);
        }
        catch
        {
            // Best effort. Stale temporary folders can be cleaned on a later app start.
        }
    }
}
