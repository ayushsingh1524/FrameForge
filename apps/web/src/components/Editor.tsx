"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Clip, clipLength, formatTime, splitClip } from "@/lib/timeline";

export function Editor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const assetUrls = useRef<string[]>([]);

  const selected = clips.find((clip) => clip.id === selectedId) ?? null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const urls = assetUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const importFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).filter((file) =>
      file.type.startsWith("video/")
    );
    if (!incoming.length) return;

    const newClips: Clip[] = incoming.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      assetUrls.current.push(objectUrl);
      return {
        id: crypto.randomUUID(),
        name: file.name,
        sourceId: crypto.randomUUID(),
        objectUrl,
        duration: 0,
        start: 0,
        end: 0,
      };
    });
    setClips((current) => [...current, ...newClips]);
    if (!selectedIdRef.current) setSelectedId(newClips[0].id);
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) importFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    importFiles(event.dataTransfer.files);
  };

  const updateClip = (id: string, patch: Partial<Clip>) => {
    setClips((current) =>
      current.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip))
    );
  };

  useEffect(() => {
    if (!selected || !videoRef.current) return;
    const video = videoRef.current;
    video.pause();
    setPlaying(false);
    setPlayhead(selected.start);
    if (video.readyState >= 1) video.currentTime = selected.start;
  }, [selectedId, selected?.objectUrl, selected?.start]);

  const moveClip = (index: number, direction: number) => {
    const destination = index + direction;
    if (destination < 0 || destination >= clips.length) return;
    setClips((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const doSplit = () => {
    if (!selected) return;
    const pieces = splitClip(selected, playhead);
    if (!pieces) return;
    setClips((current) =>
      current.flatMap((clip) => (clip.id === selected.id ? pieces : [clip]))
    );
    setSelectedId(pieces[1].id);
  };

  const seek = (value: number) => {
    setPlayhead(value);
    if (videoRef.current) videoRef.current.currentTime = value;
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || !selected || selected.duration === 0) return;
    if (video.paused) {
      if (video.currentTime >= selected.end - 0.05) seek(selected.start);
      try {
        await video.play();
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !selected) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    setClips((current) =>
      current.map((clip) =>
        clip.sourceId === selected.sourceId
          ? {
              ...clip,
              duration,
              end: clip.end === 0 ? duration : clip.end,
            }
          : clip
      )
    );
    video.currentTime = selected.start;
    setPlayhead(selected.start);
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !selected) return;
    if (selected.end > 0 && video.currentTime >= selected.end) {
      video.pause();
      video.currentTime = selected.end;
    }
    setPlayhead(video.currentTime);
  };

  return (
    <main className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><div><strong>FrameForge</strong><small>EDITOR / MILESTONE 01</small></div></div>
        <div className="section-label">YOUR MEDIA</div>
        <button className="primary" onClick={() => inputRef.current?.click()}>
          + Import video
        </button>
        <input ref={inputRef} type="file" accept="video/*" multiple hidden onChange={onFileChange} />
        <p className="hint">Drop videos anywhere, or select them above. Files remain in this browser session.</p>
        <div className="asset-list">
          {clips.length === 0 ? <p className="muted">No clips imported</p> : null}
          {clips.map((clip, index) => (
            <button
              key={clip.id}
              className={selectedId === clip.id ? "asset active" : "asset"}
              onClick={() => setSelectedId(clip.id)}
            >
              <span className="clip-icon">▶</span>
              <span className="asset-text"><strong>{clip.name}</strong><small>Clip {index + 1} · {formatTime(clipLength(clip))}</small></span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><strong>Untitled project</strong><span className="pill">Local editing prototype</span></div>
          <span className="muted">Cloud export & AI editor — coming in later milestones</span>
        </header>
        <div className="preview-area">
          <div className="preview-frame">
            {selected ? (
              <video
                key={selected.objectUrl + selected.id}
                ref={videoRef}
                src={selected.objectUrl}
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="empty-preview"><div className="empty-icon">▶</div><h2>Start creating</h2><p>Import your first video to preview and edit it.</p></div>
            )}
          </div>
          <div className="player-controls">
            <button disabled={!selected || !selected.duration} onClick={() => seek(selected?.start ?? 0)}>⏮</button>
            <button className="play-button" disabled={!selected || !selected.duration} onClick={togglePlayback}>
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="timecode">{formatTime(playhead)} / {formatTime(selected?.end ?? 0)}</span>
            <span className="control-note">Selected clip preview</span>
          </div>
        </div>

        <section className="timeline-panel">
          <div className="timeline-head"><strong>Sequence</strong><span>{clips.length} clips · basic sequential layout</span></div>
          <div className="timeline-scroll">
            {clips.length ? (
              <div className="timeline-track">
                {clips.map((clip, index) => (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedId(clip.id)}
                    className={clip.id === selectedId ? "timeline-clip selected" : "timeline-clip"}
                    style={{ width: Math.max(120, Math.min(360, clipLength(clip) * 12)) }}
                    title={clip.name}
                  >
                    <strong>{clip.name}</strong>
                    <small>{formatTime(clip.start)} – {formatTime(clip.end)}</small>
                    <span className="clip-actions">
                      <span onClick={(event) => { event.stopPropagation(); moveClip(index, -1); }}>←</span>
                      <span onClick={(event) => { event.stopPropagation(); moveClip(index, 1); }}>→</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="timeline-empty">Your timeline will appear here after importing a video.</div>
            )}
          </div>
          <p className="hint">Select a clip to trim or split it. Arrow buttons change clip order. Multitrack editing and export are upcoming work.</p>
        </section>
      </section>

      <aside className="inspector">
        <div className="section-label">CLIP INSPECTOR</div>
        {selected ? (
          <>
            <h3 title={selected.name}>{selected.name}</h3>
            <p className="muted">Source duration: {formatTime(selected.duration)}</p>
            <label htmlFor="trim-start">Trim start <strong>{selected.start.toFixed(1)}s</strong></label>
            <input id="trim-start" type="range" min={0} max={Math.max(0, selected.end - 0.1)}
              step={0.1} value={selected.start} disabled={!selected.duration}
              onChange={(event) => updateClip(selected.id, { start: Number(event.target.value) })} />
            <label htmlFor="trim-end">Trim end <strong>{selected.end.toFixed(1)}s</strong></label>
            <input id="trim-end" type="range" min={Math.min(selected.duration, selected.start + 0.1)}
              max={selected.duration || 1} step={0.1} value={selected.end} disabled={!selected.duration}
              onChange={(event) => updateClip(selected.id, { end: Number(event.target.value) })} />
            <label htmlFor="playhead">Playhead <strong>{playhead.toFixed(1)}s</strong></label>
            <input id="playhead" type="range" min={selected.start} max={selected.end || 1}
              step={0.1} value={Math.min(selected.end || 1, Math.max(selected.start, playhead))}
              disabled={!selected.duration} onChange={(event) => seek(Number(event.target.value))} />
            <button className="secondary" disabled={!selected.duration} onClick={doSplit}>Split at playhead</button>
            <button className="danger" onClick={() => {
              setClips((current) => current.filter((clip) => clip.id !== selected.id));
              setSelectedId(null);
            }}>Remove clip</button>
            <p className="hint">Edits are non-destructive and stay in memory. Saving and rendered exports are not available yet.</p>
          </>
        ) : (
          <p className="muted">Select an imported clip to view its trim controls.</p>
        )}
        <div className="inspector-footer"><span className="pill">AI editing</span><p className="muted">Coming after the validated timeline command layer.</p></div>
      </aside>
    </main>
  );
}
