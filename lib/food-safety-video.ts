export const MAX_FOOD_SAFETY_VIDEO_BYTES = 200 * 1024 * 1024;

// 720p H.264 in MP4 plays in every current browser. Short videos of a few minutes stay small.
const MAX_SHORT_EDGE = 720;
const VIDEO_BITRATE = 2_500_000;
const AUDIO_BITRATE = 128_000;

// Compresses in the browser with its own encoder. Falls back to the original file where that is not possible.
export async function compressFoodSafetyVideo(file: File, onProgress: (progress: number) => void): Promise<Blob> {
  try {
    const {
      ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality, canEncodeVideo,
      getFirstEncodableAudioCodec,
    } = await import("mediabunny");
    const videoQuality = new Quality({ bitrate: VIDEO_BITRATE });
    const audioQuality = new Quality({ bitrate: AUDIO_BITRATE });
    if (!(await canEncodeVideo("avc", { width: 1280, height: 720, quality: videoQuality }))) return file;
    // Some browsers, such as Chromium on Linux, cannot encode AAC.
    const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], { quality: audioQuality });
    if (!audioCodec) return file;
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const conversion = await Conversion.init({
      input,
      output,
      video: (track) => {
        const size = Math.min(MAX_SHORT_EDGE, track.displayWidth, track.displayHeight);
        return {
          codec: "avc",
          quality: videoQuality,
          ...(track.displayHeight > track.displayWidth ? { width: size } : { height: size }),
        };
      },
      audio: { codec: audioCodec, quality: audioQuality },
    });
    // A dropped track, such as audio the browser cannot encode, would lose content.
    if (!conversion.isValid || conversion.discardedTracks.length > 0) return file;
    conversion.onProgress = onProgress;
    await conversion.execute();
    if (!target.buffer) return file;
    const compressed = new Blob([target.buffer], { type: "video/mp4" });
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}
