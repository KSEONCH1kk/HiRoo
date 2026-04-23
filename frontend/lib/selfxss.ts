/**
 * Self-XSS warning в DevTools — аналог Discord'овского «Stop!».
 *
 * Пользователю, открывшему Console, социальный инженер может прислать
 * «вставь этот код, получишь премиум» — и это реально работает: код
 * выполняется с правами сессии и может украсть токен. Предупреждение
 * показывается один раз за сессию, большими красными буквами, на языке
 * пользователя (ru/en).
 */
let shown = false;

export function printSelfXssWarning() {
  if (shown || typeof console === "undefined") return;
  shown = true;

  const ruLang = typeof navigator !== "undefined" &&
    (navigator.language || "").toLowerCase().startsWith("ru");

  const title = ruLang ? "Стоп!" : "Stop!";
  const body = ruLang
    ? "Это функция браузера, предназначенная для разработчиков. Если кто-то попросил вас скопировать и вставить сюда код — это мошенничество. Ваш аккаунт будет скомпрометирован."
    : "This is a browser feature intended for developers. If someone asked you to paste code here, it's a scam and you will lose access to your account.";
  const link = ruLang
    ? "Подробнее: https://ru.wikipedia.org/wiki/Self-XSS"
    : "Learn more: https://en.wikipedia.org/wiki/Self-XSS";

  try {
    console.log(
      "%c" + title,
      "color:#ff4f4f;font-size:56px;font-weight:900;text-shadow:2px 2px 0 rgba(0,0,0,.3)",
    );
    console.log(
      "%c" + body,
      "color:#fff;font-size:16px;font-weight:500;line-height:1.4",
    );
    console.log(
      "%c" + link,
      "color:#7c5cff;font-size:13px",
    );
  } catch {
    /* no-op */
  }
}
