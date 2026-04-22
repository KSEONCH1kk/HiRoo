"use client";
import { useEffect, useState } from "react";
import { useMobile } from "@/hooks/useMobile";
import { qrAuthApi } from "@/lib/api";

type Phase = "idle" | "scanning" | "confirm" | "approving" | "done" | "error";

/**
 * Mobile-only: scan a QR shown on a desktop login screen, then approve the
 * sign-in on this phone's behalf.
 *
 * Native side uses @capacitor-mlkit/barcode-scanning. The camera view is
 * rendered *behind* the Capacitor WebView (which must be made transparent
 * during scan). We drop a minimal full-screen overlay with a Cancel button
 * so the user can back out.
 */
export function QrScannerSettings() {
  const { available, plugins } = useMobile();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const scanner = plugins?.BarcodeScanner;

  const extractCode = (raw: string): string | null => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      const c = u.searchParams.get("code");
      if (c && c.length >= 8) return c;
    } catch { /* not a URL */ }
    // Bare code fallback
    const trimmed = raw.trim();
    if (/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) return trimmed;
    return null;
  };

  const startScan = async () => {
    if (!scanner) {
      setError("Сканер недоступен на этом устройстве");
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("scanning");
    try {
      // MLKit on Android downloads the barcode module lazily — make sure
      // it's installed before the first scan. Ignore errors on iOS.
      try { await scanner.isGoogleBarcodeScannerModuleAvailable?.() && await scanner.installGoogleBarcodeScannerModule?.(); } catch {}

      const perm = await scanner.requestPermissions?.();
      if (perm && perm.camera !== "granted") {
        setError("Нет доступа к камере");
        setPhase("error");
        return;
      }

      // Transparent webview so the camera shows through
      document.body.style.background = "transparent";
      document.documentElement.style.background = "transparent";

      const res = await scanner.scan({
        formats: ["QR_CODE"],
      });

      document.body.style.background = "";
      document.documentElement.style.background = "";

      const barcodes = res?.barcodes ?? [];
      if (!barcodes.length) {
        setPhase("idle");
        return;
      }
      const raw = barcodes[0].rawValue as string;
      const c = extractCode(raw);
      if (!c) {
        setError("QR-код не похож на HiRoo-ссылку");
        setPhase("error");
        return;
      }
      setCode(c);
      setPhase("confirm");
    } catch (e: any) {
      document.body.style.background = "";
      document.documentElement.style.background = "";
      setError(e?.message || "Сканирование прервано");
      setPhase("error");
    }
  };

  const cancelScan = async () => {
    try { await scanner?.stopScan?.(); } catch {}
    document.body.style.background = "";
    document.documentElement.style.background = "";
    setPhase("idle");
  };

  const approve = async () => {
    if (!code) return;
    setPhase("approving");
    try {
      await qrAuthApi.approve(code);
      setPhase("done");
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Не удалось подтвердить вход";
      setError(msg);
      setPhase("error");
    }
  };

  const resetFlow = () => {
    setPhase("idle");
    setCode(null);
    setError(null);
  };

  useEffect(() => {
    return () => {
      try { scanner?.stopScan?.(); } catch {}
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, [scanner]);

  if (!available) {
    return (
      <div style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.55 }}>
        Эта функция доступна только в мобильном приложении HiRoo. Откройте настройки
        на телефоне и отсканируйте QR-код с экрана входа на компьютере.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.55 }}>
        Откройте страницу входа HiRoo на компьютере и нажмите «Сканировать QR».
        Наведите камеру на код — мы авторизуем компьютер под вашим аккаунтом.
      </div>

      {phase === "idle" && (
        <button
          onClick={startScan}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: "var(--accent)", color: "#fff",
            fontSize: 14.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          <i className="fa-solid fa-qrcode" style={{ fontSize: 14 }} />
          Сканировать QR-код
        </button>
      )}

      {phase === "scanning" && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "transparent",
            display: "flex", flexDirection: "column",
            justifyContent: "space-between",
            pointerEvents: "none",
          }}
        >
          <div style={{
            padding: 20, color: "#fff", fontSize: 15, fontWeight: 600,
            background: "linear-gradient(180deg, rgba(0,0,0,0.55), transparent)",
            pointerEvents: "auto",
          }}>
            Наведите камеру на QR-код
          </div>
          <div style={{ padding: 20, display: "flex", justifyContent: "center", pointerEvents: "auto" }}>
            <button
              onClick={cancelScan}
              style={{
                padding: "12px 32px", borderRadius: 999, border: "none",
                background: "rgba(255,255,255,0.2)", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                backdropFilter: "blur(6px)",
              }}
            >
              Отменить
            </button>
          </div>
        </div>
      )}

      {phase === "confirm" && (
        <div style={{
          padding: 16, borderRadius: 12,
          background: "var(--bg-2)", border: "1px solid var(--line-strong)",
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)", marginBottom: 6 }}>
            Войти в HiRoo на компьютере?
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>
            Убедитесь, что код отображается именно на вашем устройстве.
            Не сканируйте QR по чужим просьбам — это даст полный доступ к аккаунту.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={approve}
              style={{
                padding: "10px 18px", borderRadius: 8, border: "none",
                background: "var(--accent)", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer", flex: 1,
              }}
            >Подтвердить</button>
            <button
              onClick={resetFlow}
              style={{
                padding: "10px 18px", borderRadius: 8,
                border: "1px solid var(--line-strong)",
                background: "transparent", color: "var(--text-1)",
                fontSize: 14, fontWeight: 500, cursor: "pointer",
              }}
            >Отмена</button>
          </div>
        </div>
      )}

      {phase === "approving" && (
        <div style={{ color: "var(--text-2)", fontSize: 14 }}>Отправляем подтверждение…</div>
      )}

      {phase === "done" && (
        <div style={{
          padding: 14, borderRadius: 10,
          background: "rgba(88,207,140,0.12)", border: "1px solid rgba(88,207,140,0.4)",
          color: "var(--ok, #58cf8c)", fontSize: 14, fontWeight: 500,
        }}>
          ✓ Готово. Компьютер авторизован.
          <button onClick={resetFlow} style={{
            marginLeft: 12, padding: "4px 12px", borderRadius: 6, border: "none",
            background: "transparent", color: "var(--accent)", fontSize: 13, cursor: "pointer",
            fontWeight: 600,
          }}>Сканировать ещё</button>
        </div>
      )}

      {phase === "error" && (
        <div style={{
          padding: 14, borderRadius: 10,
          background: "rgba(255,90,106,0.1)", border: "1px solid rgba(255,90,106,0.3)",
          color: "var(--danger)", fontSize: 14,
        }}>
          {error || "Ошибка"}
          <button onClick={resetFlow} style={{
            marginLeft: 12, padding: "4px 12px", borderRadius: 6, border: "none",
            background: "transparent", color: "var(--accent)", fontSize: 13, cursor: "pointer",
            fontWeight: 600,
          }}>Попробовать ещё</button>
        </div>
      )}
    </div>
  );
}
