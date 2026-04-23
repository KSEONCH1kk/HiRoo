import com.fasterxml.jackson.databind.JsonNode;
import tech.intave.hiroo.Bot;
import tech.intave.hiroo.Intents;
import tech.intave.hiroo.SlashOption;
import tech.intave.hiroo.Voice;

import java.util.List;

/**
 * Демонстрация voice-helper'ов: бот получает LiveKit-токен и регистрирует
 * присутствие, чтобы фронт показал его в списке участников канала.
 *
 * <p><b>Важно:</b> в этом примере реально аудио не публикуется. Java-SDK
 * не несёт встроенного LiveKit RTC клиента (см. класс {@link Voice}).
 * Чтобы транслировать аудио, подключите URL+токен к любому WebRTC-
 * совместимому клиенту или используйте {@code hiroo-py}/{@code hiroo-js}.
 *
 * <p>Запуск: {@code BOT_TOKEN=... APP_ID=... mvn -q exec:java -Dexec.mainClass=VoiceBot}
 */
public class VoiceBot {
    public static void main(String[] args) throws Exception {
        String token = System.getenv("BOT_TOKEN");
        if (token == null) throw new IllegalStateException("Set BOT_TOKEN in env");

        Bot bot = new Bot.Builder()
            .intents(Intents.defaults() | Intents.MESSAGE_CONTENT | Intents.GUILD_VOICE_STATES)
            .applicationId(System.getenv("APP_ID"))
            .build();

        bot.on("ready", (evt, data) ->
            System.out.println("Logged in as " + data.path("user").path("username").asText()));

        bot.slashCommand(
            "vjoin", "Зарегистрировать голосовое присутствие в первом voice-канале",
            List.of(),
            (ctx, argv) -> {
                if (ctx.guildId == null) { ctx.respond("Только в сервере.", true); return; }
                JsonNode channels = bot.http().getGuildChannels(ctx.guildId);
                JsonNode voice = null;
                for (JsonNode ch : channels) {
                    if ("voice".equals(ch.path("type").asText())) { voice = ch; break; }
                }
                if (voice == null) { ctx.respond("Нет голосовых каналов.", true); return; }

                String channelId = voice.path("id").asText();
                String room = "channel:" + channelId;
                Voice.VoiceCredentials creds = Voice.getToken(bot, room);
                Voice.registerPresence(bot, room);
                ctx.respond("Получил токен для `#" + voice.path("name").asText() + "`. "
                    + "LiveKit URL: " + creds.url + "\n"
                    + "Подключение к SFU выполните во внешнем RTC-клиенте.");
            }
        );

        bot.slashCommand(
            "vleave", "Снять голосовое присутствие",
            List.of(),
            (ctx, argv) -> {
                Voice.unregisterPresence(bot);
                ctx.respond("Presence снят.");
            }
        );

        bot.run("Bot " + token);
    }
}
