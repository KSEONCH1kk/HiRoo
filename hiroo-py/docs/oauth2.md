# OAuth2 — авторизация через HiRoo

Позволяет стороннему приложению «войти через HiRoo» и получить токен для доступа к API от имени юзера. Совместимо с RFC 6749 (Authorization Code flow).

## Сценарии

| Сценарий | Scope | Зачем |
|---|---|---|
| «Login with HiRoo» | `identify` | Минимально — id, username, avatar |
| + email | `identify email` | Видеть email |
| Дашборд серверов юзера | `identify guilds` | Список серверов |
| Админ-приложение | `identify guilds.join` | Добавить юзера на сервер |
| Invite бота | `bot applications.commands` | Специальный flow без redirect_uri |

## Authorization Code flow

### 1. Прописать redirect URIs

`/developers/<app>/` → вкладка OAuth2 → «Redirect URIs». Каждый URL, куда вы перенаправляете юзера после консента, должен быть добавлен точно (с путём, без слэша на конце, если в коде так).

### 2. Отправить юзера на consent-экран

```
https://hiroo.intave.tech/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &redirect_uri=<URL-encoded redirect>
  &scope=<space-separated scopes>
  &response_type=code
  &state=<csrf-token>
```

Юзер видит консент-экран с аватаркой приложения, списком scope'ов и кнопкой **«Разрешить»**.

### 3. Callback с кодом

После согласия HiRoo редиректит на:

```
<redirect_uri>?code=<one-time-code>&state=<your-state>
```

Код валиден 10 минут, использовать один раз.

### 4. Обменять код на токен

```http
POST /api/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<code>
&redirect_uri=<тот же URL>
&client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
```

Ответ:
```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "refresh_token": "...",
  "scope": "identify guilds"
}
```

### 5. Использовать токен

```http
GET /api/oauth2/@me
Authorization: Bearer <access_token>
```

```json
{
  "id": "uuid",
  "username": "alice",
  "display_name": "Alice",
  "avatar_url": "/uploads/avatars/...",
  "scope": "identify guilds"
}
```

### 6. Обновление токена

```http
POST /api/oauth2/token

grant_type=refresh_token
&refresh_token=<refresh>
&client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
```

Возвращает новую пару `access_token` + `refresh_token`. Старый refresh отзывается.

## Эндпоинты

| Метод | Путь | Что делает | Auth |
|---|---|---|---|
| GET | `/api/oauth2/authorize/info` | Метаданные для консент-UI | Bearer JWT (текущий юзер HiRoo) |
| POST | `/api/oauth2/authorize` | Подтверждение — минтит code | Bearer JWT |
| POST | `/api/oauth2/token` | Обмен code/refresh → tokens | client_id + client_secret |
| POST | `/api/oauth2/revoke` | Отозвать токен | client_id + client_secret |
| POST | `/api/oauth2/introspect` | Проверить валидность (RFC 7662) | client_id + client_secret |
| GET | `/api/oauth2/@me` | Профиль | Bearer access_token |
| GET | `/api/oauth2/guilds` | Серверы юзера | Bearer access_token (scope `guilds`) |

## Scopes

| Scope | Что даёт |
|---|---|
| `identify` | Базовый профиль: id, username, display_name, avatar_url |
| `email` | + email |
| `guilds` | Список серверов, в которых юзер состоит |
| `guilds.join` | Добавить юзера на сервер (через `POST /api/servers/.../join`) |
| `dms.read` | Читать личные сообщения юзера |
| `bot` | (*Особый*) Invite бота на сервер — код не возвращается, бот сразу добавляется как member |
| `applications.commands` | Параллельно с `bot` — регистрация slash-команд на сервере |

## Bot invite flow

Особенность: для scope `bot` **не нужен** `redirect_uri` и не выдаётся `code`. URL:

```
https://hiroo.intave.tech/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &scope=bot%20applications.commands
```

Юзер выбирает сервер на консент-экране (должен быть `MANAGE_SERVER`), соглашается — бот добавляется как `ServerMember`, живое WebSocket-соединение бота получает `GUILD_CREATE`.

## Безопасность

- **`client_secret` никогда не отдавайте в публичный фронтенд.** Обмен кода на токен делайте с бэкенда.
- **`state` параметр обязателен** для защиты от CSRF. Генерируйте случайный, сохраняйте в сессии, сверяйте при callback.
- **`redirect_uri` должен точно совпадать** между `/authorize`, `/token` и whitelist в настройках приложения.
- **Токены храните в базе/куках в зашифрованном виде.** HiRoo хранит только хэши — раскрыть токен из БД невозможно.
- **Token lifetime** — access 7 дней, refresh бессрочно до использования. По стандарту rotate refresh на каждом обновлении.

## Пример (Python requests)

```python
import requests

CID = "..."
SECRET = "..."
REDIRECT = "https://myapp.com/callback"

# Шаг 4: exchange
resp = requests.post("https://hiroo.intave.tech/api/oauth2/token", data={
    "grant_type": "authorization_code",
    "code": "...",
    "redirect_uri": REDIRECT,
    "client_id": CID,
    "client_secret": SECRET,
})
token = resp.json()["access_token"]

# Шаг 5: API call
me = requests.get(
    "https://hiroo.intave.tech/api/oauth2/@me",
    headers={"Authorization": f"Bearer {token}"},
).json()
```
