"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  onSend: (file: File, durationSec: number) => void;
  disabled?: boolean;
}

type Phase = "idle" | "recording" | "locked";

const CANCEL_THRESHOLD = 120;
const LOCK_THRESHOLD = 80;
const MIN_DURATION_SEC = 0.5;

function formatDur(sec: number): string {
  const s = Math.floor(sec);
  const mm = Math.floor(s / 60).toString().padStart(1, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function VoiceRecorderButton({ onSend, disabled }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [cancelProgress, setCancelProgress] = useState(0);
  const [lockProgress, setLockProgress] = useState(0);
  const phaseRef = useRef<Phase>("idle");
  const pointerDown = useRef(false);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const startTime = useRef(0);
  const startPos = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerId = useRef<number | null>(null);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const cleanup = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    mediaRec.current = null;
    chunks.current = [];
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    pointerId.current = null;
    pointerDown.current = false;
    setElapsed(0);
    setCancelProgress(0);
    setLockProgress(0);
  };

  /** Run the async mic + recorder setup. If the user has already released
   * their finger by the time the permission prompt resolves, abort quietly
   * instead of kicking off a recording nobody asked for. */
  const startRecording = async () => {
    // Optimistic phase flip so the overlay shows up immediately — the
    // permission prompt on mobile can take a second or two and without
    // this the UI looks frozen.
    setPhaseBoth("recording");
    startTime.current = Date.now();
    setElapsed(0);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Fast tap: user already lifted before permission resolved — bail.
      if (!pointerDown.current && phaseRef.current !== "locked") {
        s.getTracks().forEach((t) => t.stop());
        cleanup();
        setPhaseBoth("idle");
        return;
      }
      stream.current = s;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      mediaRec.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.start();
      startTime.current = Date.now();
      timer.current = setInterval(() => {
        setElapsed((Date.now() - startTime.current) / 1000);
      }, 200);
    } catch {
      cleanup();
      setPhaseBoth("idle");
      alert("Нет доступа к микрофону. Разрешите его в настройках браузера.");
    }
  };

  const finishAndSend = () => {
    const rec = mediaRec.current;
    if (!rec) { cleanup(); setPhaseBoth("idle"); return; }
    const durationSec = (Date.now() - startTime.current) / 1000;
    const mime = rec.mimeType || "audio/webm";
    rec.addEventListener("stop", () => {
      const blob = new Blob(chunks.current, { type: mime });
      const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
      const file = new File([blob], `voice-message-${Date.now()}.${ext}`, { type: mime });
      cleanup();
      setPhaseBoth("idle");
      if (durationSec >= MIN_DURATION_SEC && file.size > 0) onSend(file, durationSec);
    }, { once: true });
    try { rec.stop(); } catch { cleanup(); setPhaseBoth("idle"); }
  };

  const cancel = () => {
    pointerDown.current = false;
    const rec = mediaRec.current;
    if (rec && rec.state !== "inactive") {
      rec.addEventListener("stop", () => { cleanup(); setPhaseBoth("idle"); }, { once: true });
      try { rec.stop(); } catch { cleanup(); setPhaseBoth("idle"); }
    } else {
      cleanup();
      setPhaseBoth("idle");
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || phaseRef.current !== "idle") return;
    e.preventDefault();
    pointerDown.current = true;
    pointerId.current = e.pointerId;
    startPos.current = { x: e.clientX, y: e.clientY };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    startRecording();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (phaseRef.current !== "recording") return;
    if (pointerId.current !== e.pointerId) return;
    const dx = startPos.current.x - e.clientX;
    const dy = startPos.current.y - e.clientY;
    setCancelProgress(Math.max(0, Math.min(1, dx / CANCEL_THRESHOLD)));
    setLockProgress(Math.max(0, Math.min(1, dy / LOCK_THRESHOLD)));
    if (dx >= CANCEL_THRESHOLD) {
      cancel();
    } else if (dy >= LOCK_THRESHOLD) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      pointerId.current = null;
      pointerDown.current = false;
      setLockProgress(0);
      setCancelProgress(0);
      setPhaseBoth("locked");
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    pointerDown.current = false;
    pointerId.current = null;
    // If locked, release is expected (user let go after the lock animation) —
    // keep the locked UI alive.
    if (phaseRef.current === "locked") return;
    // If we already have a recorder going, finish/cancel based on duration.
    if (mediaRec.current) {
      const dur = (Date.now() - startTime.current) / 1000;
      if (dur < MIN_DURATION_SEC) { cancel(); return; }
      finishAndSend();
      return;
    }
    // Recorder hasn't started yet (permission prompt still up). The async
    // setup will see pointerDown=false and bail on its own; nothing to do.
  };

  useEffect(() => () => cleanup(), []);

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          if (pointerId.current === e.pointerId) cancel();
        }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        title="Голосовое — зажмите для записи, свайп вверх для фиксации"
        style={{
          height: 32, width: 32, borderRadius: 8, border: "none",
          cursor: disabled ? "default" : "pointer",
          background: phase !== "idle" ? "var(--accent)" : "transparent",
          color: phase !== "idle" ? "#fff" : "var(--text-1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          touchAction: "none",
          WebkitUserSelect: "none", userSelect: "none",
          transition: "background 120ms",
          flexShrink: 0,
          zIndex: 1002, // stay above the recording overlay so finger never "loses" the button
          position: "relative",
        }}
      >
        <i className="fa-solid fa-microphone" style={{ fontSize: 16 }} />
      </button>
      {phase !== "idle" && (
        <RecordingOverlay
          phase={phase}
          elapsed={elapsed}
          cancelProgress={cancelProgress}
          lockProgress={lockProgress}
          onCancel={cancel}
          onSend={finishAndSend}
        />
      )}
    </>
  );
}

