# Intents

Intents — битфилд, который бот передаёт при IDENTIFY. Сервер фильтрует по нему Gateway-события: если intent выключен, событие до бота не доходит. Экономит трафик и сознательно ограничивает доступ к приватной информации.

## Полный список

| Флаг | Bit | Значение | Privileged |
|------|----:|---------:|:---:|
| `GUILDS` | 0 | 1 | |
| `GUILD_MEMBERS` | 1 | 2 | ⚠ |
| `GUILD_BANS` | 2 | 4 | |
| `GUILD_VOICE_STATES` | 3 | 8 | |
| `GUILD_PRESENCES` | 4 | 16 | ⚠ |
| `GUILD_MESSAGES` | 5 | 32 | |
| `GUILD_MESSAGE_REACTIONS` | 6 | 64 | |
| `GUILD_MESSAGE_TYPING` | 7 | 128 | |
| `DIRECT_MESSAGES` | 8 | 256 | |
| `DIRECT_MESSAGE_REACTIONS` | 9 | 512 | |
| `DIRECT_MESSAGE_TYPING` | 10 | 1024 | |
| `MESSAGE_CONTENT` | 15 | 32768 | ⚠ |
| `GUILD_SCHEDULED_EVENTS` | 16 | 65536 | |

## Privileged intents

Три intent'а отмечены как privileged:

- `GUILD_MEMBERS` — события о присоединении/выходе участников, их никнеймы и роли.
- `GUILD_PRESENCES` — online/idle/offline статусы участников.
- `MESSAGE_CONTENT` — содержимое сообщений, embeds, attachments. Без него бот видит только `id`, `channel_id`, `author.id` — всё, что нужно для slash-команд, но не для message-based триггеров (`!ping`).

Чтобы пользоваться privileged intent'ом, **включите его в `/developers/<app>/` → Bot → Intents**. Бэкенд строго проверяет: если бот просит в IDENTIFY privileged intent, которого нет в `application.intents`, WebSocket закрывается с кодом `4014`.

## Presets в SDK

```python
hiroo.Intents.none()       # 0
hiroo.Intents.default()    # всё без privileged
hiroo.Intents.all()        # всё, включая privileged (требуется активация в /developers)
```

## Как выбрать

| Задача | Intents |
|---|---|
| Slash-команды, кнопки, reactions | `GUILDS | GUILD_MESSAGE_REACTIONS` |
| Модерация по ключевым словам (`!ban`, цензура) | `+ GUILD_MESSAGES | MESSAGE_CONTENT` |
| Welcome-сообщения при входе | `+ GUILD_MEMBERS` |
| Voice-боты (плеер, транскрипция) | `+ GUILD_VOICE_STATES` |
| Статус-трекинг юзеров | `+ GUILD_PRESENCES` |

## Event → Intent mapping

| Событие | Требуется |
|---|---|
| `MESSAGE_CREATE` | `GUILD_MESSAGES` (или `DIRECT_MESSAGES` в DM) |
| `MESSAGE_UPDATE` | `GUILD_MESSAGES` |
| `MESSAGE_DELETE` | `GUILD_MESSAGES` |
| `REACTION_ADD` / `REMOVE` | `GUILD_MESSAGE_REACTIONS` |
| `TYPING_START` | `GUILD_MESSAGE_TYPING` |
| `PRESENCE_UPDATE` | `GUILD_PRESENCES` (privileged) |
| `GUILD_MEMBER_ADD` / `REMOVE` | `GUILD_MEMBERS` (privileged) |
| `VOICE_STATE_UPDATE` | `GUILD_VOICE_STATES` |
| `INTERACTION_CREATE` | всегда доставляется |
| `GUILD_CREATE` / `DELETE` | всегда доставляется |
| `READY` | всегда доставляется |
