# Architecture notes

## Milestone 1 (implemented on foundation branch)

- Next.js App Router editor handles imported videos via `URL.createObjectURL`, with local-only in-memory clip ranges and an HTMLVideoElement preview.
- Clip ranges are non-destructive. The canvas currently represents a sequential list, not a fully synchronized or composited multitrack timeline.
- FastAPI exposes a health check and Pydantic validated timeline request. Browser editor and API are intentionally not yet coupled for persistence.
- GitHub Codespaces config provisions Node 22 and Python 3.12; GitHub Actions checks TypeScript and FastAPI contracts.

## Planned boundaries

```text
Browser editor / timeline commands
      |            \
  preview worker    API / project metadata (PostgreSQL)
      |                     |
 local decoding       media store / upload gateway
                            |
                      Redis job queue
                            |
                    FFmpeg render workers
                            |
                   export storage / status

AI agent -> proposed structured commands -> schema validation
         -> user approval -> editor command reducer -> undo history
```

## Design constraints

- Object URLs are only valid within the browser session; introduce authenticated uploads and persistent media IDs before saving projects.
- Separate preview timing from export timing; identical edits must produce deterministic rendering semantics.
- Do not treat browser WebCodecs as a universal codec guarantee; provide fallback handling.
- AI commands must be validated and reversible; prohibit arbitrary server command execution.
- Store no user secrets in commits or frontend bundles.
