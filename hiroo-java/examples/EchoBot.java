import com.fasterxml.jackson.databind.JsonNode;
import tech.intave.hiroo.Bot;
import tech.intave.hiroo.Intents;
import tech.intave.hiroo.SlashOption;

import java.util.List;

/**
 * Plain-text echo bot — реагирует на "!ping" → "pong" и регистрирует
 * слэш-команду /echo. Если указан APP_ID, команда авто-регистрируется
 * на шлюзе при событии ready.
 *
 * Запуск:
 *   mvn -q package
 *   BOT_TOKEN=... APP_ID=... mvn -q exec:java -Dexec.mainClass=EchoBot
 */
public class EchoBot {
    public static void main(String[] args) throws Exception {
        String token = System.getenv("BOT_TOKEN");
        if (token == null) throw new IllegalStateException("Set BOT_TOKEN in env");

        Bot bot = new Bot.Builder()
            .intents(Intents.defaults() | Intents.MESSAGE_CONTENT)
            .applicationId(System.getenv("APP_ID"))
            .build();

        bot.on("ready", (evt, data) ->
            System.out.println("Logged in as " + data.path("user").path("username").asText()));

        bot.on("message_create", (evt, data) -> {
            if (data.path("author").path("bot").asBoolean(false)) return;
            if (!"!ping".equals(data.path("content").asText())) return;
            String channelId = data.hasNonNull("channel_id") ? data.get("channel_id").asText() : null;
            String dmId = data.hasNonNull("dm_id") ? data.get("dm_id").asText() : null;
            bot.http().sendMessage(channelId, dmId, "pong", null, null, data.path("id").asText());
        });

        bot.slashCommand(
            "echo", "Echoes back your text",
            List.of(SlashOption.string("text", "Any text", true)),
            (ctx, argv) -> ctx.respond(argv.path("text").asText(""))
        );

        bot.run("Bot " + token);
    }
}
