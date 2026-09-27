# FrameForge

**AI-native browser video editor — under active development.** A browser-first portfolio project designed to explore responsive editing interfaces, reliable media infrastructure, and agent-driven editing.

## Milestone 1: foundation

This branch contains:
- Next.js + TypeScript editor with local video import, selected-clip preview, trim handles, clip splitting, clip ordering, and removal.
- FastAPI health endpoint and validated timeline-edit request contract.
- Browser-only GitHub Codespaces configuration and basic frontend/backend CI.
- Architecture and milestone plan.

**Not implemented yet:** persistent projects, multitrack compositing, accurate final export, FFmpeg workers, cloud storage, AI editing, large-media optimization, production hardening. The local browser preview is not a rendered export.

## Develop entirely in the browser

1. Open this repository and select **Code → Codespaces → Create codespace**.
2. Wait for the container setup to install Node.js/Python dependencies.
3. Run these commands in **two Codespaces terminals**:

   Terminal A:
   ```bash
   pnpm --dir apps/web dev --hostname 0.0.0.0
   ```

   Terminal B:
   ```bash
   python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port 8000 --reload
   ```

4. Open the forwarded port **3000** for the editor and port **8000/docs** for API documentation.

A Codespaces container uses cloud compute, though browser assets temporarily reside in the container/browser during development. Avoid uploading private footage until authentication and secure storage are implemented.

## Validate

```bash
pnpm --dir apps/web typecheck
python -m pytest apps/api/tests -q
```

## Planned architecture

- **Editor:** TypeScript timeline model and React interaction layer; later WebCodecs/Web Workers for measurable bottlenecks.
- **API:** FastAPI with validated edit contracts, later PostgreSQL persistence and authentication.
- **Rendering:** future FFmpeg worker pool, Redis task queue, object storage, progress tracking, retries.
- **AI:** future constrained tool-calling agent proposing reversible commands, never directly executing arbitrary code.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Project integrity

Only implemented features are described as complete. Benchmarks (FPS, export concurrency, AI task success) will be reported with test conditions when measured.
