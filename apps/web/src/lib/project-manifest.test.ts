import assert from "node:assert/strict";
import test from "node:test";
import { isProjectManifest, relinkAssetId } from "./project-manifest";

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

test("relinks only an unambiguous filename and duration match", () => {
  const assets = [{ id: "a1", name: "clip.mp4", duration: 5, kind: "video" as const }];
  assert.equal(relinkAssetId(assets, { name: "clip.mp4", duration: 5.1 }), "a1");
  assert.equal(relinkAssetId(assets, { name: "other.mp4", duration: 5 }), null);
});
