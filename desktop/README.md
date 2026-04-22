# HiRoo Desktop

Electron-обёртка над веб-клиентом `hiroo.intave.tech`. Даёт:

- ✨ Splash-экран при запуске.
- 🔔 Нативные Windows / macOS / Linux toast-уведомления (работают в трее).
- 🖥 Свой красивый picker для демонстрации экрана (выбор монитора / окна приложения с превью).
- 🪟 Трей с быстрыми действиями (Показать, Заглушить, Выйти).
- ⌨️ Глобальный хоткей `Ctrl+Shift+H` для show/hide.
- 🔗 Внешние ссылки открываются в системном браузере, hiroo.intave.tech — внутри приложения.
- 🔒 Разрешения (камера/микрофон/захват экрана) пре-одобрены — никаких повторных промптов.

## Запуск в dev-режиме

```bash
cd desktop
npm install
npm run dev      # с DevTools + HIROO_DEV=1
# или:
npm start        # чисто, как в проде
```

## Сборка инсталлятора

```bash
npm run make
# Windows → out/make/squirrel.windows/x64/HiRoo-*.Setup.exe
# macOS   → out/make/*.dmg + *.zip
# Linux   → out/make/deb/x64/*.deb
```

Билды используют URL из `package.json#config.hirooUrl`. Временно переопределить:

```bash
HIROO_URL=https://staging.hiroo.intave.tech npm start
```

## Иконки

В `src/assets/` положены:

- `icon.svg` — исходник.
- Для финального билда нужно экспортировать:
  - `icon.ico`   (Windows — multi-resolution: 16, 32, 48, 64, 128, 256)
  - `icon.icns`  (macOS)
  - `icon.png`   (512×512 для Linux и окна)
  - `tray.png`   (32×32 для трея, светлый фон → тёмная иконка, тёмный → светлая)

Быстро сделать из SVG:
```bash
# Windows (ImageMagick):
magick convert src/assets/icon.svg -define icon:auto-resize=256,128,64,48,32,16 src/assets/icon.ico
# macOS:
iconutil -c icns icon.iconset -o src/assets/icon.icns
```

## Интеграция с фронтом

Веб-клиент определяет desktop-окружение через `window.hiroo` (выставляется в `preload.js`). Хук `useDesktop()` возвращает `{ available, api }`:

```ts
const { available, api } = useDesktop();
api?.notify("Заголовок", "Текст");
api?.setBadge(3);
```

Screen-share picker автоматически перехватывается компонентом `<ScreenSharePickerHost />` в `app/(app)/layout.tsx` — при `getDisplayMedia()` пользователь видит нашу UI-модалку вместо системного Chromium-диалога.

## Production URL

По умолчанию открывается `https://hiroo.intave.tech`. Изменить:

- в `package.json#config.hirooUrl`, или
- через env `HIROO_URL` при запуске.

## Ограничения

- Нужно вручную экспортировать .ico/.icns/.png из `icon.svg` до первой сборки инсталлятора.
- Auto-update пока не настроен — добавим `electron-updater` отдельной итерацией.
- `setAppUserModelId` для Windows-нотификаций требует чтобы приложение было установлено через Squirrel (dev-запуск показывает "Electron" как источник).
