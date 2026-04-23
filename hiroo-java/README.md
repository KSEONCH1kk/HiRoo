# hiroo-java

Официальный Java-клиент для HiRoo (бот-шлюз + REST API).

Использует встроенный `java.net.http` (WebSocket + HttpClient) и Jackson
для JSON. Требует Java 17+.

Поддерживает: WebSocket-шлюз с авто-переподключением, слэш-команды с
**авто-регистрацией**, интеракции, REST-хелперы (сообщения, каналы,
модерация, роли), шардинг.

---

## Содержание

1. [Установка](#установка)
2. [Первый бот за 60 секунд](#первый-бот-за-60-секунд)
3. [Intents](#intents)
4. [События](#события)
5. [Слэш-команды и авто-регистрация](#слэш-команды-и-авто-регистрация)
6. [REST API: сообщения](#rest-api-сообщения)
7. [REST API: каналы](#rest-api-каналы)
8. [REST API: участники и модерация](#rest-api-участники-и-модерация)
9. [REST API: роли](#rest-api-роли)
10. [Шардинг](#шардинг)
11. [Голосовые каналы](#голосовые-каналы)
12. [Обработка ошибок](#обработка-ошибок)
13. [Ограничения MVP](#ограничения-mvp)

---

## Установка

Maven, `pom.xml`:

```xml
<dependency>
  <groupId>tech.intave</groupId>
  <artifactId>hiroo</artifactId>
  <version>0.1.0</version>
</dependency>
```

Либо локально, без Maven Central:

```bash
# В корне hiroo-java:
mvn install        # положит jar в ваш ~/.m2/repository
```

После этого любой соседний проект с той же координатой (`tech.intave:hiroo:0.1.0`)
найдёт её в локальном репозитории.

## Первый бот за 60 секунд

```java
import com.fasterxml.jackson.databind.JsonNode;
import tech.intave.hiroo.Bot;
import tech.intave.hiroo.Intents;
import tech.intave.hiroo.SlashOption;
import java.util.List;

public class Main {
    public static void main(String[] args) throws Exception {
        Bot bot = new Bot.Builder()
            .intents(Intents.defaults() | Intents.MESSAGE_CONTENT)
            .applicationId(System.getenv("APP_ID"))   // необязательно
            .build();

        bot.on("ready", (evt, data) ->
            System.out.println("Залогинен как " + data.path("user").path("username").asText()));

        bot.on("message_create", (evt, data) -> {
            if ("!ping".equals(data.path("content").asText())) {
                bot.http().sendMessage(
                    data.path("channel_id").asText(), null,
                    "pong", null, null, data.path("id").asText()
                );
            }
        });

        bot.slashCommand(
            "echo", "Эхо",
            List.of(SlashOption.string("text", "Любой текст", true)),
            (ctx, argv) -> ctx.respond(argv.path("text").asText(""))
        );

        bot.run("Bot " + System.getenv("BOT_TOKEN"));
    }
}
```

## Intents

Комбинируются побитовым `OR`. Привилегированные интенты
(`GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`) нужно включить
в дашборде.

```java
int intents = Intents.defaults() | Intents.MESSAGE_CONTENT;
int all     = Intents.all();
int custom  = Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.GUILD_VOICE_STATES;
```

## События

`bot.on(eventName, handler)` принимает `BiConsumer<String, JsonNode>` —
первым приходит имя события, вторым — сырой JSON-payload от шлюза.

```java
bot.on("ready",              (e, d) -> { /* … */ });
bot.on("message_create",     (e, d) -> { /* … */ });
bot.on("message_update",     (e, d) -> { /* … */ });
bot.on("reaction_add",       (e, d) -> { /* … */ });
bot.on("voice_state_update", (e, d) -> { /* … */ });
bot.on("interaction_create", (e, d) -> { /* … */ });
```

Событие можно подписать несколько раз — вызовутся все обработчики в порядке
регистрации.

## Слэш-команды и авто-регистрация

```java
bot.slashCommand(
    "add", "Сложить два числа",
    List.of(
        SlashOption.integer("a", "Первое", true),
        SlashOption.integer("b", "Второе", true)
    ),
    (ctx, argv) -> ctx.respond(String.valueOf(argv.path("a").asLong() + argv.path("b").asLong()))
);
```

**Что происходит при `ready`:** если у бота задан `applicationId`, каждая
зарегистрированная слэш-команда автоматически уходит на шлюз через
`POST /api/commands/applications/{app_id}/commands`. Без `applicationId`
команда всё равно работает — пользователь может вызвать её как текст
`/add 1 2`, и парсер разберёт аргументы по порядку.

`SlashOption` — фабрики:
```java
SlashOption.string("text", "desc", true)
SlashOption.integer("n",    "desc", false)
SlashOption.bool("flag",    "desc", false)
SlashOption.number("x",     "desc", true)
```

`CommandContext` (`ctx`):
- `ctx.respond(content)` / `ctx.respond(content, ephemeral)` — для
  интеракции вызывает callback-endpoint, иначе шлёт обычное сообщение.
- `ctx.defer()` — «Бот думает…» (только для интеракций).
- `ctx.followup(content)` — ответ после `defer`.
- `ctx.channelId`, `ctx.dmId`, `ctx.guildId`, `ctx.interactionId`.
- `ctx.args` — `JsonNode` с опциями.

Команду можно ограничить одним сервером:

```java
bot.slashCommand("dev-tools", "Только для разработки",
    List.of(), handler, "GUILD_ID_UUID");
```

## REST API: сообщения

```java
// Отправка
bot.http().sendMessage(channelId, null, "Привет", null, null, null);
bot.http().sendMessage(null, dmId, "Привет в DM", null, null, replyToId);

// Редактирование / удаление
bot.http().editMessage(channelId, msgId, "новый текст");
bot.http().deleteMessage(channelId, msgId);
bot.http().editDmMessage(dmId, msgId, "new");
bot.http().deleteDmMessage(dmId, msgId);

// Реакции
bot.http().addReaction(channelId, msgId, "👍");
bot.http().removeReaction(channelId, msgId, "👍");

// Закрепление
bot.http().pinMessage(channelId, msgId);
bot.http().unpinMessage(channelId, msgId);
JsonNode pinned = bot.http().listPinned(channelId);

bot.http().pinDmMessage(dmId, msgId);
bot.http().unpinDmMessage(dmId, msgId);
bot.http().listDmPinned(dmId);
```

## REST API: каналы

```java
JsonNode channels = bot.http().getGuildChannels(guildId);

// Текстовый канал в категории «Чат»
String categoryId = null;
for (JsonNode ch : channels) {
    if ("category".equals(ch.path("type").asText())
        && "Чат".equals(ch.path("name").asText())) {
        categoryId = ch.path("id").asText();
        break;
    }
}
JsonNode ch = bot.http().createTextChannel(guildId, "general", categoryId);

// Или полный вариант
bot.http().createChannel(guildId, "войс", "voice", null, false, categoryId, 0);

// Переименовать / удалить
bot.http().updateChannel(guildId, ch.path("id").asText(),
    Map.of("name", "общий"));
bot.http().deleteChannel(guildId, ch.path("id").asText());
```

## REST API: участники и модерация

```java
bot.http().kickMember(guildId, userId);

bot.http().banMember(guildId, userId, "Спам");
bot.http().unbanMember(guildId, userId);
JsonNode bans = bot.http().listBans(guildId);

bot.http().setTimeout(guildId, userId, 3600, "Маты");
bot.http().clearTimeout(guildId, userId);

bot.http().updateMember(guildId, userId, "Новый ник", "admin");
```

## REST API: роли

```java
JsonNode roles = bot.http().listRoles(guildId);

JsonNode role = bot.http().createRole(
    guildId, "Модераторы",
    "#5b8af0", 1L << 13, true, true
);

bot.http().updateRole(guildId, role.path("id").asText(),
    Map.of("name", "Мододеры"));
bot.http().deleteRole(guildId, role.path("id").asText());

JsonNode roleIds = bot.http().getMemberRoles(guildId, userId);
List<String> ids = new ArrayList<>();
roleIds.forEach(n -> ids.add(n.asText()));
ids.add(role.path("id").asText());
bot.http().setMemberRoles(guildId, userId, ids);
```

## Шардинг

```java
Bot bot = new Bot.Builder()
    .shardCount(4)
    .build();
```

Каждый шард — отдельный `Thread` с независимым `Gateway`. Остановить все
шарды: `bot.shutdown()` (также вызывается shutdown hook'ом JVM).

## Голосовые каналы

Java-SDK даёт **half-voice**: получение LiveKit URL+токена и регистрация
присутствия на HiRoo. Полноценный RTC-клиент не входит — в JVM-экосистеме
нет первоклассного LiveKit-клиента (SDK `livekit-android` завязан на
Android-специфичный WebRTC, на сервере не работает).

### Получить токен и зарегистрировать presence

```java
import tech.intave.hiroo.Voice;

// Короткий путь (сам соберёт "channel:<id>"):
Voice.VoiceCredentials creds = Voice.getToken(bot, channelId, null);
// или для DM:
Voice.VoiceCredentials creds = Voice.getToken(bot, null, dmId);

// Зарегистрировать голосовое присутствие (фронт покажет бота в канале):
Voice.registerPresence(bot, creds.roomName);

// ... тут ваш RTC-клиент подключается к creds.url с токеном creds.token ...

// Снять присутствие — при штатной остановке Bot.shutdown() это делает сам.
Voice.unregisterPresence(bot);
```

### Как всё-таки передать звук

Три реалистичных пути:

1. **Бридж через `hiroo-py` или `hiroo-js`.** Java-процесс управляет
   логикой бота, отдельный Node/Python-процесс принимает команды «играть
   файл» и подключается к LiveKit. Передайте `creds.url + creds.token`
   в этот процесс — он ими воспользуется.

2. **LiveKit Ingress (RTMP / WHIP).** У LiveKit есть endpoint для приёма
   RTMP-стримов. Java-приложение шлёт RTMP через `jlibrtp` или `FFmpeg
   Java Bindings`, SFU раздаёт участникам.

3. **Android-клиент.** Если бот крутится в Android-рантайме (напр.,
   Termux), можно использовать `livekit-android` напрямую — передайте
   туда `creds`.

### Готовый пример

Смотрите `examples/VoiceBot.java` — `/vjoin` получает токен и
регистрирует presence, `/vleave` снимает его. Публикацию аудио код не
делает — это точка расширения для вашего проекта.

## Обработка ошибок

- `HttpException` — `RuntimeException`, бросаемый из всех REST-методов
  на 4xx/5xx. Содержит `.status()` и `.body()`.
- Ошибки WS-сессии логируются в `stderr`; `Gateway` сам переподключается
  с экспоненциальной паузой (до 60 с).
- Ошибки в обработчиках событий ловятся в `dispatch()` и пишутся в
  `stderr` — они **не** падают поток шарда.

```java
try {
    bot.http().deleteChannel(guildId, "abc");
} catch (HttpException e) {
    if (e.status() == 403) System.err.println("Нет прав.");
    else throw e;
}
```

## Ограничения MVP

- Нет билдеров для embed/components — передавайте JSON напрямую через
  `Map`/`List` в соответствующие методы `HttpClient`. Рецепт:

  ```java
  List<Map<String, Object>> embeds = List.of(Map.of(
      "title", "Hello", "description", "world", "color", 0x7c5cff
  ));
  bot.http().sendMessage(channelId, null, "", embeds, null, null);
  ```
- Нет биндинга для голосовых каналов (LiveKit). Если нужен голос — берите
  `hiroo-py`, либо вручную запросите токен у `/api/voice/token` и
  подключитесь своим LiveKit-клиентом.
- Типы опций ограничены `STRING` / `INTEGER` / `BOOLEAN` / `NUMBER`;
  user/channel/role пикеры не поддерживаются (Discord-совместимый набор
  в этом MVP урезан).

## Примеры

- `examples/EchoBot.java` — `!ping` → `pong` + слэш `/echo`.
- `examples/ChannelBot.java` — слэш-команды `/mkchannel`, `/mkvoice`,
  `/rmchannel` с поиском категории.
