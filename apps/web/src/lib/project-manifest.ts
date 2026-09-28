import type { MediaAsset, Timeline } from "./editor-engine";

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_STORAGE_KEY = "frameforge.project.v1";

export type PersistedAsset = {
  id: string;
  name: string;
  duration: number;
  kind: "video";
};

export type ProjectManifest = {
  schemaVersion: 1;
  projectId: string;
  name: string;
  updatedAt: string;
  assets: PersistedAsset[];
  timeline: Timeline;
};

export function createProjectManifest(
  timeline: Timeline,
  assets: MediaAsset[],
  projectId = crypto.randomUUID(),
  name = "Untitled project"
): ProjectManifest {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    name,
    updatedAt: new Date().toISOString(),
    assets: assets.map(({ id, name: assetName, duration, kind }) => ({
      id, name: assetName, duration, kind,
    })),
    timeline,
  };
}

export function isProjectManifest(value: unknown): value is ProjectManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectManifest>;
  return candidate.schemaVersion === PROJECT_SCHEMA_VERSION &&
    typeof candidate.projectId === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.timeline?.tracks) &&
    Array.isArray(candidate.timeline?.clips);
}

export function saveProjectManifest(manifest: ProjectManifest): void {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(manifest));
}

export function loadProjectManifest(): ProjectManifest | null {
  const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isProjectManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function relinkAssetId(
  savedAssets: PersistedAsset[],
  file: { name: string; duration: number }
): string | null {
  const matches = savedAssets.filter(
    (asset) => asset.name === file.name && Math.abs(asset.duration - file.duration) < 0.25
  );
  return matches.length === 1 ? matches[0].id : null;
}
