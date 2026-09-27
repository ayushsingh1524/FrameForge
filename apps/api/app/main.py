from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="FrameForge API", version="0.1.0")

# Local browser development only; production origins must be explicitly configured.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
