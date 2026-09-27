export type Clip = {
  id: string;
  name: string;
  sourceId: string;
  objectUrl: string;
  duration: number;
  start: number;
  end: number;
};

export const clipLength = (clip: Clip): number =>
  Math.max(0, clip.end - clip.start);

export function splitClip(clip: Clip, at: number): [Clip, Clip] | null {
  if (at <= clip.start + 0.05 || at >= clip.end - 0.05) return null;
  return [
    { ...clip, id: crypto.randomUUID(), end: at },
    { ...clip, id: crypto.randomUUID(), start: at },
  ];
}

export function formatTime(value: number): string {
  if (!Number.isFinite(value)) return "00:00";
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return minutes + ":" + seconds;
}
