import WebSocket from "ws";
import { GatewayError } from "./errors.js";

export const OP_DISPATCH = 0;
export const OP_HEARTBEAT = 1;
export const OP_IDENTIFY = 2;
export const OP_RESUME = 6;
export const OP_RECONNECT = 7;
export const OP_INVALID_SESSION = 9;
export const OP_HELLO = 10;
export const OP_HEARTBEAT_ACK = 11;

/**
 * Single-shard WebSocket connection to the HiRoo bot gateway.
 * Handles HELLO → IDENTIFY → heartbeat loop with automatic reconnect + backoff.
 */
export class GatewayClient {
  constructor({ url, token, intents, shardId, shardCount, onDispatch }) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.intents = Number(intents);
    this.shardId = shardId;
    this.shardCount = shardCount;
    this.onDispatch = onDispatch;
    this._ws = null;
    this._heartbeatTimer = null;
    this._heartbeatIntervalMs = 41_000;
    this._closed = false;
  }

  async connect() {
    let attempts = 0;
    while (!this._closed) {
      try {
        await this._runSession();
        attempts = 0;
      } catch (e) {
        console.warn(`[hiroo] gateway error (shard=${this.shardId}):`, e?.message ?? e);
      }
      if (this._closed) break;
      const waitMs = Math.min(60_000, 2 ** Math.min(attempts, 6) * 1000);
      attempts += 1;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  _runSession() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url + "/api/bot/gateway", { maxPayload: 16 * 1024 * 1024 });
      this._ws = ws;
      let gotHello = false;

      ws.on("message", (raw) => {
        let data;
        try { data = JSON.parse(raw.toString()); }
        catch { return; }
        const op = data.op;
        if (op === OP_HELLO) {
          gotHello = true;
          this._heartbeatIntervalMs = data.d?.heartbeat_interval ?? 41_000;
          ws.send(JSON.stringify({
            op: OP_IDENTIFY,
            d: {
              token: this.token,
              intents: this.intents,
              shard: [this.shardId, this.shardCount],
            },
          }));
          this._startHeartbeat(ws);
        } else if (op === OP_DISPATCH) {
          const t = (data.t ?? "").toLowerCase();
          try { this.onDispatch(t, data.d ?? {}); }
          catch (err) { console.error("[hiroo] onDispatch error:", err); }
        } else if (op === OP_RECONNECT) {
          ws.close();
        } else if (op === OP_INVALID_SESSION) {
          ws.close();
          reject(new GatewayError("Session invalidated by server"));
        }
      });

      ws.on("close", () => {
        this._stopHeartbeat();
        this._ws = null;
        resolve();
      });

      ws.on("error", (err) => {
        this._stopHeartbeat();
        this._ws = null;
        reject(err);
      });

      // If HELLO never arrives, bail out after 30s so the reconnect loop kicks in.
      setTimeout(() => {
        if (!gotHello && ws.readyState === WebSocket.OPEN) {
          ws.close();
          reject(new GatewayError("Gateway HELLO timeout"));
        }
      }, 30_000);
    });
  }

  _startHeartbeat(ws) {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: OP_HEARTBEAT }));
      }
    }, this._heartbeatIntervalMs);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  async close() {
    this._closed = true;
    this._stopHeartbeat();
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.close();
    }
  }
}
