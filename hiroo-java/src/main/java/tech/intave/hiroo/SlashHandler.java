package tech.intave.hiroo;

import com.fasterxml.jackson.databind.JsonNode;

/** Функциональный интерфейс для обработчика слэш-команды. */
@FunctionalInterface
public interface SlashHandler {
    void handle(CommandContext ctx, JsonNode args) throws Exception;
}
