# REST API

Базовый URL: `https://hiroo.intave.tech`

## Аутентификация

Три типа токенов:

| Заголовок | Когда использовать |
|---|---|
| `Authorization: Bearer <JWT>` | Пользовательские действия (web-клиент). JWT от `/api/auth/login`. |
| `Authorization: Bot <token>` | Действия от имени бота. Токен создаётся в `/developers/<app>/` → Bot. |
| `Authorization: Bearer <access_token>` | OAuth2 от имени юзера. Получен через Authorization Code flow. |

Все защищённые эндпоинты возвращают `401` при невалидном токене и `403` при отсутствии прав.

## Формат ошибок

```json
{
  "detail": "Нет права читать сообщения в этом канале"
}
```

При валидационных ошибках — FastAPI-стандарт:
```json
{
  "detail": [
    {"loc": ["body", "content"], "msg": "ensure this value has at most 4000 characters", "type": "value_error"}
  ]
}
```

## Rate limits

`slowapi` — IP-based. Ограничения:

- `/api/auth/login`, `/api/auth/register` — 5 попыток / мин на IP.
- Общие `/api/...` — 20 запросов / секунду в burst-режиме.

При превышении — `429 Too Many Requests`.

## Эндпоинты по категориям

### Auth (`/api/auth`)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/register` | Регистрация |
| POST | `/login` | Получить JWT |
| POST | `/refresh` | Обновить JWT (httpOnly cookie) |
| POST | `/logout` | Выход |

### Users (`/api/users`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/me` | Свой профиль |
| PATCH | `/me` | Обновить display_name/custom_status |
| PATCH | `/me/status` | Изменить online/idle/dnd/offline |
| POST | `/me/avatar` | Загрузить аватарку |
| POST | `/me/key` | Загрузить E2EE public key |
| GET | `/{user_id}` | Публичный профиль другого юзера |

### Servers (`/api/servers`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/` | Мои серверы |
| POST | `/` | Создать сервер |
| GET | `/{id}` | Данные сервера |
| PATCH | `/{id}` | Редактировать (требуется MANAGE_SERVER) |
| DELETE | `/{id}` | Удалить (только owner) |
| POST | `/{id}/leave` | Выйти из сервера |
| GET | `/{id}/channels` | Список каналов |
| GET | `/{id}/members` | Участники |
| POST | `/join` | Join by invite code |
| GET | `/{id}/bans` | Баны (требуется BAN_MEMBERS) |

### Channels (`/api/channels`)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | Создать канал (MANAGE_CHANNELS) |
| GET | `/{id}` | Данные канала |
| PATCH | `/{id}` | Редактировать |
| DELETE | `/{id}` | Удалить |
| GET | `/{id}/messages` | Список сообщений (с пагинацией `before=`) |
| POST | `/{id}/messages` | Отправить сообщение |
| GET | `/{id}/messages/search?q=...` | Поиск |

### Messages (`/api/channels/{ch}/messages`)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | Создать сообщение |
| PATCH | `/{id}` | Редактировать |
| DELETE | `/{id}` | Удалить (свои или с MANAGE_MESSAGES) |
| POST | `/{id}/reactions` | Добавить реакцию |
| DELETE | `/{id}/reactions/{emoji}` | Убрать реакцию |

**Body** для `POST /messages`:
```json
{
  "content": "текст",
  "reply_to_id": null,
  "embeds": [...],
  "components": [...]
}
```

Для ботов `components` и `application_id` обрабатываются автоматически — бэкенд подставит `application_id` по Bot-токену.

### DMs (`/api/dms`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/` | Мои DM |
| POST | `/` | Создать DM или group DM |
| GET | `/{id}` | Данные DM |
| GET | `/{id}/messages` | Сообщения DM |
| POST | `/{id}/messages` | Отправить в DM |
| POST | `/{id}/participants` | Добавить в group DM (owner) |
| DELETE | `/{id}/participants/{user_id}` | Исключить (owner) |

### Voice (`/api/voice`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/token?room=channel:UUID` | Получить LiveKit token |
| POST | `/presence` | Заявить о входе в voice-room |
| DELETE | `/presence` | Выйти |
| POST | `/join` | (Legacy) DB voice state |
| POST | `/leave` | (Legacy) |
| PATCH | `/state` | Обновить mute/deaf/video |

### Applications (`/api/applications`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/` | Мои приложения |
| POST | `/` | Создать |
| GET | `/{id}` | Детали |
| PATCH | `/{id}` | Редактировать |
| DELETE | `/{id}` | Удалить |
| POST | `/{id}/secret/reset` | Новый client_secret |
| POST | `/{id}/bot` | Создать бота |
| POST | `/{id}/bot/token/reset` | Ротация bot-токена |
| POST | `/{id}/icon` | Загрузить иконку |

### Commands (`/api/commands`)

| Метод | Путь | Описание | Auth |
|---|---|---|---|
| POST | `/applications/{app}/commands` | Зарегистрировать команду | Bot |
| GET | `/applications/{app}/commands` | Список команд | JWT (owner) |
| DELETE | `/applications/{app}/commands/{id}` | Удалить | Bot |
| GET | `/for-channel?guild_id=&dm_id=&q=` | Для slash-picker'а | JWT |

### Interactions — см. [отдельный раздел](./interactions.md)

### OAuth2 — см. [OAuth2](./oauth2.md)

### Bot Gateway (`/api/bot/gateway`)

WebSocket endpoint. См. [Gateway Protocol](./gateway.md).

## Proxy endpoints

Прокси для YouTube (bypass региональных блокировок):

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/proxy/yt/sign?url=...` | Подписать URL для стриминга |
| GET | `/api/proxy/yt?...` | Сам прокси-стрим |
| GET | `/api/proxy/yt/info?...` | Метаданные видео |

## Pagination

Эндпоинты возвращающие списки (`/messages`, `/members`, etc.) используют cursor-based пагинацию:

```http
GET /api/channels/UUID/messages?before=MESSAGE_UUID&limit=50
```

Ответ:
```json
{
  "items": [...],
  "has_more": true,
  "next_cursor": "uuid-для-следующей-страницы"
}
```
