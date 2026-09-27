import assert from "node:assert/strict";
import test from "node:test";
import {
  activeVideoClip,
  applyAction,
  historyReducer,
  initialHistory,
  initialTimeline,
  length,
  nextAvailableStart,
  sequenceDuration,
  type TimelineClip,
} from "./editor-engine";

const base: TimelineClip = {
  id: "c1", assetId: "asset1", trackId: "v1",
  timelineStart: 2, sourceIn: 1, sourceOut: 7,
};

test("calculates timeline duration and next append position", () => {
  const timeline = applyAction(initialTimeline, { type: "add", clip: base });
  assert.equal(sequenceDuration(timeline), 8);
  assert.equal(nextAvailableStart(timeline, "v1"), 8);
  assert.equal(nextAvailableStart(timeline, "v2"), 0);
});

test("split preserves total duration and positions", () => {
  const timeline = applyAction(initialTimeline, { type: "add", clip: base });
  const split = applyAction(timeline, { type: "split", clipId: "c1", at: 5, rightId: "c2" });
  assert.equal(split.clips.length, 2);
  assert.equal(split.clips[0].sourceOut, 4);
  assert.equal(split.clips[1].sourceIn, 4);
  assert.equal(split.clips[1].timelineStart, 5);
  assert.equal(length(split.clips[0]) + length(split.clips[1]), 6);
  assert.equal(sequenceDuration(split), 8);
});

test("rejects invalid splits and trim ranges", () => {
  const timeline = applyAction(initialTimeline, { type: "add", clip: base });
  assert.equal(applyAction(timeline, { type: "split", clipId: "c1", at: 2, rightId: "c2" }), timeline);
  assert.equal(applyAction(timeline, { type: "trim", clipId: "c1", sourceIn: 8, sourceOut: 3 }), timeline);
});

test("upper video track takes precedence for preview", () => {
  const lower = applyAction(initialTimeline, { type: "add", clip: base });
  const upper = applyAction(lower, { type: "add", clip: { ...base, id: "c2", trackId: "v2" } });
  assert.equal(activeVideoClip(upper, 3)?.id, "c2");
  assert.equal(activeVideoClip(upper, 0), null);
});

test("undo and redo restore exact timeline state", () => {
  const added = historyReducer(initialHistory, { type: "add", clip: base });
  const moved = historyReducer(added, { type: "move", clipId: "c1", trackId: "v2", timelineStart: 10 });
  assert.equal(moved.present.clips[0].timelineStart, 10);
  const undone = historyReducer(moved, { type: "undo" });
  assert.equal(undone.present.clips[0].timelineStart, 2);
  const redone = historyReducer(undone, { type: "redo" });
  assert.deepEqual(redone.present, moved.present);
});
