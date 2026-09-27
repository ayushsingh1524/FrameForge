"use client";

import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { generateThumbnail, previewSourceTime } from "@/lib/media-preview";
import {
  activeVideoClip,
  formatTime,
  historyReducer,
  initialHistory,
  length,
  MediaAsset,
  nextAvailableStart,
  sequenceDuration,
  TimelineAction,
  TimelineClip,
  timelineEnd,
} from "@/lib/editor-engine";

const PX_PER_SECOND = 32;

export function Editor() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const timeline = history.present;
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const thumbnailsStarted = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const assetUrls = useRef<string[]>([]);
  const playheadRef = useRef(0);
  const playingRef = useRef(false);
  const duration = sequenceDuration(timeline);
  const selected = timeline.clips.find((clip) => clip.id === selectedId) ?? null;
  const selectedAsset = assets.find((asset) => asset.id === selected?.assetId);
  const active = activeVideoClip(timeline, Math.min(playhead, Math.max(0, duration - 0.001)));
  const activeAsset = assets.find((asset) => asset.id === active?.assetId);
  const pixels = PX_PER_SECOND * zoom;

  useEffect(() => {
    const urls = assetUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const commit = useCallback((action: TimelineAction) => dispatch(action), []);

  const importFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).filter((file) => file.type.startsWith("video/"));
    if (!incoming.length) {
      setError("Choose a video file. Audio-only imports are not supported yet.");
      return;
    }
    setError("");
    const next = incoming.map((file): MediaAsset => {
      const objectUrl = URL.createObjectURL(file);
      assetUrls.current.push(objectUrl);
      return { id: crypto.randomUUID(), name: file.name, objectUrl, duration: 0, kind: "video" };
    });
    setAssets((current) => [...current, ...next]);
  }, []);

  // Generate one low-resolution frame per source. Extraction is cancellable
  // and deliberately separate from the editing history.
  useEffect(() => {
    const controller = new AbortController();
    const pending = assets.filter(
      (asset) => asset.duration > 0 && !thumbnailsStarted.current.has(asset.id)
    );
    pending.forEach((asset) => {
      thumbnailsStarted.current.add(asset.id);
      generateThumbnail(asset.objectUrl, asset.duration, controller.signal)
        .then((image) => setThumbnails((current) => ({ ...current, [asset.id]: image })))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            thumbnailsStarted.current.delete(asset.id);
          }
          // Codec and extraction failures keep the existing placeholder.
        });
    });
    return () => {
      controller.abort();
      pending.forEach((asset) => thumbnailsStarted.current.delete(asset.id));
    };
  }, [assets]);

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) importFiles(event.target.files);
    event.target.value = "";
  };

  const onDropFiles = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      importFiles(event.dataTransfer.files);
    }
  };

  // Read media metadata without rendering every imported asset in the UI.
  useEffect(() => {
    const unresolved = assets.filter((asset) => asset.duration === 0);
    if (!unresolved.length) return;
    const probes = unresolved.map((asset) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = asset.objectUrl;
      probe.onloadedmetadata = () => {
        // Capture before unloading: React may execute the state updater after
        // probe.load(), at which point probe.duration has reset to NaN.
        const measuredDuration = probe.duration;
        if (Number.isFinite(measuredDuration) && measuredDuration > 0) {
          setAssets((current) =>
            current.map((item) =>
              item.id === asset.id ? { ...item, duration: measuredDuration } : item
            )
          );
        } else {
          setError(`Cannot read duration for ${asset.name}.`);
        }
        probe.removeAttribute("src");
        probe.load();
      };
      probe.onerror = () => {
        setError(`Unable to decode ${asset.name}. Try a browser-supported MP4.`);
        probe.removeAttribute("src");
        probe.load();
      };
      return probe;
    });
    return () => {
      probes.forEach((probe) => {
        probe.onloadedmetadata = null;
        probe.onerror = null;
        probe.removeAttribute("src");
        probe.load();
      });
    };
  }, [assets]);

  const addAsset = (asset: MediaAsset, trackId = "v1") => {
    if (!asset.duration) return;
    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      trackId,
      timelineStart: nextAvailableStart(timeline, trackId),
      sourceIn: 0,
      sourceOut: asset.duration,
    };
    commit({ type: "add", clip });
    setSelectedId(clip.id);
    seek(clip.timelineStart);
  };

  const seek = useCallback((time: number) => {
    const next = Math.max(0, time);
    playheadRef.current = next;
    setPlayhead(next);
  }, []);

  const split = useCallback(() => {
    if (!selected) return;
    commit({ type: "split", clipId: selected.id, at: playheadRef.current, rightId: crypto.randomUUID() });
  }, [selected, commit]);

  const togglePlayback = useCallback(() => {
    if (!duration) return;
    if (playheadRef.current >= duration) seek(0);
    setPlaying((current) => !current);
  }, [duration, seek]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (!mod && event.code === "Space") {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (!mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        split();
      } else if (!mod && (event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        dispatch({ type: "remove", clipId: selectedId });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, split]);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) videoRef.current?.pause();
  }, [playing]);

  // Timeline time is the source of truth; the preview video follows it.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.2);
      previous = now;
      const next = playheadRef.current + elapsed;
      if (next >= duration) {
        seek(duration);
        setPlaying(false);
        return;
      }
      seek(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, seek]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active || !activeAsset) return;
    const desired = previewSourceTime(active.sourceIn, active.sourceOut, active.timelineStart, playhead);
    if (Number.isFinite(desired) && Math.abs(video.currentTime - desired) > (playing ? 0.28 : 0.04)) {
      try { video.currentTime = Math.max(active.sourceIn, Math.min(active.sourceOut, desired)); }
      catch { /* Wait for metadata on source switch. */ }
    }
    if (playing && video.paused) {
      video.play().catch(() => {
        setPlaying(false);
        setError("Browser blocked playback or could not decode this file.");
      });
    }
  }, [playhead, active?.id, activeAsset?.id, playing, active, activeAsset]);

  const onClipDrop = (event: DragEvent<HTMLDivElement>, trackId: string) => {
    event.preventDefault();
    const clipId = event.dataTransfer.getData("application/x-frameforge-clip");
    const assetId = event.dataTransfer.getData("application/x-frameforge-asset");
    const bounds = event.currentTarget.getBoundingClientRect();
    const start = Math.max(0, Math.round(((event.clientX - bounds.left + event.currentTarget.scrollLeft) / pixels) * 10) / 10);
    if (clipId) {
      commit({ type: "move", clipId, trackId, timelineStart: start });
    } else if (assetId) {
      const asset = assets.find((item) => item.id === assetId);
      if (!asset || !asset.duration) return;
      const clip: TimelineClip = {
        id: crypto.randomUUID(), assetId, trackId,
        timelineStart: start, sourceIn: 0, sourceOut: asset.duration,
      };
      commit({ type: "add", clip });
      setSelectedId(clip.id);
    }
  };

  const onClipKey = (event: ReactKeyboardEvent<HTMLButtonElement>, clip: TimelineClip) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      commit({
        type: "move", clipId: clip.id, trackId: clip.trackId,
        timelineStart: Math.max(0, clip.timelineStart + (event.key === "ArrowRight" ? 0.5 : -0.5)),
      });
    }
  };

  const sortedAssets = useMemo(() => assets, [assets]);

  return (
    <main className="app-shell" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={onDropFiles}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><div><strong>FrameForge</strong><small>EDITOR / MILESTONE 02</small></div></div>
        <div className="section-label">YOUR MEDIA</div>
        <button className="primary" onClick={() => inputRef.current?.click()}>+ Import video</button>
        <input ref={inputRef} type="file" accept="video/*" multiple hidden onChange={onImport} />
        <p className="hint">Import local video, then add it to a track or drag it onto the timeline.</p>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="asset-list">
          {!assets.length && <p className="muted">No media imported</p>}
          {sortedAssets.map((asset) => (
            <div key={asset.id} className="asset media-asset" draggable={asset.duration > 0}
              onDragStart={(event) => event.dataTransfer.setData("application/x-frameforge-asset", asset.id)}>
              {thumbnails[asset.id] ? (
                <img className="asset-thumbnail" src={thumbnails[asset.id]} alt="" width={64} height={36} />
              ) : <span className="clip-icon">▶</span>}
              <span className="asset-text"><strong title={asset.name}>{asset.name}</strong><small>{asset.duration ? formatTime(asset.duration) : "Reading metadata…"}</small></span>
              <button className="asset-add" disabled={!asset.duration} onClick={() => addAsset(asset)} aria-label={`Add ${asset.name} to timeline`}>+</button>
            </div>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><strong>Untitled project</strong><span className="pill">Timeline engine · local prototype</span></div>
          <div className="history-buttons">
            <button disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })} title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
            <button disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })} title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button>
          </div>
        </header>

        <div className="preview-area">
          <div className="preview-frame">
            {active && activeAsset ? (
              <video key={activeAsset.id} ref={videoRef} src={activeAsset.objectUrl} playsInline preload="auto" muted={false}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  const position = playheadRef.current;
                  const current = activeVideoClip(timeline, position);
                  if (current) video.currentTime = previewSourceTime(current.sourceIn, current.sourceOut, current.timelineStart, position);
                  if (playingRef.current) video.play().catch(() => setPlaying(false));
                }} />
            ) : (
              <div className="empty-preview"><div className="empty-icon">▶</div><h2>{assets.length ? "No clip at playhead" : "Start creating"}</h2><p>{assets.length ? "Add media to a track and move the playhead." : "Import a video and add it to your timeline."}</p></div>
            )}
          </div>
          <div className="player-controls">
            <button disabled={!duration} onClick={() => seek(0)} aria-label="Go to beginning">⏮</button>
            <button className="play-button" disabled={!duration} onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
            <span className="timecode">{formatTime(playhead)} / {formatTime(duration)}</span>
            <span className="control-note">Thumbnail previews · single-source playback</span>
          </div>
        </div>

        <section className="timeline-panel">
          <div className="timeline-head"><strong>Timeline</strong><span>{timeline.clips.length} clips · {timeline.tracks.filter((track) => track.kind === "video").length} video tracks</span></div>
          <div className="timeline-toolbar">
            <button className="secondary compact" onClick={() => commit({ type: "add-track", track: { id: crypto.randomUUID(), name: `Video ${timeline.tracks.filter((track) => track.kind === "video").length + 1}`, kind: "video" } })}>+ Video track</button>
            <button className="secondary compact" disabled={!selected} onClick={split}>✂ Split (S)</button>
            <label>Zoom <input aria-label="Timeline zoom" type="range" min="0.5" max="3" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          </div>
          <div className="timeline-scroll">
            <div className="timeline-ruler" style={{ width: Math.max(750, duration * pixels + 100) }}>
              {Array.from({ length: Math.ceil(Math.max(30, duration) / 5) + 1 }, (_, index) => (
                <span key={index} style={{ left: index * 5 * pixels }}>{formatTime(index * 5)}</span>
              ))}
            </div>
            {timeline.tracks.map((track) => (
              <div key={track.id} className="track-row">
                <div className="track-label">{track.name}</div>
                <div className={track.kind === "audio" ? "track-lane audio-lane" : "track-lane"}
                  style={{ width: Math.max(750, duration * pixels + 100) }}
                  onDragOver={(event) => { if (track.kind === "video") event.preventDefault(); }}
                  onDrop={(event) => { if (track.kind === "video") { event.stopPropagation(); onClipDrop(event, track.id); } }}>
                  {timeline.clips.filter((clip) => clip.trackId === track.id).map((clip) => {
                    const asset = assets.find((item) => item.id === clip.assetId);
                    return (
                      <button key={clip.id} draggable
                        onDragStart={(event) => event.dataTransfer.setData("application/x-frameforge-clip", clip.id)}
                        onClick={() => { setSelectedId(clip.id); seek(clip.timelineStart); }}
                        onKeyDown={(event) => onClipKey(event, clip)}
                        className={selectedId === clip.id ? "timeline-clip selected" : "timeline-clip"}
                        style={{ position: "absolute", left: clip.timelineStart * pixels, width: Math.max(35, length(clip) * pixels), height: 58, top: 7 }}
                        title={`${asset?.name ?? "Video"} — ${formatTime(clip.timelineStart)}`}>
                        {thumbnails[clip.assetId] && <img className="clip-thumbnail" src={thumbnails[clip.assetId]} alt="" draggable={false} />}
                        <span className="clip-copy"><strong>{asset?.name ?? "Video"}</strong><small>{length(clip).toFixed(1)}s</small></span>
                      </button>
                    );
                  })}
                  {track.kind === "audio" && <span className="track-placeholder">Audio lane reserved for upcoming audio engine</span>}
                </div>
              </div>
            ))}
            <div className="timeline-scrubber" style={{ width: Math.max(750, duration * pixels + 100) }}
              onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seek(Math.min(duration, Math.max(0, (event.clientX - rect.left) / pixels))); }}
              role="slider" tabIndex={0} aria-label="Timeline playhead" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={playhead}
              onKeyDown={(event) => { if (event.key === "ArrowRight") seek(Math.min(duration, playhead + 0.5)); if (event.key === "ArrowLeft") seek(Math.max(0, playhead - 0.5)); }}>
              <span className="playhead-indicator" style={{ left: playhead * pixels }} />
            </div>
          </div>
          <p className="hint">Video thumbnails are local previews. Drag between tracks; arrow keys nudge a focused clip. Space: play/pause · S: split · Ctrl/Cmd+Z: undo.</p>
        </section>
      </section>

      <aside className="inspector">
        <div className="section-label">CLIP INSPECTOR</div>
        {selected && selectedAsset ? (
          <>
            <h3>{selectedAsset.name}</h3>
            <p className="muted">Timeline: {formatTime(selected.timelineStart)} · Track: {timeline.tracks.find((track) => track.id === selected.trackId)?.name}</p>
            <label htmlFor="trim-start">Source in <strong>{selected.sourceIn.toFixed(1)}s</strong></label>
            <input id="trim-start" type="range" min={0} max={Math.max(0, selected.sourceOut - 0.1)}
              step={0.1} value={selected.sourceIn}
              onChange={(event) => commit({ type: "trim", clipId: selected.id, sourceIn: Number(event.target.value), sourceOut: selected.sourceOut })} />
            <label htmlFor="trim-end">Source out <strong>{selected.sourceOut.toFixed(1)}s</strong></label>
            <input id="trim-end" type="range" min={selected.sourceIn + 0.1} max={selectedAsset.duration}
              step={0.1} value={selected.sourceOut}
              onChange={(event) => commit({ type: "trim", clipId: selected.id, sourceIn: selected.sourceIn, sourceOut: Number(event.target.value) })} />
            <label htmlFor="timeline-position">Timeline start <strong>{selected.timelineStart.toFixed(1)}s</strong></label>
            <input id="timeline-position" type="number" min={0} step={0.5} value={selected.timelineStart}
              onChange={(event) => commit({ type: "move", clipId: selected.id, trackId: selected.trackId, timelineStart: Number(event.target.value) })} />
            <button className="secondary" onClick={split}>Split at playhead</button>
            <button className="danger" onClick={() => { commit({ type: "remove", clipId: selected.id }); setSelectedId(null); }}>Remove clip</button>
            <p className="hint">Changes are non-destructive and undoable. Dragging a trim slider creates multiple undo steps in this prototype.</p>
          </>
        ) : <p className="muted">Select a timeline clip to inspect it.</p>}
        <div className="inspector-footer"><span className="pill">Next milestone</span><p className="muted">Audio mixing, composited preview, persistent projects and export are not implemented.</p></div>
      </aside>
    </main>
  );
}
