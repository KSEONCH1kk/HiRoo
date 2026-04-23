package tech.intave.hiroo;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Голосовые подключения. HiRoo делегирует аудио-транспорт LiveKit.
 *
 * <p>В отличие от Python/JS, в JVM-экосистеме нет готового нативного
 * LiveKit RTC клиента (SDK LiveKit Android зависит от Android-специфичного
 * WebRTC-стека). Поэтому наш Java SDK предоставляет только «половину»
 * голоса:
 *
 * <ul>
 *   <li>{@link #getToken(Bot, String)} — получает LiveKit URL и JWT-токен.</li>
 *   <li>{@link #registerPresence(Bot, String)} — сообщает HiRoo, что бот в голосе
 *       (чтобы фронт показал его в списке участников).</li>
 *   <li>{@link #unregisterPresence(Bot)} — снимает присутствие.</li>
 * </ul>
 *
 * <p>Полученные URL + токен можно передать в любой WebRTC-стек, который
 * поддерживает LiveKit-протокол: наиболее реалистичный путь — {@code
 * livekit-android} на Android, либо bridge через Node/Python процесс,
 * либо LiveKit Ingress (RTMP/WHIP). Для серверных ботов, которым важно
 * проигрывать аудио, рекомендуется {@code hiroo-py} или {@code hiroo-js}.
 *
 * <p>Типовое применение:
 * <pre>{@code
 * VoiceCredentials creds = Voice.getToken(bot, "channel:" + channelId);
 * Voice.registerPresence(bot, "channel:" + channelId);
 * // ... здесь ваш WebRTC-стек коннектится к creds.url с creds.token ...
 * // перед выходом:
 * Voice.unregisterPresence(bot);
 * }</pre>
 */
public final class Voice {
    private Voice() {}

    /** Параметры LiveKit-комнаты. */
    public static final class VoiceCredentials {
        public final String url;
        public final String token;
        public final String roomName;

        public VoiceCredentials(String url, String token, String roomName) {
            this.url = url;
            this.token = token;
            this.roomName = roomName;
        }

        @Override
        public String toString() {
            return "VoiceCredentials{url=" + url + ", room=" + roomName + "}";
        }
    }

    /**
     * Запросить LiveKit URL и токен для room-идентификатора.
     * Формат room: {@code "channel:<uuid>"} для серверного voice-канала
     * или {@code "dm:<uuid>"} для DM-звонка.
     */
    public static VoiceCredentials getToken(Bot bot, String room) {
        JsonNode data = bot.http().request("GET",
            "/api/voice/token?room=" + java.net.URLEncoder.encode(room,
                java.nio.charset.StandardCharsets.UTF_8), null);
        return new VoiceCredentials(
            data.path("url").asText(),
            data.path("token").asText(),
            room
        );
    }

    /**
     * Удобная обёртка: принимает channelId/dmId, сам собирает roomName.
     * Передайте ровно один из двух параметров.
     */
    public static VoiceCredentials getToken(Bot bot, String channelId, String dmId) {
        String room;
        if (channelId != null) room = "channel:" + channelId;
        else if (dmId != null) room = "dm:" + dmId;
        else throw new IllegalArgumentException("Provide channelId or dmId");
        return getToken(bot, room);
    }

    /** Регистрирует голосовое присутствие бота (фронт увидит его в канале). */
    public static void registerPresence(Bot bot, String room) {
        bot.http().request("POST", "/api/voice/presence",
            java.util.Map.of("room", room));
    }

    /** Снимает голосовое присутствие (идемпотентно). */
    public static void unregisterPresence(Bot bot) {
        try { bot.http().request("DELETE", "/api/voice/presence", null); }
        catch (HttpException ignored) { /* 404/410 — уже снято, норм */ }
    }
}
