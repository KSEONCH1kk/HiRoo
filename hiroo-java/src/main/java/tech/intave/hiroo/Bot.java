package tech.intave.hiroo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;

/**
 * Точка входа в HiRoo-бота.
 *
 * <pre>{@code
 * Bot bot = new Bot.Builder()
 *     .intents(Intents.defaults() | Intents.MESSAGE_CONTENT)
 *     .applicationId(System.getenv("APP_ID"))
 *     .build();
 *
 * bot.on("ready", (evt, data) ->
 *     System.out.println("Logged in as " + data.path("user").path("username").asText()));
 *
 * bot.slashCommand("echo", "Echoes back your text",
 *     List.of(SlashOption.string("text", "Any text", true)),
 *     (ctx, args) -> ctx.respond(args.path("text").asText()));
 *
 * bot.run("Bot " + System.getenv("BOT_TOKEN"));
 * }</pre>
 */
public class Bot {
    private final int intents;
    private final String baseUrl;
    private final String applicationId;
    private final int shardCount;
    private final HttpClient http;
    private final ObjectMapper mapper = new ObjectMapper();

    private final Map<String, List<BiConsumer<String, JsonNode>>> handlers = new HashMap<>();
    private final Map<String, SlashRegistration> commands = new LinkedHashMap<>();
    private final List<Gateway> shards = new CopyOnWriteArrayList<>();

    public Bot(Builder b) {
        this.intents = b.intents;
        this.baseUrl = b.baseUrl;
        this.applicationId = b.applicationId;
        this.shardCount = Math.max(1, b.shardCount);
        this.http = new HttpClient("", this.baseUrl);
    }

    public HttpClient http() { return http; }
    public String applicationId() { return applicationId; }

    /** Регистрирует обработчик события шлюза. Несколько обработчиков на событие допустимо. */
    public Bot on(String event, BiConsumer<String, JsonNode> handler) {
        handlers.computeIfAbsent(event, k -> new ArrayList<>()).add(handler);
        return this;
    }

    /**
     * Регистрирует слэш-команду. Авто-регистрируется на сервере при получении
     * события {@code ready}, если задан {@code applicationId}. Плюс обрабатывает
     * как интеракции (через пикер), так и текстовые вызовы {@code /name args…}.
     */
    public Bot slashCommand(String name, String description, List<SlashOption> options, SlashHandler handler) {
        return slashCommand(name, description, options, handler, null);
    }

    public Bot slashCommand(String name, String description, List<SlashOption> options,
                            SlashHandler handler, String guildId) {
        commands.put(name, new SlashRegistration(name, description,
            options == null ? Collections.emptyList() : options, handler, guildId));
        return this;
    }

