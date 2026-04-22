# Shards

Шардинг — разделение нагрузки бота между несколькими параллельными WebSocket-соединениями. Каждый шард обрабатывает подмножество гильдий (серверов).

## Когда это нужно

- До ~1000 гильдий — 1 шард ок.
- Больше — добавляйте шарды из расчёта **~1 шард на 1000 гильдий**.
- Запрос к `GET /api/bot/gateway/bot` возвращает рекомендуемое число.

```python
import aiohttp, asyncio

async def main():
    async with aiohttp.ClientSession(headers={"Authorization": f"Bot {TOKEN}"}) as s:
        r = await s.get("https://hiroo.intave.tech/api/bot/gateway/bot")
        info = await r.json()
        print(info)
        # {'url': 'wss://...', 'shards': 4, 'session_start_limit': {...}}

asyncio.run(main())
```

## Формула распределения

Для каждого guild_id:

```
shard_id = int(guild_uuid.hex, 16) % shard_count
```

Бэкенд следит за этим автоматически: каждое событие `MESSAGE_CREATE`, `VOICE_STATE_UPDATE` etc. доставляется **только** тому шарду, которому принадлежит guild.

## В Python SDK

```python
bot = hiroo.Bot(
    intents=...,
    shard_count=4,
    application_id=...,
)
bot.run(TOKEN)
```

`bot.run()` поднимает 4 параллельных `GatewayClient` в одном процессе через `asyncio.gather`. Каждый будет иметь свой `shard_id` (0…N-1) и загрузит только свои гильдии в память.

## Распределение по процессам / машинам

Для совсем больших ботов запустите каждый шард отдельным процессом (разные хосты, Kubernetes Pods и т. п.):

```python
# worker-shard-0.py
bot = hiroo.Bot(shard_count=16, ...)
bot.run(TOKEN)
```

Сейчас SDK поднимает все шарды внутри одного процесса. Если нужно разделить — используйте низкоуровневый `hiroo.GatewayClient` с конкретным `shard_id` и оркеструйте сами. Пример:

```python
from hiroo.gateway import GatewayClient
import aiohttp, asyncio, os

async def run_shard(shard_id: int, shard_count: int):
    async with aiohttp.ClientSession() as session:
        client = GatewayClient(
            url=BASE_URL, token=f"Bot {TOKEN}",
            intents=hiroo.Intents.default(),
            shard_id=shard_id, shard_count=shard_count,
            on_dispatch=my_dispatch_handler,
        )
        await client.connect(session=session)

SHARD_ID = int(os.environ["SHARD_ID"])
SHARD_COUNT = int(os.environ["SHARD_COUNT"])
asyncio.run(run_shard(SHARD_ID, SHARD_COUNT))
```

## Примечания

- **Не меняйте shard_count налету** — перераспределение гильдий сломает маршрутизацию событий. Сначала остановите бота, потом перезапустите с новым числом.
- **DM-события** идут независимо от шардинга — они привязаны к боту целиком и дублируются на все шарды (но вы можете фильтровать по `bot.user.id`).
- **Interactions** доставляются на шард, которому принадлежит их guild (или на шард 0, если DM/user-scope).
