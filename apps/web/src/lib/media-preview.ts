/** Browser-only preview helpers. These images are UI thumbnails, not export frames. */
export const THUMBNAIL_WIDTH = 192;
export const THUMBNAIL_HEIGHT = 108;

export function thumbnailTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  // Avoid black first frames and the exact end of a source.
  return Math.min(Math.max(duration * 0.12, 0.05), Math.max(0, duration - 0.05));
}

export function previewSourceTime(
  sourceIn: number,
  sourceOut: number,
  timelineStart: number,
  playhead: number
): number {
  return Math.max(sourceIn, Math.min(sourceOut, sourceIn + playhead - timelineStart));
}

/**
 * Decode one frame in a detached video and scale it into a small canvas.
 * Browser codec support varies. Callers should display a fallback on failure.
 */
export function generateThumbnail(
  objectUrl: string,
  duration: number,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const timer = window.setTimeout(() => finish(new Error("Thumbnail timed out")), 12000);
    const onAbort = () => finish(new DOMException("Cancelled", "AbortError"));
    const finish = (error?: Error, image?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (error) reject(error);
      else resolve(image ?? "");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    video.onerror = () => finish(new Error("Browser cannot decode media for thumbnail"));
    video.onloadedmetadata = () => {
      try {
        const sourceDuration = Number.isFinite(video.duration) ? video.duration : duration;
        video.currentTime = thumbnailTime(sourceDuration);
      } catch {
        finish(new Error("Unable to seek media for thumbnail"));
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMBNAIL_WIDTH;
        canvas.height = THUMBNAIL_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context || !video.videoWidth || !video.videoHeight) {
          finish(new Error("No drawable video frame"));
          return;
        }
        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const width = video.videoWidth * scale;
        const height = video.videoHeight * scale;
        context.fillStyle = "#0b1020";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        finish(undefined, canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        finish(new Error("Thumbnail canvas capture failed"));
      }
    };
    video.src = objectUrl;
  });
}
