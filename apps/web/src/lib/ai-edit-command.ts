import type { Timeline, TimelineAction } from "./editor-engine";

export type AiEditCommand =
  | { type: "split"; clipId: string; at: number }
  | { type: "remove"; clipId: string }
  | { type: "move"; clipId: string; trackId: string; timelineStart: number }
  | { type: "trim"; clipId: string; sourceIn: number; sourceOut: number };

export type CommandResult =
  | { ok: true; action: TimelineAction; summary: string }
  | { ok: false; error: string };

const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

export function validateAiEditCommand(command: AiEditCommand, timeline: Timeline): CommandResult {
  const clip = timeline.clips.find((item) => item.id === command.clipId);
  if (!clip) return { ok: false, error: "The requested clip does not exist." };

  switch (command.type) {
    case "split": {
      if (!finiteNonNegative(command.at)) return { ok: false, error: "Split time must be a valid non-negative number." };
      const end = clip.timelineStart + (clip.sourceOut - clip.sourceIn);
      if (command.at <= clip.timelineStart + 0.05 || command.at >= end - 0.05) {
        return { ok: false, error: "Split time must be inside the clip." };
      }
      return {
        ok: true,
        action: { type: "split", clipId: clip.id, at: command.at, rightId: crypto.randomUUID() },
        summary: `Split clip at ${command.at.toFixed(1)}s`,
      };
    }
    case "remove":
      return { ok: true, action: { type: "remove", clipId: clip.id }, summary: "Remove clip" };
    case "move":
      if (!finiteNonNegative(command.timelineStart)) return { ok: false, error: "Timeline position must be non-negative." };
      if (!timeline.tracks.some((track) => track.id === command.trackId && track.kind === "video")) {
        return { ok: false, error: "Target video track does not exist." };
      }
      return {
        ok: true,
        action: { type: "move", clipId: clip.id, trackId: command.trackId, timelineStart: command.timelineStart },
        summary: `Move clip to ${command.trackId} at ${command.timelineStart.toFixed(1)}s`,
      };
    case "trim":
      if (!finiteNonNegative(command.sourceIn) || !Number.isFinite(command.sourceOut) || command.sourceOut <= command.sourceIn) {
        return { ok: false, error: "Trim range is invalid." };
      }
      return {
        ok: true,
        action: { type: "trim", clipId: clip.id, sourceIn: command.sourceIn, sourceOut: command.sourceOut },
        summary: `Trim source to ${command.sourceIn.toFixed(1)}–${command.sourceOut.toFixed(1)}s`,
      };
  }
}

export function parseLocalEditInstruction(input: string, timeline: Timeline): AiEditCommand | null {
  const text = input.trim().toLowerCase();
  const first = timeline.clips[0];
  if (!first) return null;

  const split = text.match(/^split (?:the )?(?:first )?clip at (\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?$/);
  if (split) return { type: "split", clipId: first.id, at: Number(split[1]) };

  if (/^(?:remove|delete) (?:the )?(?:first )?clip$/.test(text)) {
    return { type: "remove", clipId: first.id };
  }

  const move = text.match(/^move (?:the )?(?:first )?clip to (v\d+) at (\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?$/);
  if (move) return { type: "move", clipId: first.id, trackId: move[1], timelineStart: Number(move[2]) };

  const trim = text.match(/^trim (?:the )?(?:first )?clip (?:from )?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)? to (\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?$/);
  if (trim) return { type: "trim", clipId: first.id, sourceIn: Number(trim[1]), sourceOut: Number(trim[2]) };

  return null;
}
