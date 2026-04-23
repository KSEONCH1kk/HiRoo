# HiRoo

Self-hosted Discord-клон: серверы, текстовые каналы, ЛС, реакции, упоминания, роли, звонки с демонстрацией экрана через LiveKit SFU.

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Zustand, TanStack Query, Socket.IO-style wrapper |
| Backend | FastAPI (Python 3.11, async), SQLAlchemy 2.0, PostgreSQL, Redis |
| Realtime | WebSocket (сигналинг + чат) |
| Звонки | LiveKit SFU + coturn (опционально для сложного NAT) |
| Инфра | Docker Compose + nginx + Let's Encrypt |

## Требования

- Linux-сервер (Ubuntu 22.04+) или Docker Desktop на Mac/Windows
- Домен (для HTTPS — обязательно, иначе не будут работать медиа-устройства)
- Открытые порты: 80, 443, 7881/tcp, 50000-50100/udp (для LiveKit media)

## Быстрый старт (локально)

```bash
git clone <repo> hiroo
cd hiroo
docker compose up -d
```

Приложение: http://localhost:3001
API: http://localhost:8000/docs

На локалке звонки работать не будут (нет HTTPS, кроме localhost). Для полноценного теста — см. продакшн-раздел.

## Переменные окружения

Все задаются в `docker-compose.yml` / `docker-compose.prod.yml` или `.env`.

### Backend — базовое

| Переменная | Значение |
|------------|----------|
| `DATABASE_URL` | `postgresql+asyncpg://hiroo:pass@db:5432/hiroo` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `SECRET_KEY` | `openssl rand -hex 32` |
| `REFRESH_SECRET_KEY` | `openssl rand -hex 32` |
| `CORS_ORIGINS` | `'["https://yourdomain.tld"]'` |
| `LIVEKIT_URL` | `wss://yourdomain.tld/livekit/` (со слэшем!) |
| `LIVEKIT_API_KEY` | `devkey` |
| `LIVEKIT_API_SECRET` | `openssl rand -hex 32` (должен совпадать с `livekit.yaml`) |

### Backend — безопасность и защита от ботов

Эти переменные контролируют уровни, скопированные с Discord: client
fingerprint (`X-Super-Properties`), капча (`hCaptcha`) и минимальный
допустимый билд клиента. В dev всё выключено, в prod — включаем.

