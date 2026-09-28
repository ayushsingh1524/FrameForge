import assert from "node:assert/strict";
import test from "node:test";
import { parseLocalEditInstruction, validateAiEditCommand } from "./ai-edit-command";

const timeline = {
  tracks: [{ id: "v1", name: "Video 1", kind: "video" as const }],
  clips: [{ id: "c1", assetId: "a1", trackId: "v1", timelineStart: 0, sourceIn: 0, sourceOut: 10 }],
};

test("parses and validates a split instruction", () => {
  const command = parseLocalEditInstruction("Split the first clip at 3 seconds", timeline);
  assert.deepEqual(command, { type: "split", clipId: "c1", at: 3 });
  const result = validateAiEditCommand(command!, timeline);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.action.type, "split");
});

test("rejects a split outside the clip", () => {
  const result = validateAiEditCommand({ type: "split", clipId: "c1", at: 12 }, timeline);
  assert.equal(result.ok, false);
});

test("rejects an unknown target track", () => {
  const result = validateAiEditCommand({ type: "move", clipId: "c1", trackId: "v9", timelineStart: 2 }, timeline);
  assert.equal(result.ok, false);
});
