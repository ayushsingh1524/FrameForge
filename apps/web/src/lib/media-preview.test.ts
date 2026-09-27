import assert from "node:assert/strict";
import test from "node:test";
import { previewSourceTime, thumbnailTime } from "./media-preview";

test("thumbnail time stays within the media duration", () => {
  assert.equal(thumbnailTime(0), 0);
  assert.equal(thumbnailTime(10), 1.2);
  assert.ok(thumbnailTime(0.08) < 0.08);
  assert.equal(thumbnailTime(Infinity), 0);
});

test("preview time maps timeline positions into trimmed source", () => {
  assert.equal(previewSourceTime(5, 9, 20, 22), 7);
  assert.equal(previewSourceTime(5, 9, 20, 19), 5);
  assert.equal(previewSourceTime(5, 9, 20, 30), 9);
});
