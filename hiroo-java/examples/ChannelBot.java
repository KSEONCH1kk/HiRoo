import com.fasterxml.jackson.databind.JsonNode;
import tech.intave.hiroo.Bot;
import tech.intave.hiroo.HttpException;
import tech.intave.hiroo.Intents;
import tech.intave.hiroo.SlashOption;

import java.util.List;

/**
 * Бот, управляющий каналами через слэш-команды. Требует у бота права
 * MANAGE_CHANNELS на целевом сервере.
 *
 *   /mkchannel <category> <name>   — создать текстовый канал в категории
 *   /mkvoice   <category> <name>   — создать голосовой канал в категории
 *   /rmchannel <name>              — удалить канал по имени
 *
 *   BOT_TOKEN=... APP_ID=... mvn -q exec:java -Dexec.mainClass=ChannelBot
 */
public class ChannelBot {
    public static void main(String[] args) throws Exception {
        String token = System.getenv("BOT_TOKEN");
        if (token == null) throw new IllegalStateException("Set BOT_TOKEN in env");

        Bot bot = new Bot.Builder()
            .intents(Intents.defaults() | Intents.MESSAGE_CONTENT)
            .applicationId(System.getenv("APP_ID"))
            .build();

        bot.on("ready", (evt, data) ->
            System.out.println("Logged in as " + data.path("user").path("username").asText()));

        bot.slashCommand(
            "mkchannel", "Создать текстовый канал внутри категории",
            List.of(
                SlashOption.string("category", "Имя категории", true),
                SlashOption.string("name", "Имя нового канала", true)
            ),
            (ctx, argv) -> {
                if (ctx.guildId == null) { ctx.respond("Команда доступна только в сервере."); return; }
                String category = argv.path("category").asText();
                String name = argv.path("name").asText();
                JsonNode cat = findCategory(bot, ctx.guildId, category);
                if (cat == null) { ctx.respond("Категория «" + category + "» не найдена."); return; }
                try {
                    JsonNode ch = bot.http().createTextChannel(ctx.guildId, name, cat.path("id").asText());
                    ctx.respond("Канал #" + ch.path("name").asText() + " создан в «" + cat.path("name").asText() + "».");
                } catch (HttpException e) {
                    ctx.respond("Не удалось создать: " + e.getMessage());
                }
            }
        );

        bot.slashCommand(
            "mkvoice", "Создать голосовой канал внутри категории",
            List.of(
                SlashOption.string("category", "Имя категории", true),
                SlashOption.string("name", "Имя нового канала", true)
            ),
            (ctx, argv) -> {
                if (ctx.guildId == null) { ctx.respond("Команда доступна только в сервере."); return; }
                String category = argv.path("category").asText();
                String name = argv.path("name").asText();
                JsonNode cat = findCategory(bot, ctx.guildId, category);
                if (cat == null) { ctx.respond("Категория «" + category + "» не найдена."); return; }
                try {
                    JsonNode ch = bot.http().createVoiceChannel(ctx.guildId, name, cat.path("id").asText());
                    ctx.respond("Голосовой канал " + ch.path("name").asText() + " создан в «" + cat.path("name").asText() + "».");
                } catch (HttpException e) {
                    ctx.respond("Не удалось создать: " + e.getMessage());
                }
            }
        );

        bot.slashCommand(
            "rmchannel", "Удалить канал по имени",
            List.of(SlashOption.string("name", "Имя канала", true)),
            (ctx, argv) -> {
                if (ctx.guildId == null) { ctx.respond("Команда доступна только в сервере."); return; }
                String name = argv.path("name").asText();
                JsonNode ch = findChannel(bot, ctx.guildId, name);
                if (ch == null) { ctx.respond("Канал «" + name + "» не найден."); return; }
                try {
                    bot.http().deleteChannel(ctx.guildId, ch.path("id").asText());
                    ctx.respond("Канал #" + ch.path("name").asText() + " удалён.");
                } catch (HttpException e) {
                    ctx.respond("Не удалось удалить: " + e.getMessage());
                }
            }
        );

        bot.run("Bot " + token);
    }

    private static JsonNode findCategory(Bot bot, String guildId, String name) {
        JsonNode channels = bot.http().getGuildChannels(guildId);
        String wanted = name.trim().toLowerCase();
        for (JsonNode ch : channels) {
            if ("category".equals(ch.path("type").asText())
                && wanted.equals(ch.path("name").asText("").toLowerCase())) return ch;
        }
        return null;
    }

    private static JsonNode findChannel(Bot bot, String guildId, String name) {
        JsonNode channels = bot.http().getGuildChannels(guildId);
        String wanted = name.trim().toLowerCase().replaceFirst("^#", "");
        for (JsonNode ch : channels) {
            if (wanted.equals(ch.path("name").asText("").toLowerCase())) return ch;
        }
        return null;
    }
}
