# HiRoo Developer Documentation

Полная документация для написания ботов и интеграций с HiRoo.

| Раздел | Для кого |
|---|---|
| [Getting Started](./getting-started.md) | Первый бот за 5 минут |
| [Python SDK](./bot-sdk.md) | Всё про `hiroo.py`: клиент, команды, компоненты, события |
| [Intents](./intents.md) | Какие события бот получает, privileged intents |
| [Interactions](./interactions.md) | Кнопки, select-меню, slash-команды |
| [Voice](./voice.md) | Подключение к голосовым каналам, стриминг аудио |
| [Shards](./shards.md) | Горизонтальное масштабирование для больших ботов |
| [OAuth2](./oauth2.md) | Авторизация пользователей через HiRoo |
| [REST API](./rest-api.md) | Список эндпоинтов, аутентификация, rate limits |
| [Gateway Protocol](./gateway.md) | Низкоуровневый WebSocket-протокол (если пишете свою библиотеку) |

## В двух словах

HiRoo — Discord-совместимая платформа для чата, голоса и сообществ. Для интеграции есть три "уровня":

1. **Bot Accounts** — это пользователь типа *bot*, получивший токен на `/developers`. Ходит в REST API по `Authorization: Bot <token>` и в Gateway WebSocket по `/api/bot/gateway`. Может принимать события, отвечать на команды, стримить голос.
2. **OAuth2 Applications** — сторонние веб-приложения, просящие юзеров войти через HiRoo. Получают access/refresh tokens, ходят в REST API по `Authorization: Bearer <access_token>`. Scopes: `identify`, `guilds`, `email`, `dms.read`, и т. д.
3. **Webhooks** — односторонние входящие сообщения в канал без бота. См. отдельный раздел в основной документации приложения.

## Контакт и версионирование

- API базируется на `https://hiroo.intave.tech` — это production.
- Breaking changes будут помечаться мажорной версией SDK (`hiroo.py 1.x → 2.x`).
