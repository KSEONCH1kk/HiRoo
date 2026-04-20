"use client";
import { tokenStore } from "./auth";

type Handler = (data: any) => void;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

class SocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<Handler>> = new Map();
  private reconnectDelay = 1000;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

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

    const url = `${WS_URL.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._connected = true;
      this.reconnectAttempts = 0;
      this.dispatch("connect", null);
    };

    this.ws.onmessage = (ev) => {
      try {
        const { event, data } = JSON.parse(ev.data);
        this.dispatch(event, data);
      } catch {}
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
  }

  send(event: string, data: any) {
    if (!this.connected) return;
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
