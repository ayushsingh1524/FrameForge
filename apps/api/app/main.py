import json
import os

from fastapi import FastAPI, HTTPException
from google import genai
from google.genai import types
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="FrameForge API", version="0.1.0")

# Local browser development only; production origins must be explicitly configured.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https://[a-zA-Z0-9-]+-3000\.app\.github\.dev",
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ClipRange(BaseModel):
    clip_id: str = Field(min_length=1, max_length=128)
    source_id: str = Field(min_length=1, max_length=128)
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_seconds <= self.start_seconds:
            raise ValueError("end_seconds must be greater than start_seconds")
        return self


class ValidateTimelineRequest(BaseModel):
    clips: list[ClipRange] = Field(max_length=1000)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "frameforge-api"}


@app.post("/api/timeline/validate")
def validate_timeline(payload: ValidateTimelineRequest) -> dict[str, int | bool]:
    # Contract validation only: no storage, export, or editing side effects.
    return {"valid": True, "clip_count": len(payload.clips)}


class ManifestAsset(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=512)
    duration: float = Field(gt=0)
    kind: str


class ManifestTrack(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    kind: str


class ManifestClip(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    assetId: str = Field(min_length=1, max_length=128)
    trackId: str = Field(min_length=1, max_length=128)
    timelineStart: float = Field(ge=0)
    sourceIn: float = Field(ge=0)
    sourceOut: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_source_range(self):
        if self.sourceOut <= self.sourceIn:
            raise ValueError("sourceOut must be greater than sourceIn")
        return self


class ManifestTimeline(BaseModel):
    tracks: list[ManifestTrack] = Field(max_length=100)
    clips: list[ManifestClip] = Field(max_length=1000)


class ProjectManifest(BaseModel):
    schemaVersion: int
    projectId: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    updatedAt: str = Field(min_length=1, max_length=64)
    assets: list[ManifestAsset] = Field(max_length=1000)
    timeline: ManifestTimeline

    @model_validator(mode="after")
    def validate_references(self):
        if self.schemaVersion != 1:
            raise ValueError("unsupported project schema version")
        asset_ids = {asset.id for asset in self.assets}
        track_ids = {track.id for track in self.timeline.tracks}
        for clip in self.timeline.clips:
            if clip.assetId not in asset_ids:
                raise ValueError(f"unknown assetId: {clip.assetId}")
            if clip.trackId not in track_ids:
                raise ValueError(f"unknown trackId: {clip.trackId}")
        return self


@app.post("/api/projects/validate")
def validate_project(payload: ProjectManifest) -> dict[str, int | bool]:
    # Validation boundary only. Server-side persistence is intentionally not
    # claimed until authenticated storage is introduced.
    return {
        "valid": True,
        "asset_count": len(payload.assets),
        "clip_count": len(payload.timeline.clips),
    }


class AiTimelineClip(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    trackId: str = Field(min_length=1, max_length=128)
    timelineStart: float = Field(ge=0)
    sourceIn: float = Field(ge=0)
    sourceOut: float = Field(gt=0)


class AiTimelineTrack(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    kind: str


class AiEditRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=1000)
    clips: list[AiTimelineClip] = Field(min_length=1, max_length=200)
    tracks: list[AiTimelineTrack] = Field(min_length=1, max_length=100)


AI_EDIT_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["split", "remove", "move", "trim"]},
        "clipId": {"type": "string"},
        "at": {"type": ["number", "null"]},
        "trackId": {"type": ["string", "null"]},
        "timelineStart": {"type": ["number", "null"]},
        "sourceIn": {"type": ["number", "null"]},
        "sourceOut": {"type": ["number", "null"]},
    },
    "required": ["type", "clipId", "at", "trackId", "timelineStart", "sourceIn", "sourceOut"],
    "additionalProperties": False,
}


def plan_ai_edit(payload: AiEditRequest) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured on the API server.")

    context = {
        "clips": [clip.model_dump() for clip in payload.clips],
        "tracks": [track.model_dump() for track in payload.tracks],
    }
    client = genai.Client(api_key=api_key)
    prompt = (
        "You are FrameForge's edit planner. Convert exactly one user request into exactly one "
        "structured timeline command. Use only IDs present in the supplied timeline. Never invent "
        "clips or tracks. Times are seconds. For relative language such as first/second clip, infer "
        "from timelineStart order. Return the closest supported command: split, remove, move, or trim.\n\n"
        f"Timeline: {json.dumps(context)}\nUser edit request: {payload.instruction}"
    )
    try:
        response = client.models.generate_content(
            model=os.getenv("FRAMEFORGE_AI_MODEL", "gemini-3.7-flash"),
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_json_schema=AI_EDIT_SCHEMA,
            ),
        )
        command = json.loads(response.text)
    except Exception as exc:
        # Surface Gemini's HTTP status/message for development diagnostics; never include credentials.
        status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
        message = str(exc).replace(api_key, "[redacted]")
        raise HTTPException(status_code=502, detail=f"Gemini planner failed ({status or 'unknown'}): {message[:500]}") from exc
    return {"command": command, "model": os.getenv("FRAMEFORGE_AI_MODEL", "gemini-3.7-flash")}


@app.post("/api/ai/edit-command")
def ai_edit_command(payload: AiEditRequest) -> dict:
    # The model only proposes a command. The browser independently validates
    # the proposal against the live timeline before dispatching an undoable action.
    return plan_ai_edit(payload)