    /** Блокирующий запуск: поднимает шарды и возвращает управление только после их остановки. */
    public void run(String token) throws InterruptedException {
        http.setToken(token);
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < shardCount; i++) {
            final int shardId = i;
            Gateway g = new Gateway(baseUrl, token, intents, shardId, shardCount, this::dispatch);
            shards.add(g);
            Thread t = new Thread(() -> {
                try { g.run(); }
                catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }, "hiroo-shard-" + shardId);
            threads.add(t);
            t.start();
        }
        Runtime.getRuntime().addShutdownHook(new Thread(this::shutdown, "hiroo-shutdown"));
        for (Thread t : threads) t.join();
    }

    public void shutdown() {
        // Снять голосовое присутствие на бэкенде — эндпоинт идемпотентный.
        try { Voice.unregisterPresence(this); } catch (Exception ignored) {}
        for (Gateway g : shards) { try { g.close(); } catch (Exception ignored) {} }
    }

    // ── Диспатч ──────────────────────────────────────────────────────

    private void dispatch(String event, JsonNode data) {
        // 1) Авто-регистрация команд на ready.
        if ("ready".equals(event) && applicationId != null && !commands.isEmpty()) {
            for (SlashRegistration cmd : commands.values()) {
                try {
                    List<Map<String, Object>> opts = new ArrayList<>();
                    for (SlashOption o : cmd.options) opts.add(o.toMap());
                    http.registerCommand(applicationId, "slash", cmd.name, cmd.description, opts, cmd.guildId);
                } catch (Exception e) {
                    System.err.println("[hiroo] failed to register /" + cmd.name + ": " + e.getMessage());
                }
            }
        }

        // 2) Интеракции (кнопки, слэш из пикера).
        if ("interaction_create".equals(event)) {
            String itype = data.path("type").asText("");
            if ("command".equals(itype)) {
                String name = data.path("command_name").asText("");
                SlashRegistration cmd = commands.get(name);
                if (cmd != null) {
                    JsonNode args = data.path("data").path("options");
                    if (args.isMissingNode() || args.isNull()) args = mapper.createObjectNode();
                    CommandContext ctx = CommandContext.fromInteraction(this, data, args);
                    try { cmd.handler.handle(ctx, args); }
                    catch (Exception e) { System.err.println("[hiroo] slash /" + name + " failed: " + e); }
                }
            }
        }

        // 3) Текстовый вызов /<name> …
        if ("message_create".equals(event)) {
            String content = data.path("content").asText("");
            boolean isBot = data.path("author").path("bot").asBoolean(false);
            if (!isBot && content.startsWith("/")) {
                int firstSpace = content.indexOf(' ');
                String first = firstSpace < 0 ? content.substring(1) : content.substring(1, firstSpace);
                SlashRegistration cmd = commands.get(first);
                if (cmd != null) {
                    String argText = firstSpace < 0 ? "" : content.substring(firstSpace + 1).trim();
                    ObjectNode args = buildArgsFromText(cmd, argText);
                    CommandContext ctx = CommandContext.fromMessage(this, data, args);
                    try { cmd.handler.handle(ctx, args); }
                    catch (Exception e) { System.err.println("[hiroo] text /" + first + " failed: " + e); }
                }
            }
        }

        // 4) Пользовательские подписчики.
        List<BiConsumer<String, JsonNode>> list = handlers.get(event);
        if (list != null) {
            for (BiConsumer<String, JsonNode> h : list) {
                try { h.accept(event, data); }
                catch (Exception e) { System.err.println("[hiroo] handler for " + event + " failed: " + e); }
            }
        }
    }

    /** Простой парсер argv: слова через пробел, последняя опция забирает хвост. */
    private ObjectNode buildArgsFromText(SlashRegistration cmd, String argText) {
        ObjectNode args = mapper.createObjectNode();
        if (cmd.options.isEmpty() || argText.isEmpty()) return args;
        String[] parts = argText.split("\\s+", -1);
        for (int i = 0; i < cmd.options.size(); i++) {
            SlashOption o = cmd.options.get(i);
            String raw;
            if (i >= parts.length) break;
            if (i == cmd.options.size() - 1) {
                StringBuilder sb = new StringBuilder();
                for (int j = i; j < parts.length; j++) {
                    if (sb.length() > 0) sb.append(' ');
                    sb.append(parts[j]);
                }
                raw = sb.toString();
            } else {
                raw = parts[i];
            }
            if (raw == null || raw.isEmpty()) continue;
            switch (o.type) {
                case INTEGER:
                    try { args.put(o.name, Long.parseLong(raw)); }
                    catch (NumberFormatException ignored) { args.put(o.name, raw); }
                    break;
                case BOOLEAN:
                    args.put(o.name, raw.matches("(?i)^(1|true|yes|y)$"));
                    break;
                case NUMBER:
                    try { args.put(o.name, Double.parseDouble(raw)); }
                    catch (NumberFormatException ignored) { args.put(o.name, raw); }
                    break;
                default:
                    args.put(o.name, raw);
            }
        }
        return args;
    }

    // ── Внутренняя структура ─────────────────────────────────────────

    private static final class SlashRegistration {
        final String name;
        final String description;
        final List<SlashOption> options;
        final SlashHandler handler;
        final String guildId;
        SlashRegistration(String name, String description, List<SlashOption> options,
                          SlashHandler handler, String guildId) {
            this.name = name;
            this.description = description;
            this.options = options;
            this.handler = handler;
            this.guildId = guildId;
        }
    }

    // ── Builder ──────────────────────────────────────────────────────

    public static class Builder {
        private int intents = Intents.defaults();
        private String baseUrl = "https://hiroo.intave.tech";
        private String applicationId;
        private int shardCount = 1;

        public Builder intents(int intents) { this.intents = intents; return this; }
        public Builder baseUrl(String baseUrl) { this.baseUrl = baseUrl; return this; }
        public Builder applicationId(String applicationId) { this.applicationId = applicationId; return this; }
        public Builder shardCount(int n) { this.shardCount = n; return this; }

        public Bot build() { return new Bot(this); }
    }
}
