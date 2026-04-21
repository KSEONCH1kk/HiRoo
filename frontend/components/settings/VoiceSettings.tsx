"use client";
import { useState, useEffect } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { useVoiceSettingsStore } from "@/store/voiceSettingsStore";
import { useCallStore } from "@/store/callStore";

export function VoiceSettings() {
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const {
    inputDeviceId, outputDeviceId, inputVolume, outputVolume,
    setInputDeviceId, setOutputDeviceId, setInputVolume, setOutputVolume,
  } = useVoiceSettingsStore();

  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);

  const loadDevices = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setMediaError("Устройства доступны только при подключении по HTTPS или localhost.");
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
    } catch {
      setMediaError("Не удалось получить список устройств.");
    }
  };

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionAsked(true);
      await loadDevices();
    } catch {
      setMediaError("Не удалось получить доступ к микрофону.");
    }
  };

  useEffect(() => { loadDevices(); }, []);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const handler = () => loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, []);

  // If a call is already active, hot-switch the device immediately
  const pickInput = async (id: string) => {
    setInputDeviceId(id);
    const ctrl = useCallStore.getState().controls as any;
    if (ctrl?.switchAudioInput) { try { await ctrl.switchAudioInput(id); } catch {} }
  };
  const pickOutput = async (id: string) => {
    setOutputDeviceId(id);
    const ctrl = useCallStore.getState().controls as any;
    if (ctrl?.switchAudioOutput) { try { await ctrl.switchAudioOutput(id); } catch {} }
  };

  const selectStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 13.5, outline: "none", cursor: "pointer",
  };
  const sliderStyle: React.CSSProperties = { width: "100%", cursor: "pointer" };

  const deviceLabelsMissing = (inputDevices.length > 0 && inputDevices.every((d) => !d.label)) ||
    (outputDevices.length > 0 && outputDevices.every((d) => !d.label));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {mediaError && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(240,160,80,0.1)", border: "1px solid rgba(240,160,80,0.3)", color: "var(--text-1)", fontSize: 13 }}>
          ⚠ {mediaError}
        </div>
      )}

      {deviceLabelsMissing && !permissionAsked && (
        <button
          onClick={requestPermission}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", cursor: "pointer", fontSize: 13, alignSelf: "flex-start" }}
        >
          Запросить доступ к микрофону, чтобы увидеть имена устройств
        </button>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Устройства ввода</div>
        <label style={{ fontSize: 12, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Микрофон</label>
        <select value={inputDeviceId} onChange={(e) => pickInput(e.target.value)} style={selectStyle}>
          <option value="default">По умолчанию</option>
          {inputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}</option>)}
        </select>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", justifyContent: "space-between" }}>
            Громкость входа <span style={{ fontFamily: "Geist Mono" }}>{Math.round(inputVolume * 100)}%</span>
          </label>
          <input
            type="range" min={0} max={200} value={Math.round(inputVolume * 100)}
            onChange={(e) => setInputVolume(+e.target.value / 100)}
            style={sliderStyle}
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Устройства вывода</div>
        <label style={{ fontSize: 12, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Динамики</label>
        <select value={outputDeviceId} onChange={(e) => pickOutput(e.target.value)} style={selectStyle}>
          <option value="default">По умолчанию</option>
          {outputDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Динамик ${d.deviceId.slice(0, 8)}`}</option>)}
        </select>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: "var(--text-2)", display: "flex", justifyContent: "space-between" }}>
            Громкость вывода <span style={{ fontFamily: "Geist Mono" }}>{Math.round(outputVolume * 100)}%</span>
          </label>
          <input
            type="range" min={0} max={200} value={Math.round(outputVolume * 100)}
            onChange={(e) => setOutputVolume(+e.target.value / 100)}
            style={sliderStyle}
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Обработка</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--bg-2)" }}>
            <div>
              <div style={{ fontSize: 14, color: "var(--text-0)", fontWeight: 500 }}>Эхоподавление</div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>Убирает эхо от динамиков</div>
            </div>
            <Toggle on={echoCancellation} onChange={setEchoCancellation} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--bg-2)" }}>
            <div>
              <div style={{ fontSize: 14, color: "var(--text-0)", fontWeight: 500 }}>Шумоподавление</div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>Фильтрует фоновые шумы</div>
            </div>
            <Toggle on={noiseSuppression} onChange={setNoiseSuppression} />
          </div>
        </div>
      </div>
    </div>
  );
}
