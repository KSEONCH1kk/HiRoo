# HiRoo Mobile (Android / iOS)

Мобильное приложение HiRoo поверх нашего веб-клиента через **Capacitor**. Веб-UI рендерится в нативном WebView → весь существующий функционал (чат, voice, E2EE, screen share picker) работает без переписывания, плюс нативные фичи: push/local notifications, haptics, splash, foreground service для звонков.

## Что нужно установить (один раз)

- [Node.js 18+](https://nodejs.org)
- [Android Studio](https://developer.android.com/studio) — включить SDK Platform 34, Build Tools, Platform-Tools
- Переменные окружения: `ANDROID_HOME`, `JAVA_HOME` (Android Studio ставит OpenJDK 17 сам)
- (для iOS) macOS + Xcode

## Первая сборка

```bash
cd mobile
npm install
# `cap init` НЕ нужен — capacitor.config.ts уже в репозитории.
npx cap add android                                     # создаёт папку android/ с нативным проектом
npm run sync                                            # копирует конфиг и плагины в android/
```

После `cap add android` примените патчи:

### 1. Иконки + splash

Одна команда — и всё:

```bash
npm run icons
```

Что происходит:
1. `icons:render` — запускает offscreen Electron, грузит страницу с Instrument Serif от Google Fonts, сохраняет `resources/icon.png` (1024×1024) и `resources/splash.png` (2732×2732) — точь-в-точь лого с сайта.
2. `capacitor-assets generate` — распиливает исходники на все нужные Android mipmap размеры (hdpi/xhdpi/.../xxxhdpi) и splash densities.

Никаких скриншотов руками. Для iOS то же самое работает автоматом.

### 2. AndroidManifest

Откройте `android/app/src/main/AndroidManifest.xml` и скопируйте блоки из `android-patches/AndroidManifest.additions.xml`:
- permissions (микрофон, камера, нотификации, foreground service)
- `<service>` для foreground-микрофона
- (опционально) deep-link `https://hiroo.intave.tech`

### 3. Network security

Скопируйте `android-patches/network_security_config.xml` в:
```
android/app/src/main/res/xml/network_security_config.xml
```
И в `AndroidManifest.xml` внутри `<application>` добавьте:
```xml
android:networkSecurityConfig="@xml/network_security_config"
```

## Запуск на эмуляторе / устройстве

```bash
npm run sync                # применить любые изменения капли в android/
npm run android             # открыть в Android Studio → Run
```

В Android Studio: `Device Manager → Create Virtual Device → Pixel 7 Pro API 34 → Play`. Или подключите физический телефон (включить отладку по USB в настройках разработчика).

## Сборка APK для раздачи

**Debug APK (для тестов, без подписи):**
```bash
cd android
./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

**Release APK (для Play Store):**
1. Сгенерировать keystore (один раз):
   ```bash
   keytool -genkey -v -keystore hiroo.keystore -alias hiroo -keyalg RSA -keysize 2048 -validity 10000
   ```
2. В `android/app/build.gradle` добавить signing config (см. [официальный гайд](https://developer.android.com/studio/publish/app-signing)).
3. Собрать:
   ```bash
   ./gradlew assembleRelease
   # → android/app/build/outputs/apk/release/app-release.apk
   ```

## Архитектура

Приложение конфигурится так, что WebView сразу открывает `https://hiroo.intave.tech` (см. `capacitor.config.ts` → `server.url`). Плюсы:
- обновления UI приходят автоматически, без пересборки APK;
- код один — Next.js + React.

Что можно ещё:
- Отключить `server.url` и бандлить статический Next.js export в `www/` — получится фулл-оффлайн UI с фолбэком на кэш.

## Нативные фичи

Веб-клиент сам детектит Capacitor через `window.Capacitor` (хук `frontend/hooks/useMobile.ts`).

Что уже работает из коробки:
| Фича | Как |
|---|---|
| Mention / DM notifications | В `useSocket.ts` при приходе сообщения вне фокуса → `LocalNotifications.schedule(...)` |
| Mic / camera / screen-capture | Permissions в manifest, Capacitor автоматически запрашивает runtime |
| Splash screen | `@capacitor/splash-screen` + `resources/splash.png` |
| Status bar тёмная | `@capacitor/status-bar` config |
| Haptics | `hapticTap()` из `useMobile.ts` |

## Push-уведомления (FCM)

### Backend

1. Заведите Firebase-проект (https://console.firebase.google.com), включите Cloud Messaging.
2. Project Settings → Service Accounts → **Generate new private key** → скачайте JSON.
3. Положите его на сервер, в `.env` backend'а:
   ```
   FIREBASE_PROJECT_ID=my-hiroo-project
   FIREBASE_CREDENTIALS_PATH=/run/secrets/firebase.json
   ```
   (добавьте файл как Docker-секрет/volume mount).
4. Перезапустите backend. Установленный `google-auth` подхватится автоматически.

### Android

1. В Firebase Console → Project settings → **Add app → Android**, package `tech.intave.hiroo`.
2. Скачайте `google-services.json`, положите в `mobile/android/app/`.
3. В `android/build.gradle` (project level) добавьте в `dependencies`:
   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```
4. В `android/app/build.gradle` в конец файла:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
5. `npm run sync` → `npm run android`.

Работает из коробки — хук `useMobileIntegration` запрашивает permission, получает FCM-токен, регистрирует его на бэке через `POST /api/mobile/device-token`. Бэк шлёт FCM при DM-сообщении для оффлайн-получателя.

## Auto-update APK

Установите переменные на бэке (любое API-развёртывание их подхватит):
```
HIROO_MOBILE_VERSION=1.2.0
HIROO_MOBILE_VERSION_CODE=12
HIROO_MOBILE_APK_URL=https://hiroo.intave.tech/downloads/hiroo-1.2.0.apk
HIROO_MOBILE_NOTES=Новый screen-share picker
HIROO_MOBILE_MANDATORY=false
```

При старте приложения хук `useMobileIntegration` делает `GET /api/mobile/latest`, сравнивает с `App.getInfo().version`, и если новее — показывает диалог со ссылкой на APK. Если `mandatory=true` — блокирует UI оверлеем.

⚠ Для установки APK пользователь должен разрешить "Установку из неизвестных источников" (настройки Android).

## Background voice

Включается автоматически на Android при входе в голосовой канал. При `voice.joinRoom()` хук запускает foreground service с типом `microphone` через `@capawesome-team/capacitor-android-foreground-service`, при leave — глушит.

Permissions уже в `AndroidManifest.xml`: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`, `WAKE_LOCK`. После установки плагина (`npm install && npm run sync`) native слой сам добавит `<service>` tag.

Пока звонок активен — в системных нотификациях висит незакрываемая плашка «HiRoo — в голосовом канале». Это требование Android 10+, иначе OS убьёт микрофон через ~минуту после ухода приложения в фон.

## Отладка

- Chrome DevTools: `chrome://inspect` → видно WebView в подключённом устройстве.
- Логи нативного слоя: `adb logcat | grep Capacitor`.
- Проверить что `window.Capacitor.isNativePlatform()` в консоли WebView возвращает `true`.

## Типичные проблемы

**«getUserMedia is not a function»** — старый Android WebView. Обновить «Android System WebView» из Play Store.

**Black screen при звонке** — не включили hardware acceleration. В AndroidManifest должно быть `android:hardwareAccelerated="true"` на `<application>`.

**Микрофон отключается через 30 секунд в фоне** — нужен foreground service, см. `AndroidManifest.additions.xml` → `<service>` блок.

**CORS ошибки** — если `server.url` отличается от вашего backend origin, добавьте в `CORS_ORIGINS` на backend `capacitor://localhost` и `https://localhost`.
