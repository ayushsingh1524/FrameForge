export type MediaAsset = {
  id: string;
  name: string;
  objectUrl: string;
  duration: number;
  kind: "video";
};

export type TimelineClip = {
  id: string;
  assetId: string;
  trackId: string;
  timelineStart: number;
  sourceIn: number;
  sourceOut: number;
};

export type Track = { id: string; name: string; kind: "video" | "audio" };

export type Timeline = {
  tracks: Track[];
  clips: TimelineClip[];
};

export type TimelineAction =
  | { type: "add"; clip: TimelineClip }
  | { type: "remove"; clipId: string }
  | { type: "trim"; clipId: string; sourceIn: number; sourceOut: number }
  | { type: "split"; clipId: string; at: number; rightId: string }
  | { type: "move"; clipId: string; trackId: string; timelineStart: number }
  | { type: "add-track"; track: Track }
  | { type: "restore"; timeline: Timeline };

export const initialTimeline: Timeline = {
  tracks: [
    { id: "v1", name: "Video 1", kind: "video" },
    { id: "v2", name: "Video 2", kind: "video" },
    { id: "a1", name: "Audio 1 · future", kind: "audio" },
  ],
  clips: [],
};

export const length = (clip: TimelineClip): number =>
  Math.max(0, clip.sourceOut - clip.sourceIn);

export const timelineEnd = (clip: TimelineClip): number =>
  clip.timelineStart + length(clip);

export const sequenceDuration = (timeline: Timeline): number =>
  timeline.clips.reduce((end, clip) => Math.max(end, timelineEnd(clip)), 0);

export function nextAvailableStart(timeline: Timeline, trackId: string): number {
  return timeline.clips
    .filter((clip) => clip.trackId === trackId)
    .reduce((end, clip) => Math.max(end, timelineEnd(clip)), 0);
}

export function activeVideoClip(timeline: Timeline, time: number): TimelineClip | null {
  // Higher-numbered video tracks visually take precedence. This is a
  // single-source preview, NOT a composited or exported multitrack render.
  const videoTracks = timeline.tracks.filter((track) => track.kind === "video");
  for (const track of [...videoTracks].reverse()) {
    const candidates = timeline.clips.filter(
      (clip) =>
        clip.trackId === track.id &&
        time >= clip.timelineStart &&
        time < timelineEnd(clip)
    );
    if (candidates.length) return candidates[candidates.length - 1];
  }
  return null;
}

export function applyAction(state: Timeline, action: TimelineAction): Timeline {
  switch (action.type) {
    case "restore":
      return action.timeline;
    case "add":
      if (
        !state.tracks.some((track) => track.id === action.clip.trackId && track.kind === "video") ||
        length(action.clip) <= 0
      ) return state;
      return { ...state, clips: [...state.clips, action.clip] };
    case "remove":
      if (!state.clips.some((clip) => clip.id === action.clipId)) return state;
      return { ...state, clips: state.clips.filter((clip) => clip.id !== action.clipId) };
    case "trim":
      if (
        !Number.isFinite(action.sourceIn) ||
        !Number.isFinite(action.sourceOut) ||
        action.sourceIn < 0 ||
        action.sourceOut <= action.sourceIn
      ) return state;
      return {
        ...state,
        clips: state.clips.map((clip) =>
          clip.id === action.clipId
            ? { ...clip, sourceIn: action.sourceIn, sourceOut: action.sourceOut }
            : clip
        ),
      };
    case "split": {
      const clip = state.clips.find((item) => item.id === action.clipId);
      if (!clip || state.clips.some((item) => item.id === action.rightId)) return state;
      const sourceAt = clip.sourceIn + (action.at - clip.timelineStart);
      if (sourceAt <= clip.sourceIn + 0.05 || sourceAt >= clip.sourceOut - 0.05) return state;
      return {
        ...state,
        clips: state.clips.flatMap((item) =>
          item.id === clip.id
            ? [
                { ...clip, sourceOut: sourceAt },
                { ...clip, id: action.rightId, sourceIn: sourceAt, timelineStart: action.at },
              ]
            : [item]
        ),
      };
    }
    case "move":
      if (
        !Number.isFinite(action.timelineStart) ||
        action.timelineStart < 0 ||
        !state.tracks.some((track) => track.id === action.trackId && track.kind === "video")
      ) return state;
      return {
        ...state,
        clips: state.clips.map((clip) =>
          clip.id === action.clipId
            ? { ...clip, trackId: action.trackId, timelineStart: action.timelineStart }
            : clip
        ),
      };
    case "add-track":
      if (state.tracks.some((track) => track.id === action.track.id)) return state;
      return { ...state, tracks: [...state.tracks, action.track] };
  }
}

export type History = { past: Timeline[]; present: Timeline; future: Timeline[] };

export const initialHistory: History = {
  past: [],
  present: initialTimeline,
  future: [],
};

export function historyReducer(
  history: History,
  action: TimelineAction | { type: "undo" } | { type: "redo" }
): History {
  if (action.type === "undo") {
    if (!history.past.length) return history;
    return {
      past: history.past.slice(0, -1),
      present: history.past[history.past.length - 1],
      future: [history.present, ...history.future],
    };
  }
  if (action.type === "redo") {
    if (!history.future.length) return history;
    return {
      past: [...history.past, history.present].slice(-100),
      present: history.future[0],
      future: history.future.slice(1),
    };
  }
  const next = applyAction(history.present, action);
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: next,
    future: [],
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}
