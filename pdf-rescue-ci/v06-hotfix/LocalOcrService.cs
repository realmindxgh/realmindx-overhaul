using System.IO;
using System.Windows.Media.Imaging;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace PdfRescue.App.Services;

public sealed record OcrPageResult(string Text, IReadOnlyList<OcrWordPlacement> Words);

public sealed class LocalOcrService
{
    public bool IsAvailable => OcrEngine.TryCreateFromUserProfileLanguages() is not null;

    public async Task<OcrPageResult> RecognizeAsync(BitmapSource bitmap, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var engine = OcrEngine.TryCreateFromUserProfileLanguages()
            ?? throw new InvalidOperationException("Windows OCR is unavailable for the current Windows language configuration.");

        var png = EncodePng(bitmap);
        using var random = new InMemoryRandomAccessStream();
        using (var writer = new DataWriter(random.GetOutputStreamAt(0)))
        {
            writer.WriteBytes(png);
            await writer.StoreAsync();
            await writer.FlushAsync();
            writer.DetachStream();
        }

        random.Seek(0);
        var decoder = await Windows.Graphics.Imaging.BitmapDecoder.CreateAsync(random);
        using var softwareBitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore);
        cancellationToken.ThrowIfCancellationRequested();
        var result = await engine.RecognizeAsync(softwareBitmap);
        cancellationToken.ThrowIfCancellationRequested();

        var words = new List<OcrWordPlacement>();
        foreach (var line in result.Lines)
        {
            foreach (var word in line.Words)
            {
                var rect = word.BoundingRect;
                words.Add(new OcrWordPlacement(word.Text, rect.X, rect.Y, rect.Width, rect.Height));
            }
        }

        return new OcrPageResult(result.Text ?? string.Empty, words);
    }

    private static byte[] EncodePng(BitmapSource bitmap)
    {
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(bitmap));
        using var memory = new MemoryStream();
        encoder.Save(memory);
        return memory.ToArray();
    }
}
