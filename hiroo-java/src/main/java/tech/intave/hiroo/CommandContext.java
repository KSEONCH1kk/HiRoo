package tech.intave.hiroo;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Контекст вызова слэш-команды. Передаётся в {@link SlashHandler}.
 *
 * <p>Если команда вызвана через интеракцию (кнопка «Применить» в пикере),
 * {@link #interactionId} не-null, и {@link #respond(String)} использует
 * endpoint {@code /interactions/{id}/callback}. Если команда пришла текстом
 * (/name args…), {@code interactionId == null}, и ответ пойдёт обычным
 * сообщением в исходный канал/DM.
 */
public final class CommandContext {
    public final Bot bot;
    public final JsonNode interaction; // nullable
    public final JsonNode message;     // nullable
    public final JsonNode args;        // map option-name → value
    public final String channelId;
    public final String dmId;
    public final String guildId;
    public final String interactionId;

    private CommandContext(Bot bot, JsonNode interaction, JsonNode message, JsonNode args,
                           String channelId, String dmId, String guildId, String interactionId) {
        this.bot = bot;
        this.interaction = interaction;
        this.message = message;
        this.args = args;
        this.channelId = channelId;
        this.dmId = dmId;
        this.guildId = guildId;
        this.interactionId = interactionId;
    }

    static CommandContext fromInteraction(Bot bot, JsonNode interaction, JsonNode args) {
        return new CommandContext(bot, interaction, null, args,
            textOrNull(interaction, "channel_id"),
            textOrNull(interaction, "dm_id"),
            textOrNull(interaction, "guild_id"),
            textOrNull(interaction, "id"));
    }

    static CommandContext fromMessage(Bot bot, JsonNode message, JsonNode args) {
        return new CommandContext(bot, null, message, args,
            textOrNull(message, "channel_id"),
            textOrNull(message, "dm_id"),
            textOrNull(message, "server_id"),
            null);
    }

    /** Короткий ответ: для интеракции — interaction callback, иначе обычное сообщение. */
    public JsonNode respond(String content) {
        return respond(content, false);
    }

    public JsonNode respond(String content, boolean ephemeral) {
        if (interactionId != null) {
            return bot.http().interactionCallback(interactionId, 4, content, ephemeral);
        }
        return bot.http().sendMessage(channelId, dmId, content, null, null, null);
    }

    /** Сообщает «печатает…», чтобы можно было отвечать > 3 секунд через {@link #followup}. */
    public void defer() {
        if (interactionId != null) {
            bot.http().interactionCallback(interactionId, 5, "", false);
        }
    }

    /** Отправка последующего сообщения после {@link #defer()}. */
    public JsonNode followup(String content) {
        if (interactionId == null) return respond(content);
        return bot.http().interactionFollowup(interactionId, content);
    }

    private static String textOrNull(JsonNode n, String key) {
        return n != null && n.hasNonNull(key) ? n.get(key).asText() : null;
    }
}
