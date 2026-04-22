# Bot Gateway Protocol

Низкоуровневая документация WebSocket-протокола. Нужна если:

- вы пишете SDK не на Python;
- хотите понять, что делает `hiroo.py` под капотом;
- отлаживаете что-то в RAW-трафике.

## URL

```
wss://hiroo.intave.tech/api/bot/gateway
```

Никаких параметров в query — всё передаётся в payload'ах.

## Формат сообщения

Все сообщения — JSON:

```json
{
  "op": <number>,    // код операции
  "d": <object>,     // data
  "s": <number>,     // sequence (только в op=0)
  "t": "<string>"    // event type (только в op=0)
}
```

## Opcodes

| op | Название | Направление | Что |
|---:|---|---|---|
| 0 | DISPATCH | server → client | Event (см. `t` для типа) |
| 1 | HEARTBEAT | client → server | Пинг |
| 2 | IDENTIFY | client → server | Представиться, запросить сессию |
| 6 | RESUME | client → server | Продолжить прерванную сессию (пока не поддержано) |
| 7 | RECONNECT | server → client | Переподключись |
| 9 | INVALID_SESSION | server → client | Закрывайся, identify не прошёл |
| 10 | HELLO | server → client | Первое сообщение, с heartbeat_interval |
| 11 | HEARTBEAT_ACK | server → client | Подтверждение heartbeat'а |

## Жизненный цикл

```
1. Клиент: WS connect
2. Сервер:  { op: 10, d: { heartbeat_interval: 41250 } }      // HELLO
3. Клиент: { op: 2,  d: { token, intents, shard: [id, count] } }  // IDENTIFY
4. Сервер:  { op: 0,  s: 1, t: "READY", d: {...} }
5. Сервер:  { op: 0,  s: N, t: "...", d: {...} }               // события
...
6. Клиент (каждые heartbeat_interval ms):  { op: 1 }           // HEARTBEAT
   Сервер отвечает { op: 11 }                                  // ACK
```

## IDENTIFY payload

```json
{
  "op": 2,
  "d": {
    "token": "Bot xxxx.xxxx.xxxx",
    "intents": 100333,
    "shard": [0, 1]
  }
}
```

- `token` — префикс `Bot ` опционален.
- `intents` — битфилд, см. [Intents](./intents.md).
- `shard` — `[shard_id, shard_count]`. Всегда оба элемента, даже если 1 шард: `[0, 1]`.

Если privileged intent выставлен, но **не разрешён** в `application.intents`, сервер закроет WS с кодом `4014`.

## READY payload

```json
{
  "op": 0,
  "s": 1,
  "t": "READY",
  "d": {
    "v": 1,
    "user": { "id": "...", "username": "...", "bot": true, ... },
    "guilds": [ { "id": "...", "name": "...", "icon_url": null, "owner_id": "..." } ],
    "session_id": "hex32",
    "shard": [0, 1],
    "application": { "id": "...", "name": "..." }
  }
}
```

## Dispatched events

Имя в `t` — UPPER_SNAKE_CASE. Список (неполный, растёт):

- `READY` — после identify
- `GUILD_CREATE` / `GUILD_DELETE` — бот добавлен/удалён с сервера
- `MESSAGE_CREATE` / `MESSAGE_UPDATE` / `MESSAGE_DELETE`
- `REACTION_ADD` / `REACTION_REMOVE`
- `TYPING_START`
- `PRESENCE_UPDATE`
- `VOICE_STATE_UPDATE`
- `GUILD_MEMBER_ADD` / `GUILD_MEMBER_REMOVE`
- `INTERACTION_CREATE` — клик по кнопке / вызов slash-команды
- `DM_MESSAGE_CREATE`

## Close codes

| Code | Значение |
|---|---|
| 1000 | Normal close |
| 4001 | Первый опкод не IDENTIFY |
| 4004 | Невалидный bot-токен |
| 4008 | Timeout на IDENTIFY |
| 4010 | Невалидный `shard` массив |
| 4014 | Privileged intents не разрешены |

На 4004 / 4010 / 4014 клиент НЕ должен переподключаться автоматически (fatal). На прочие — переподключение с exponential backoff.

## Минимальная JS-реализация

```javascript
const ws = new WebSocket("wss://hiroo.intave.tech/api/bot/gateway");
let seq = 0;
let hbInterval = null;

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.op === 10) {
    hbInterval = setInterval(() => ws.send(JSON.stringify({op: 1})), msg.d.heartbeat_interval);
    ws.send(JSON.stringify({
      op: 2,
      d: { token: "Bot " + TOKEN, intents: 513, shard: [0, 1] }
    }));
  } else if (msg.op === 0) {
    seq = msg.s;
    console.log("event", msg.t, msg.d);
  }
};
ws.onclose = () => clearInterval(hbInterval);
```

## Discovery

Получение рекомендованного количества шардов:

```http
GET /api/bot/gateway/bot
Authorization: Bot <token>
```

Ответ:
```json
{
  "url": "wss://hiroo.intave.tech/api/bot/gateway",
  "shards": 4,
  "session_start_limit": { "total": 1000, "remaining": 1000, "reset_after": 86400000, "max_concurrency": 1 }
}
```
