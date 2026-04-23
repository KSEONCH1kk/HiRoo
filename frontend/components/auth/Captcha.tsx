"use client";
import { useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/api";

/**
 * Ленивый hCaptcha-виджет.
 *
 * - Фоном тянет https://js.hcaptcha.com/1/api.js (≈6 КБ, с async/defer).
 * - Рендерит инвизибл/visible виджет в контейнер через `window.hcaptcha`.
 * - При решении кладёт токен в `onChange(token)`, при истечении — `onChange(null)`.
 * - Если backend не требует капчу (`required: false`), компонент просто
 *   не показывается и сразу зовёт `onChange("")` чтобы форма могла
 *   отправляться без токена.
 */
interface Props {
  onChange: (token: string | null) => void;
  theme?: "dark" | "light";
  size?: "normal" | "compact" | "invisible";
}

declare global {
  interface Window {
    hcaptcha?: {
      render: (el: HTMLElement, opts: any) => string;
      reset: (id: string) => void;
      execute: (id: string) => void;
    };
    _hirooHcaptchaReady?: () => void;
  }
}

const SCRIPT_SRC = "https://js.hcaptcha.com/1/api.js?render=explicit&onload=_hirooHcaptchaReady";

let scriptLoaded = false;
let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise((resolve, reject) => {
    window._hirooHcaptchaReady = () => {
      scriptLoaded = true;
      resolve();
    };
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("hcaptcha script failed"));
    document.head.appendChild(s);
  });
  return scriptLoading;
}

export function Captcha({ onChange, theme = "dark", size = "normal" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [cfg, setCfg] = useState<{ sitekey: string; required: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi.captchaConfig().then((c) => {
      if (cancelled) return;
      setCfg({ sitekey: c.sitekey, required: c.required });
      // Если капча не обязательна — сразу считаем «решённой», чтобы форма
      // не висела на ожидании токена.
      if (!c.required) onChange("");
    }).catch(() => { if (!cancelled) onChange(""); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cfg || !cfg.required || !containerRef.current) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !containerRef.current || !window.hcaptcha) return;
      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey: cfg.sitekey,
        theme, size,
        callback: (token: string) => onChange(token),
        "expired-callback": () => onChange(null),
        "error-callback": () => { setErr("Ошибка капчи"); onChange(null); },
      });
    }).catch(() => setErr("Не удалось загрузить капчу"));
    return () => { cancelled = true; };
  }, [cfg?.sitekey, cfg?.required, theme, size]);

  if (!cfg || !cfg.required) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginBottom: 16 }}>
      <div ref={containerRef} />
      {err && <p style={{ color: "var(--danger)", fontSize: 12 }}>{err}</p>}
    </div>
  );
}
