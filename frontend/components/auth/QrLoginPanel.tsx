"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { qrAuthApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { connectSocket } from "@/lib/socket";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "loading" | "active" | "scanned" | "expired" | "error";

/**
 * Desktop-side QR login.
 * - Issues a code, renders QR, polls /status every 2s.
 * - When mobile approves, we get tokens + user → setAuth + redirect.
 * - Code TTL = 120s. On expiry shows "Refresh" button.
 */
export function QrLoginPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const codeRef = useRef<string | null>(null);
  const stopRef = useRef<boolean>(false);

  const startNew = useCallback(async () => {
    stopRef.current = false;
    setPhase("loading");
    try {
      const { code, expires_at, approve_url } = await qrAuthApi.start();
      codeRef.current = code;
      const expTs = Date.parse(expires_at);
      setExpiresAt(expTs);
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, approve_url, {
          width: 200, margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
      }
      setPhase("active");
    } catch (e) {
      setPhase("error");
    }
  }, []);

  // Kick off on mount
  useEffect(() => {
    startNew();
    return () => { stopRef.current = true; };
  }, [startNew]);

  // Countdown tick
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setPhase("expired");
        stopRef.current = true;
      }
    }, 500);
    return () => clearInterval(id);
  }, [phase, expiresAt]);

  // Poller
  useEffect(() => {
    if (phase !== "active") return;
    let timer: any;
    const tick = async () => {
      if (stopRef.current || !codeRef.current) return;
      try {
        const res = await qrAuthApi.status(codeRef.current);
        if (res.status === "approved" && res.access_token && res.user) {
          setPhase("scanned");
          setAuth(res.user, res.access_token);
          connectSocket();
          const next = searchParams.get("next");
          router.push(next && next.startsWith("/") ? next : "/");
          return;
        }
        if (res.status === "expired") {
          setPhase("expired");
          return;
        }
      } catch {
        /* swallow — keep polling */
      }
      timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 2000);
    return () => clearTimeout(timer);
  }, [phase, router, searchParams, setAuth]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      padding: "18px 0 4px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Или отсканируйте QR в приложении
      </div>
      <div style={{
        position: "relative", width: 200, height: 200, borderRadius: 12,
        background: "#fff", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <canvas ref={canvasRef} style={{ display: phase === "active" || phase === "scanned" ? "block" : "none" }} />
        {phase === "loading" && <div style={{ fontSize: 12, color: "#555" }}>Генерация…</div>}
        {phase === "expired" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#555" }}>Код истёк</div>
            <button
              onClick={startNew}
              style={{
                padding: "6px 14px", borderRadius: 6, background: "var(--accent)",
                color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >Обновить</button>
          </div>
        )}
        {phase === "error" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#555" }}>Ошибка</div>
            <button
              onClick={startNew}
              style={{
                padding: "6px 14px", borderRadius: 6, background: "var(--accent)",
                color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >Повторить</button>
          </div>
        )}
        {phase === "scanned" && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14, fontWeight: 600,
          }}>
            ✓ Авторизация…
          </div>
        )}
      </div>
      {phase === "active" && (
        <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono" }}>
          Истекает через {secondsLeft}с
        </div>
      )}
    </div>
  );
}
