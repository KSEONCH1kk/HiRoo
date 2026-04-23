"use client";
import { tokenStore } from "./auth";
import { Inflate } from "pako";

type Handler = (data: any) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

// Включаем zlib-stream по умолчанию — один непрерывный deflate-поток на
// соединение, разделяющий словарь между фреймами (как Discord Gateway).
// Экономия 60-80% на типичном JSON-трафике сигналинга.
const USE_COMPRESSION = true;
// Сервер шлёт один WS-кадр на одно сообщение (каждый ws.send_bytes =
// отдельный фрейм). На каждом кадре сервер делает Z_SYNC_FLUSH, а значит
// после одного push'а во inflate данные сообщения гарантированно
// становятся доступны через onData. Искать `00 00 FF FF` в буфере
// вручную не нужно — inflate сам дробит поток по сброс-блокам.

class SocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<Handler>> = new Map();
  private reconnectDelay = 1000;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  // Inflate-state: один на соединение. Пересоздаётся при каждом reconnect.
  private inflate: Inflate | null = null;
  private inflateBuf: Uint8Array[] = [];
  private inflateTextDecoder = new TextDecoder("utf-8");

  get connected() {
    return this._connected && this.ws?.readyState === WebSocket.OPEN;
  }

  get isConnected() {
    return this.connected;
  }

  connect() {
    const token = tokenStore.get();
    if (!token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const base = WS_URL.replace(/^http/, "ws");
    const qs = new URLSearchParams({ token });
    if (USE_COMPRESSION) qs.set("compress", "zlib-stream");
    const url = `${base}/ws?${qs.toString()}`;
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = "arraybuffer";
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    // Подготавливаем Inflate под новое соединение.
    if (USE_COMPRESSION) this.resetInflate();

    this.ws.onopen = () => {
      this._connected = true;
      this.reconnectAttempts = 0;
      this.dispatch("connect", null);
    };

    this.ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        // Сервер может прислать текст до регистрации соединения (например,
        // при ошибке авторизации до connect()). Парсим напрямую.
        this.parseJson(ev.data);
        return;
      }
      if (ev.data instanceof ArrayBuffer) {
        this.onBinary(new Uint8Array(ev.data));
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.dispatch("disconnect", null);
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      /* handled in onclose */
    };
  }

  // ─── Inflate pipeline ──────────────────────────────────────────────

  private resetInflate() {
    this.inflate = new Inflate({ chunkSize: 64 * 1024 });
    this.inflateBuf = [];
    this.inflate.onData = (chunk: Uint8Array) => {
      this.inflateBuf.push(chunk);
    };
    this.inflate.onEnd = () => { /* noop — мы никогда не зовём .end() */ };
  }

  private onBinary(chunk: Uint8Array) {
    if (!this.inflate) return;
    // Серверная сторона гарантирует: один WS-кадр = одно сообщение +
    // Z_SYNC_FLUSH на конце. Значит после одного push'а сообщение
    // полностью декомпрессировано в inflateBuf.
    this.inflate.push(chunk, false);
    const out = this.joinInflated();
    if (out) this.parseJson(out);
  }

  private joinInflated(): string | null {
    if (this.inflateBuf.length === 0) return null;
    let total = 0;
    for (const c of this.inflateBuf) total += c.length;
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of this.inflateBuf) { merged.set(c, off); off += c.length; }
    this.inflateBuf = [];
    return this.inflateTextDecoder.decode(merged);
  }

  private parseJson(text: string) {
    try {
      const { event, data } = JSON.parse(text);
      this.dispatch(event, data);
    } catch { /* ignore */ }
  }

  // ─── Reconnect / API ───────────────────────────────────────────────

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this.inflate = null;
    this.inflateBuf = [];
  }

  send(event: string, data: any) {
    if (!this.connected) return;
    // Исходящие — обычный текстовый JSON; сервер не ожидает от клиента
    // deflate-стрим (Discord делает так же).
    this.ws!.send(JSON.stringify({ event, data }));
  }

  emit(event: string, data: any) {
    this.send(event, data);
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler?: Handler) {
    if (!handler) { this.handlers.delete(event); return; }
    this.handlers.get(event)?.delete(handler);
  }

  private dispatch(event: string, data: any) {
    this.handlers.get(event)?.forEach((h) => { try { h(data); } catch {} });
  }
}

let socket: SocketClient | null = null;

export function getSocket(): SocketClient {
  if (!socket) socket = new SocketClient();
  return socket;
}

export function connectSocket() {
  getSocket().connect();
}

export function disconnectSocket() {
  socket?.disconnect();
}
