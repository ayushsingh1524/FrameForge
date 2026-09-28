import assert from "node:assert/strict";
import test from "node:test";
import { isProjectManifest } from "./project-manifest";

test("accepts a versioned project manifest", () => {
  assert.equal(isProjectManifest({
    schemaVersion: 1, projectId: "p1", name: "Demo", updatedAt: "2026-01-01T00:00:00.000Z",
    assets: [], timeline: { tracks: [], clips: [] },
  }), true);
});

test("rejects unsupported and malformed manifests", () => {
  assert.equal(isProjectManifest({ schemaVersion: 2, projectId: "p1", assets: [], timeline: { tracks: [], clips: [] } }), false);
  assert.equal(isProjectManifest(null), false);
});
