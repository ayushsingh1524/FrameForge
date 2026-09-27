# Media preview and export boundary

## Implemented in milestone 2B

- A detached HTMLVideoElement seeks into each imported video and captures one small JPEG thumbnail.
- The editor displays the same thumbnail in the asset library and on timeline clips.
- Thumbnail extraction has a timeout, abort cleanup and a graceful placeholder for unsupported codecs.
- Timeline-to-source timestamp mapping is a pure function covered by unit tests.
- Browser playback is still a **single active source**. On overlapping tracks the highest video track is selected; layers are not composited.

## Export contract (design, not yet implemented)

The eventual renderer will accept an immutable, versioned project manifest:
- A stable source asset ID linked to an authenticated uploaded object, never a browser blob URL.
- Source in/out times and timeline start in seconds, with a declared frame rate and time base.
- Track ordering and explicit compositing/mixing semantics.
- Requested output dimensions, codec, audio sample rate and container.

The backend will validate ownership, ranges, codec support, maximum job size and media metadata. It will enqueue an idempotent render job with an input-manifest checksum. A dedicated FFmpeg worker will fetch source media, render to a temporary object, verify output, atomically publish the artifact and report progress/errors. Job retries must not publish duplicate outputs. Credentials and raw FFmpeg arguments must never be accepted from untrusted clients.

**Not implemented:** upload, persistent manifests, queue, FFmpeg rendering, audio mixing, thumbnail caching across sessions, waveform extraction, and browser compositing. Thumbnail JPEGs are only local UI previews, not frames suitable for export.
