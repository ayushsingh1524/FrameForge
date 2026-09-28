import assert from "node:assert/strict";
import test from "node:test";
import { normalizePeaks } from "./audio-waveform";

test("normalizes waveform buckets", () => {
  const peaks = normalizePeaks(new Float32Array([0, .5, -1, .25]), 2);
  assert.deepEqual(peaks, [.5, 1]);
});

test("handles silence and empty buffers", () => {
  assert.deepEqual(normalizePeaks(new Float32Array(), 10), []);
  assert.deepEqual(normalizePeaks(new Float32Array([0, 0]), 2), [.04, .04]);
});
