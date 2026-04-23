import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HiRoo — community chat & voice",
  description: "Общайся, звони, создавай сообщества",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0d13",
};

// Self-XSS warning — выполняется как только DevTools открыт на любой
// странице HiRoo, включая /login и /register.
const SELF_XSS_SCRIPT = `
(function(){try{
  var ru = (navigator.language||"").toLowerCase().indexOf("ru")===0;
  var title = ru ? "Стоп!" : "Stop!";
  var body = ru
    ? "Это функция браузера для разработчиков. Если кто-то попросил вставить сюда код — это мошенничество: ваш аккаунт будет скомпрометирован."
    : "This is a developer tool. If someone told you to paste code here, it's a scam — your account will be stolen.";
  var link = ru ? "Подробнее: https://ru.wikipedia.org/wiki/Self-XSS"
                : "Learn more: https://en.wikipedia.org/wiki/Self-XSS";
  console.log("%c"+title, "color:#ff4f4f;font-size:56px;font-weight:900;text-shadow:2px 2px 0 rgba(0,0,0,.3)");
  console.log("%c"+body, "color:#fff;font-size:16px;font-weight:500;line-height:1.4");
  console.log("%c"+link, "color:#7c5cff;font-size:13px");
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark">
      <body>
        <script dangerouslySetInnerHTML={{ __html: SELF_XSS_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
