# hiroo-js

Официальный JavaScript-клиент для HiRoo (бот-шлюз + REST API).

Паритет с `hiroo-py`: WebSocket-шлюз с авто-переподключением, слэш-команды
с авто-регистрацией, интеракции, REST-хелперы (сообщения, каналы,
модерация, роли), шардинг. Требует Node.js ≥ 18 (встроенный `fetch`).

---

## Содержание

1. [Установка без публикации в npm](#установка-без-публикации-в-npm)
2. [Первый бот за 60 секунд](#первый-бот-за-60-секунд)
3. [Intents](#intents)
4. [События](#события)
5. [Слэш-команды](#слэш-команды)
6. [Компоненты (кнопки/селекты)](#компоненты-кнопкиселекты)
7. [REST API: сообщения](#rest-api-сообщения)
8. [REST API: каналы](#rest-api-каналы)
9. [REST API: участники и модерация](#rest-api-участники-и-модерация)
10. [REST API: роли](#rest-api-роли)
11. [Шардинг](#шардинг)
12. [Голосовые каналы](#голосовые-каналы)
13. [Graceful shutdown](#graceful-shutdown)
14. [Обработка ошибок](#обработка-ошибок)

---

## Установка без публикации в npm

Либку **не нужно** публиковать в npm-registry. Достаточно держать папку
`hiroo-js/` рядом с проектом или в монорепо. Есть несколько способов
подключения — выбирайте под свою задачу.

### Способ 1. Локальный путь в `package.json` (рекомендуется)

В `package.json` проекта добавьте зависимость `file:…`:

```json
{
  "dependencies": {
    "hiroo": "file:../hiroo-js"
  }
}
```

Потом:

```bash
npm install
```

npm создаст символическую ссылку `node_modules/hiroo` → `../hiroo-js`.
Правки в либке сразу видны в проекте (надо только перезапустить Node).

### Способ 2. `npm install ./path/to/hiroo-js`

Если не хотите править `package.json` руками:

```bash
npm install ./hiroo-js
# или с абсолютным путём:
npm install /home/user/HiRoo/hiroo-js
```

npm сам впишет `"hiroo": "file:./hiroo-js"` в `dependencies`.

### Способ 3. `npm link` (для активной разработки либки)

```bash
cd hiroo-js
npm link                 # регистрирует пакет глобально

cd ../my-bot
npm link hiroo           # создаёт node_modules/hiroo → глобальный линк
```

Отключить: `npm unlink hiroo` в проекте, `npm unlink -g hiroo` в либке.

### Способ 4. Git-репозиторий

Если либка в отдельном репо:

```json
{
  "dependencies": {
    "hiroo": "git+https://github.com/your-org/hiroo-js.git#main"
  }
}
```

или локальный git:

```bash
npm install git+file:///home/user/HiRoo/hiroo-js
```

### Способ 5. Tarball

Сгенерировать локальный архив (`.tgz`) и поставить его в другой проект:

```bash
cd hiroo-js
npm pack                            # создаст hiroo-0.1.0.tgz

cd ../my-bot
npm install ../hiroo-js/hiroo-0.1.0.tgz
```

Удобно, если надо передать либку коллеге без доступа к репо.

### Способ 6. Монорепо через npm workspaces

Если проект и либка лежат в одном дереве, добавьте в корневой
`package.json`:

```json
{
  "private": true,
  "workspaces": ["hiroo-js", "my-bot"]
}
```

Теперь `npm install` в корне свяжет `hiroo` из `hiroo-js` с `my-bot`
автоматически — никаких ручных путей.

### Нужна зависимость `ws`

Независимо от способа установки — `hiroo` тянет `ws` как транзитивную
зависимость, она подтянется автоматически. `fetch` встроен в Node ≥ 18.

## Первый бот за 60 секунд

```js
import { Bot, Intents, defaultIntents } from "hiroo";

const bot = new Bot({
  intents: defaultIntents() | Intents.MESSAGE_CONTENT,
  applicationId: process.env.APP_ID,    // необязательно — нужен для auto-register
});

bot.on("ready", () => console.log(`Залогинен как ${bot.user.username}`));

bot.on("message_create", async (msg) => {
  if (msg.author?.bot) return;
  if (msg.content === "!ping") await msg.reply("pong");
});

bot.slashCommand(
  { name: "echo", description: "Эхо" },
  async (ctx, { text }) => ctx.respond(text ?? ""),
  [{ name: "text", type: "string", required: true }],
);

await bot.run("Bot " + process.env.BOT_TOKEN);
```

`msg.reply(...)` и `.respond(...)` одинаково работают и для серверных каналов,
и для DM — диспатчер передаёт оба идентификатора в `msg`.

## Intents

Массивом битовых флагов. Привилегированные интенты (`GUILD_MEMBERS`,
`GUILD_PRESENCES`, `MESSAGE_CONTENT`) нужно включить в дашборде.

```js
import { Intents, defaultIntents, allIntents } from "hiroo";

// Всё без привилегий
const intents = defaultIntents();

// Всё подряд
const intents = allIntents();

// Ручная сборка
const intents = Intents.GUILDS | Intents.GUILD_MESSAGES | Intents.MESSAGE_CONTENT;
```

## События

```js
bot.on("ready", () => { /* … */ });
bot.on("message_create", async (msg) => { /* … */ });
bot.on("message_update", (data) => { /* … */ });
bot.on("reaction_add", (data) => { /* … */ });
bot.on("voice_state_update", (data) => { /* … */ });
bot.on("interaction_create", (data) => { /* … */ });
```

Короткие алиасы: `message` → `message_create`, `reaction` → `reaction_add`,
`member_join` → `guild_member_add`, `voice_state` → `voice_state_update`,
`presence` → `presence_update`.

## Слэш-команды

Сигнатура: `bot.slashCommand({ name, description, guildId? }, handler, options)`.

```js
bot.slashCommand(
  { name: "add", description: "Сложить" },
  async (ctx, { a, b }) => ctx.respond(String(a + b)),
  [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true },
  ],
);
```

Типы опций: `"string"` (по умолчанию), `"number"` (int), `"boolean"`,
`"float"`. Если указан `applicationId`, команды авто-регистрируются при
`ready`. Без `applicationId` бот всё равно будет реагировать на
`/add 1 2` в тексте сообщений.

Контекст (`CommandContext`):
- `ctx.respond(content, { embeds?, components?, ephemeral? })`
- `ctx.defer()` — статус «Бот думает…» (только для интеракций)
- `ctx.followup(content, opts)` — ответ после `defer`
- `ctx.channelId`, `ctx.dmId`, `ctx.guildId`, `ctx.interactionId`, `ctx.args`
- `ctx.author` — объект пользователя

## Компоненты (кнопки/селекты)

HiRoo использует тот же JSON-формат, что и Discord-компоненты.

```js
await msg.reply("Выбери:", {
  components: [{
    type: 1,                    // action row
    components: [
      { type: 2, style: 3, label: "OK", custom_id: "ok_btn" },
      { type: 2, style: 4, label: "Отмена", custom_id: "cancel_btn" },
    ],
  }],
});

bot.component("ok_btn", (ctx) => ctx.respond("Вы нажали OK", { ephemeral: true }));
bot.component("cancel_btn", (ctx) => ctx.respond("Отменено"));
```

## REST API: сообщения

```js
// Отправка
await bot.http.sendMessage({ channelId: "...", content: "Привет" });
await bot.http.sendMessage({ dmId: "...", content: "Привет", replyToId: "<id>" });

// Редактирование / удаление
await bot.http.editMessage(channelId, msgId, "новый текст");
await bot.http.deleteMessage(channelId, msgId);
await bot.http.editDMMessage(dmId, msgId, "new");
await bot.http.deleteDMMessage(dmId, msgId);

// Реакции
await bot.http.addReaction(channelId, msgId, "👍");
await bot.http.removeReaction(channelId, msgId, "👍");

// Закрепление
await bot.http.pinMessage(channelId, msgId);
await bot.http.unpinMessage(channelId, msgId);
const pinned = await bot.http.listPinned(channelId);

await bot.http.pinDMMessage(dmId, msgId);
await bot.http.unpinDMMessage(dmId, msgId);
await bot.http.listDMPinned(dmId);
```

## REST API: каналы

```js
const channels = await bot.http.getGuildChannels(guildId);

// Текстовый канал в категории
const cat = channels.find((c) => c.type === "category" && c.name === "Чат");
const ch = await bot.http.createChannel(guildId, "general", {
  type: "text",           // text | voice | announcement | category | forum
  parentId: cat.id,
  topic: "Общий чат",
  isPrivate: false,
});

await bot.http.updateChannel(guildId, ch.id, { name: "общий" });
await bot.http.deleteChannel(guildId, ch.id);
```

## REST API: участники и модерация

```js
await bot.http.kickMember(guildId, userId);

await bot.http.banMember(guildId, userId, "Спам");
await bot.http.unbanMember(guildId, userId);
const bans = await bot.http.listBans(guildId);

await bot.http.setTimeout(guildId, userId, 3600, "Маты");
await bot.http.clearTimeout(guildId, userId);

await bot.http.updateMember(guildId, userId, { nickname: "Новый", role: "admin" });
```

## REST API: роли

```js
const roles = await bot.http.listRoles(guildId);

const role = await bot.http.createRole(guildId, "Модераторы", {
  color: "#5b8af0",
  permissions: 1 << 13,   // MANAGE_MESSAGES
  hoist: true,
  mentionable: true,
});

await bot.http.updateRole(guildId, role.id, { name: "Мододеры" });
await bot.http.deleteRole(guildId, role.id);

const roleIds = await bot.http.getMemberRoles(guildId, userId);
await bot.http.setMemberRoles(guildId, userId, [...roleIds, role.id]);
```

## Шардинг

```js
const bot = new Bot({ intents, shardCount: 4 });
```

Бот откроет 4 WS-соединения параллельно, события распределятся по
`guild_id % shardCount`. Для <1000 серверов хватит одного шарда.

## Голосовые каналы

HiRoo делегирует аудио-транспорт LiveKit. Чтобы бот подключался к
голосовым каналам и публиковал аудио, поставьте опциональную зависимость:

```bash
npm install @livekit/rtc-node
```

(Пакет тянет ~80MB нативного бинаря, поэтому объявлен в
`optionalDependencies`. Без него SDK прекрасно работает — voice-методы
бросят `HiRooError` при первом вызове `connectVoice`.)

Для проигрывания аудио-файлов также нужен `ffmpeg` в PATH.

### Быстрый пример

```js
import { Bot, Intents, defaultIntents } from "hiroo";

const bot = new Bot({
  intents: defaultIntents() | Intents.GUILD_VOICE_STATES,
});

bot.slashCommand(
  { name: "vjoin", description: "Подключиться к voice-каналу" },
  async (ctx) => {
    const channels = await bot.http.getGuildChannels(ctx.guildId);
    const voice = channels.find((c) => c.type === "voice");
    if (!voice) return ctx.respond("Нет голосовых каналов.");
    await ctx.defer();
    const vc = await bot.connectVoice({ channelId: voice.id });
    await vc.playFile("./music.mp3");
    await ctx.followup("Играю 🎵");
  },
);

await bot.run("Bot " + process.env.BOT_TOKEN);
```

### API

```js
const vc = await bot.connectVoice({ channelId });  // или { dmId }
await vc.playFile("./sound.mp3");                  // stream через ffmpeg
await vc.setMuted(true);                           // заглушить бота
await vc.disconnect();
```

Под капотом: `GET /api/voice/token?room=channel:<id>` → `{url, token}`,
`@livekit/rtc-node` коннектится к LiveKit-SFU, регистрирует presence
на HiRoo. При остановке бота (SIGINT) все активные VoiceConnection
корректно отключаются и presence снимается.

### Troubleshooting

- **`publishTrack timed out`** — проблемы с UDP. LiveKit требует
  доступность UDP-порта (обычно 50000–50100) к SFU. Если файрвол режет,
  включите TCP-fallback LiveKit (обычно порт 7881).
- **`@livekit/rtc-node` не ставится** — требует C++ toolchain. На
  Windows: Visual Studio Build Tools. На Linux: `build-essential` и
  `python3`.

## Graceful shutdown

`bot.run(token)` возвращает промис, который резолвится после остановки
всех шардов. По `SIGINT` / `SIGTERM` библиотека закрывает WS корректно.

Если нужен ручной останов:

```js
for (const shard of bot._shards) await shard.close();
```

## Обработка ошибок

- `HTTPError` — бросается из REST-методов на 4xx/5xx; содержит `.status`
  и `.body`.
- `GatewayError` — ошибки WS-сессии; сам `GatewayClient` авто-переподключается
  с экспоненциальной паузой (до 60с).
- Для отладки ловите `unhandledRejection`:

```js
process.on("unhandledRejection", (err) => console.error("UHR:", err));
```

## Примеры

- `examples/echo_bot.js` — классика `!ping` / `/echo`.
- `examples/channel_bot.js` — создание и удаление каналов внутри категорий.