function RecordingOverlay({
  phase, elapsed, cancelProgress, lockProgress, onCancel, onSend,
}: {
  phase: "recording" | "locked";
  elapsed: number;
  cancelProgress: number;
  lockProgress: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  const isLocked = phase === "locked";
  return (
    <>
      {/* Floating lock indicator above the composer, only while holding */}
      {!isLocked && (
        <div
          style={{
            position: "fixed", right: 20, zIndex: 1001,
            bottom: 80 + lockProgress * LOCK_THRESHOLD,
            width: 40, height: 56, borderRadius: 20,
            background: "var(--bg-2)", border: "1px solid var(--line-strong)",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "flex-start", paddingTop: 8, gap: 4,
            color: lockProgress > 0.5 ? "var(--accent)" : "var(--text-2)",
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            transition: "color 120ms",
          }}
        >
          <i className="fa-solid fa-lock" style={{ fontSize: 14 }} />
          <i
            className="fa-solid fa-chevron-up"
            style={{ fontSize: 10, opacity: 0.6 + lockProgress * 0.4 }}
          />
        </div>
      )}

      {/* Overlay covering the composer bar. While holding, leaves the mic
          button's column uncovered (right: 50px) so the finger can continue
          to see and swipe from it. In locked mode, overlays everything. */}
      <div
        style={{
          position: "absolute",
          top: 0, bottom: 0, left: 0,
          right: isLocked ? 0 : 50,
          zIndex: 1000,
          background: "var(--bg-2)",
          borderRadius: 12, border: "1px solid var(--line)",
          display: "flex", alignItems: "center",
          padding: "6px 10px", gap: 10,
          pointerEvents: isLocked ? "auto" : "none",
        }}
      >
        {isLocked ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              title="Отменить"
              style={{
                width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                background: "var(--bg-3)", color: "var(--danger)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <i className="fa-solid fa-trash" style={{ fontSize: 14 }} />
            </button>
            <RecordingPill elapsed={elapsed} />
            <button
              type="button"
              onClick={onSend}
              title="Отправить"
              style={{
                width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                background: "var(--accent)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <i className="fa-solid fa-paper-plane" style={{ fontSize: 14 }} />
            </button>
          </>
        ) : (
          <>
            <RecordingPill elapsed={elapsed} />
            <div
              style={{
                flex: 1, fontSize: 13, color: "var(--text-2)",
                textAlign: "center",
                opacity: 1 - cancelProgress,
                transform: `translateX(${-cancelProgress * 40}px)`,
                transition: "opacity 60ms, transform 60ms",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <i className="fa-solid fa-chevron-left" style={{ fontSize: 10, marginRight: 6 }} />
              Свайп влево — отмена
            </div>
          </>
        )}
      </div>
    </>
  );
}

function RecordingPill({ elapsed }: { elapsed: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      <span
        style={{
          width: 10, height: 10, borderRadius: "50%",
          background: "var(--danger)",
          animation: "hirooRecPulse 1s infinite",
        }}
      />
      <span style={{ fontFamily: "Geist Mono", fontSize: 13, color: "var(--text-0)", minWidth: 44 }}>
        {formatDur(elapsed)}
      </span>
    </div>
  );
}
