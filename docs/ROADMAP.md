# Milestones

1. **Foundation** — local import, clip selection, basic trim/split/reordering, FastAPI validation, Codespaces, CI.
2. **Editing core** — normalized track model, command reducer, undo/redo, synchronized playback, keyboard accessibility, unit and browser tests.
3. **Media** — thumbnails, waveform generation, decoding fallbacks, profiling and large-project benchmarks.
4. **Cloud export** — authenticated uploads, durable PostgreSQL projects, S3-compatible storage, Redis queues, FFmpeg workers, retries and observability.
5. **AI** — transcription, tool-calling editing agent, schema validation, explicit human approval and deterministic evaluation benchmark.
6. **Beta** — real user feedback, bug fixes, CI/CD deployment, accessibility and reproducible FPS/export reliability measurements.

Performance numbers are acceptance goals only until measured on specified hardware, footage, and test setup. Scope and delivery dates will be adjusted based on actual implementation and test results.

## Milestone 2 development branch

Implemented in the proposed timeline-engine branch: normalized video tracks and clip placements, draggable track arrangement, timeline scrubbing, single-source synchronized preview, keyboard shortcuts, undo/redo and deterministic engine tests. Audio mixing, composited video layers, collision/ripple semantics, persistence and exports are **not yet implemented**. Browser acceptance testing is required before merging.

## Milestone 2B: media previews

The media-preview branch introduces bounded browser-generated JPEG thumbnails in the media bin and timeline, pure timestamp mapping tests and a documented cloud export contract. This is not a rendered output or persistent thumbnail cache. Waveforms and cloud export remain future work; test actual media in Codespaces before merging.

## Milestone 2C: embedded-audio waveform preview

Decode imported video audio locally with Web Audio and render normalized waveform peaks in the audio lane. This is visualization only: the video element remains the playback source. Independent audio clips, gain automation, mixing, compositing and export remain future milestones.