| Переменная | Значение |
|------------|----------|
| `HIROO_ENFORCE_SUPER_PROPS` | `1` — требовать `X-Super-Properties` на /auth/login и /auth/register. `0` — пропускать (dev). |
| `HIROO_MIN_CLIENT_BUILD` | Минимальный `build_number` клиента. Поднимать при выкатке, чтобы заставить старых обновиться. |
| `HIROO_ENFORCE_CAPTCHA` | `1` — капча обязательна. `0` — пропускаем (dev, тестовая пара hCaptcha). |
| `HCAPTCHA_SITEKEY` | Публичный sitekey с [hcaptcha.com](https://dashboard.hcaptcha.com/). |
| `HCAPTCHA_SECRET` | Приватный secret с того же дашборда. |

### Backend — десктоп-апдейтер

Электрон-клиент тянет `GET /api/desktop/latest` во время сплэша и
сравнивает semver. Если `HIROO_DESKTOP_VERSION` новее — качает asset под
свою `process.platform-process.arch` и запускает установщик.

| Переменная | Значение |
|------------|----------|
| `HIROO_DESKTOP_VERSION` | Новая версия, например `1.0.1`. |
| `HIROO_DESKTOP_NOTES` | Текст release notes (отображается на сплэше). |
| `HIROO_DESKTOP_MANDATORY` | `1` — запретить оставаться на старом билде. |
| `HIROO_DESKTOP_WIN_X64_URL` | `https://yourdomain.tld/downloads/HiRoo-1.0.1-win-x64.exe` |
| `HIROO_DESKTOP_WIN_ARM64_URL` | — аналогично, для ARM64 Windows |
| `HIROO_DESKTOP_MAC_X64_URL` | `HiRoo-1.0.1-mac-x64.dmg` |
| `HIROO_DESKTOP_MAC_ARM64_URL` | `HiRoo-1.0.1-mac-arm64.dmg` |
| `HIROO_DESKTOP_LINUX_X64_URL` | `HiRoo-1.0.1-linux-x64.deb` |

Подробности по процессу выкатки и какие файлы класть на сервер — в
[`desktop/README.md`](desktop/README.md).

### Frontend (инлайнятся в bundle при билде!)

| Переменная | Значение |
|------------|----------|
| `NEXT_PUBLIC_API_URL` | `https://yourdomain.tld` |
| `NEXT_PUBLIC_WS_URL` | `wss://yourdomain.tld` |
| `NEXT_PUBLIC_APP_VERSION` | Например `1.0.1`. Летит в `X-Super-Properties.client_version`. |
| `NEXT_PUBLIC_APP_BUILD` | Число, например `7`. Летит в `X-Super-Properties.build_number`. Backend проверит `build_number >= HIROO_MIN_CLIENT_BUILD`. |

**Важно:** переменные Next.js — compile-time. После правки: `docker compose build --no-cache frontend`.

## Продакшн с доменом (полный гайд)

### 1. DNS

A-запись `yourdomain.tld → <IP сервера>`. Проверь: `dig +short yourdomain.tld`.

### 2. Базовая подготовка сервера

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx docker.io docker-compose-plugin ufw

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:50100/udp
sudo ufw enable
```

### 3. Склонировать проект

```bash
cd /root
git clone <repo> HiRoo
cd HiRoo
```

### 4. Сгенерируй секреты

```bash
openssl rand -hex 32   # SECRET_KEY
openssl rand -hex 32   # REFRESH_SECRET_KEY
openssl rand -hex 32   # LIVEKIT_API_SECRET
```

### 5. Отредактируй `docker-compose.yml`

Секреты, `CORS_ORIGINS`, `NEXT_PUBLIC_*`, `LIVEKIT_*` — замени на свои.

### 6. Отредактируй `livekit.yaml`

`keys.devkey` должен **точно совпадать** с `LIVEKIT_API_SECRET`.

```yaml
port: 7880
bind_addresses:
  - ""
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true
keys:
  devkey: <тот же секрет что в docker-compose>
redis:
  address: redis:6379
logging:
  level: info
```

### 7. Nginx-конфиг

Создай файл `/etc/nginx/sites-available/yourdomain.tld`:

```nginx
server {
    listen 80;
    server_name yourdomain.tld;
    location / { return 200 "ok"; }
}
```

Подключи и проверь:
```bash
sudo ln -s /etc/nginx/sites-available/yourdomain.tld /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 8. Получи SSL-сертификат

```bash
sudo certbot --nginx -d yourdomain.tld
```
Certbot сам добавит 443-блок и настроит автопродление.

### 9. Финальный конфиг nginx

Открой `/etc/nginx/sites-enabled/yourdomain.tld` и замени содержимое:

```nginx
server {
    listen 80;
    server_name yourdomain.tld;
    if ($host = yourdomain.tld) { return 301 https://$host$request_uri; }
    return 404;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.tld;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.tld/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.tld/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 30m;

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    location /livekit/ {
        proxy_pass http://127.0.0.1:7880/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

`sudo nginx -t && sudo systemctl reload nginx`

### 10. Запуск

```bash
docker compose build --no-cache
docker compose up -d
```

Открой `https://yourdomain.tld`.

## Обновление после изменений

```bash
git pull
docker compose build --no-cache backend    # если менял backend/
docker compose build --no-cache frontend   # если менял frontend/ или env переменные
docker compose up -d
```

Только бэк рестартануть без сборки: `docker compose restart backend`.

## Выкатка обновления десктоп-клиента

1. Поднять `"version"` в `desktop/package.json`.
2. На каждой ОС: `cd desktop && npm run make` — получите инсталлеры в `out/make/...`.
3. Залить артефакты на сервер по путям, указанным в env:
   ```bash
   scp out/make/squirrel.windows/x64/HiRoo-1.0.1\ Setup.exe \
       root@yourdomain.tld:/var/www/hiroo-downloads/HiRoo-1.0.1-win-x64.exe
   ```
   (Nginx уже настроен раздавать `/downloads/` с `Cache-Control: immutable`.)
4. Обновить env backend (`HIROO_DESKTOP_VERSION`, `HIROO_DESKTOP_*_URL`).
5. `docker compose up -d --force-recreate backend`.
6. Проверить: `curl https://yourdomain.tld/api/desktop/latest`.

Клиенты сами подхватят при следующем запуске и обновятся прямо на
сплэш-экране.

## Синхронизация настроек пользователя

Тема (`dark`/`light`), акцентный цвет, привязки глобальных хоткеев и
флаг `science_enabled` хранятся в `users` на бэке и едут между
устройствами. Миграции `ALTER TABLE users ADD COLUMN IF NOT EXISTS ...`
включены в startup-список в `backend/app/main.py` — дополнительных шагов
при апдейте не нужно.

## Science (клиентская телеметрия)

Батчинг событий в `/api/science` по модели Discord Science. Клиентский
SDK — `frontend/lib/science.ts`; эндпоинт — `backend/app/routers/science.py`.
Пользователь может выключить через Settings → Конфиденциальность → «Делиться
анонимной статистикой». События никогда не содержат текстов сообщений,
никнеймов или поисковых запросов.

Таблица `telemetry_events` заводится автоматически при первом запуске
backend'а.

## CSP и hCaptcha

CSP задаётся в `frontend/next.config.mjs`. Уже разрешены:
- hCaptcha: `https://hcaptcha.com https://*.hcaptcha.com` в `script-src`,
  `frame-src`, `style-src`, `connect-src`.
- LiveKit: `*.livekit.cloud` / `wss://*.livekit.cloud` в `connect-src`.
- YouTube: `youtube-nocookie.com` / `youtube.com` в `frame-src`.

Если добавляете новый внешний сервис — обновите CSP в `next.config.mjs`
и пересоберите фронт.

## Структура проекта

```
HiRoo/
├── backend/
│   ├── app/
│   │   ├── core/          # config, security, deps, permissions
│   │   ├── models/        # SQLAlchemy
│   │   ├── schemas/       # Pydantic
│   │   ├── routers/       # auth, servers, channels, messages, dms, friends,
│   │   │                  # inbox, voice, uploads, roles, ws
│   │   ├── services/      # websocket manager, notifications
│   │   └── middleware/    # security headers, logging
│   └── Dockerfile
├── frontend/
│   ├── app/(app)/         # авторизованные страницы
│   ├── app/(auth)/        # login, register
│   ├── app/invite/[code]/ # приглашения
│   ├── components/        # UI
│   ├── hooks/             # useSocket, useVoice, useServerRoles, ...
│   ├── store/             # zustand stores
│   └── lib/               # api client, utils
├── docker-compose.yml
├── livekit.yaml
└── README.md
```

## Возможности

- Регистрация, JWT + refresh токены, автопродление
- Серверы: создание, публичный discover, приглашения, иконки
- Каналы: текстовые, голосовые, настройки прав
- Роли: цвета, 16 прав в 4 группах, hoist-группировка участников
- Сообщения: ответы, редактирование (↑ в пустом поле), удаление, реакции (quick + emoji picker), @упоминания, вложения (до 25 МБ, изображения/видео/аудио/pdf)
- ЛС: 1:1, уведомления о непрочитанных в рейле серверов (аватар собеседника)
- Голос: LiveKit SFU — 1:1 и групповые, микрофон, камера, демонстрация экрана, fullscreen по двойному клику, floating-player при навигации, авто-свёртка
- Presence: онлайн/офлайн/не активен/не беспокоить
- Друзья: заявки, блокировка, DM в один клик
- Инвайты: `/invite/{code}` с авто-редиректом после логина
- Полные настройки сервера (обзор/роли/каналы/участники/приглашения)
- Глобальные хоткеи в десктоп-клиенте (Electron + `uiohook-napi` для настоящего PTT)
- Синхронизация темы / акцентного цвета / хоткеев между устройствами
- Авто-обновление десктопа: проверка во время сплэша, silent-install на Windows
- Защита от скриптовых ботов: hCaptcha, X-Super-Properties fingerprint, разделение user/bot токенов
- Клиентская телеметрия «Science» с opt-out в настройках

## Troubleshooting

**Mixed content в браузере**
Пересобери фронт без кеша: `docker compose build --no-cache frontend`.

**502 Bad Gateway**
Бэк упал: `docker compose logs backend`. Обычно причина в новом коде или конфиге.

**WebSocket не коннектится (ws/wss)**
Проверь `NEXT_PUBLIC_WS_URL=wss://...` (**wss**, не ws) и что nginx пробрасывает `/ws` с Upgrade-хедерами.

**`no "ssl_certificate"` при starte nginx**
Сертификата ещё нет. Удали 443-блок, получи certbot, потом восстанови.

**LiveKit: «no permissions to access the room»**
Секрет в `docker-compose.yml` (`LIVEKIT_API_SECRET`) **не совпадает** с `livekit.yaml` (`keys.devkey`).

**FastAPI-редиректы уходят на http://**
Забыл `--proxy-headers` в Dockerfile бэка — уже добавлен. Проверь что nginx шлёт `proxy_set_header X-Forwarded-Proto https`.

**Звонок не слышно/не видно**
HTTPS обязателен. Для сложного NAT — подними coturn и добавь TURN в `ICE_SERVERS` в `frontend/hooks/useVoice.ts`.

**Аватары не показываются**
В nginx проверь `location /uploads` проксирует на `:8000`.

**Статус «онлайн» видят только сам себя**
Бэк должен коммитить изменение статуса немедленно — это уже фикс есть. Проверь что рестартанул после обновления кода.

**`npm ci` падает**
`package-lock.json` устарел. Локально: `cd frontend && npm install`. Или в docker: `docker run --rm -v "$(pwd)/frontend":/app -w /app node:20-alpine npm install`.

## Лицензия

MIT.
