package tech.intave.hiroo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.net.URI;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;

/**
 * Single-shard WebSocket connection to the HiRoo bot gateway.
 * Handles HELLO → IDENTIFY → heartbeat loop with automatic reconnect
 * and exponential backoff (capped at 60s).
 */
public class Gateway {
    private static final int OP_DISPATCH = 0;
    private static final int OP_HEARTBEAT = 1;
    private static final int OP_IDENTIFY = 2;
    private static final int OP_RECONNECT = 7;
    private static final int OP_INVALID_SESSION = 9;
    private static final int OP_HELLO = 10;

    private final String baseUrl;
    private final String token;
    private final int intents;
    private final int shardId;
    private final int shardCount;
    private final BiConsumer<String, JsonNode> onDispatch;

    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler =
        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "hiroo-gateway-heartbeat");
            t.setDaemon(true);
            return t;
        });

    private volatile WebSocket ws;
    private volatile ScheduledFuture<?> heartbeat;
    private volatile boolean closed;

    public Gateway(String baseUrl, String token, int intents,
                   int shardId, int shardCount,
                   BiConsumer<String, JsonNode> onDispatch) {
        this.baseUrl = baseUrl.replaceAll("/$", "");
        this.token = token;
        this.intents = intents;
        this.shardId = shardId;
        this.shardCount = shardCount;
        this.onDispatch = onDispatch;
    }

    /** Blocking — runs the reconnect loop until {@link #close()} is called. */
    public void run() throws InterruptedException {
        int attempts = 0;
        while (!closed) {
            try {
                runSession();
                attempts = 0;
            } catch (Exception e) {
                System.err.printf("[hiroo] gateway error (shard=%d): %s%n", shardId, e.getMessage());
            }
            if (closed) break;
            long waitMs = Math.min(60_000L, (1L << Math.min(attempts, 6)) * 1000L);
            attempts++;
            Thread.sleep(waitMs);
        }
    }

    private void runSession() throws Exception {
        CompletableFuture<Void> sessionEnd = new CompletableFuture<>();
        String wsUrl = baseUrl.replaceFirst("^http", "ws") + "/api/bot/gateway";
        java.net.http.HttpClient http = java.net.http.HttpClient.newHttpClient();
        ws = http.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .buildAsync(URI.create(wsUrl), new Listener(sessionEnd))
            .join();
        sessionEnd.get();
    }

    /** Standalone listener so `this` stays available for shared state. */
    private final class Listener implements WebSocket.Listener {
        private final StringBuilder buffer = new StringBuilder();
        private final CompletableFuture<Void> sessionEnd;

        Listener(CompletableFuture<Void> sessionEnd) { this.sessionEnd = sessionEnd; }

        @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            buffer.append(data);
            if (last) {
                String full = buffer.toString();
                buffer.setLength(0);
                try { handleFrame(webSocket, full, sessionEnd); }
                catch (Exception e) { System.err.println("[hiroo] frame error: " + e); }
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            stopHeartbeat();
            sessionEnd.complete(null);
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            stopHeartbeat();
            sessionEnd.completeExceptionally(error);
        }
    }

    private void handleFrame(WebSocket webSocket, String text, CompletableFuture<Void> sessionEnd) throws Exception {
        JsonNode node = mapper.readTree(text);
        int op = node.path("op").asInt(-1);
        if (op == OP_HELLO) {
            long interval = node.path("d").path("heartbeat_interval").asLong(41_000);
            ObjectNode identify = mapper.createObjectNode();
            identify.put("op", OP_IDENTIFY);
            ObjectNode d = identify.putObject("d");
            d.put("token", token);
            d.put("intents", intents);
            d.putArray("shard").add(shardId).add(shardCount);
            webSocket.sendText(mapper.writeValueAsString(identify), true);
            startHeartbeat(webSocket, interval);
        } else if (op == OP_DISPATCH) {
            String t = node.path("t").asText("").toLowerCase();
            JsonNode payload = node.path("d");
            try { onDispatch.accept(t, payload); }
            catch (Exception e) { System.err.println("[hiroo] dispatch error: " + e); }
        } else if (op == OP_RECONNECT) {
            webSocket.sendClose(WebSocket.NORMAL_CLOSURE, "reconnect");
        } else if (op == OP_INVALID_SESSION) {
            webSocket.sendClose(WebSocket.NORMAL_CLOSURE, "invalid session");
            sessionEnd.completeExceptionally(new RuntimeException("Session invalidated"));
        }
    }

    private void startHeartbeat(WebSocket webSocket, long intervalMs) {
        stopHeartbeat();
        heartbeat = scheduler.scheduleAtFixedRate(() -> {
            try { webSocket.sendText("{\"op\":" + OP_HEARTBEAT + "}", true); }
            catch (Exception ignored) {}
        }, intervalMs, intervalMs, TimeUnit.MILLISECONDS);
    }

    private void stopHeartbeat() {
        ScheduledFuture<?> h = heartbeat;
        if (h != null) { h.cancel(true); heartbeat = null; }
    }

    public void close() {
        closed = true;
        stopHeartbeat();
        if (ws != null) {
            try { ws.sendClose(WebSocket.NORMAL_CLOSURE, "bye"); } catch (Exception ignored) {}
        }
        scheduler.shutdownNow();
    }
}
