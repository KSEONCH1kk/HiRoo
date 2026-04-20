"use client";
import { useEffect, useState, useMemo, useRef, useLayoutEffect } from "react";

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
  anchor?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

const PICKER_WIDTH = 360;
const PICKER_HEIGHT = 380;
const MARGIN = 8;

const CATEGORIES: { id: string; icon: string; label: string; emojis: string[] }[] = [
  { id: "recent", icon: "🕒", label: "Часто используемые", emojis: [] },
  {
    id: "smileys", icon: "😀", label: "Смайлы и эмоции",
    emojis: "😀 😁 😂 🤣 😃 😄 😅 😆 😉 😊 😋 😎 😍 😘 🥰 😗 😙 😚 🙂 🤗 🤩 🤔 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 😌 😛 😜 😝 🤤 😒 😓 😔 😕 🙃 🤑 😲 ☹️ 🙁 😖 😞 😟 😤 😢 😭 😦 😧 😨 😩 🤯 😬 😰 😱 🥵 🥶 😳 🤪 😵 🥴 😠 😡 🤬 😷 🤒 🤕 🤢 🤮 🥺".split(" "),
  },
  {
    id: "gestures", icon: "👍", label: "Жесты и люди",
    emojis: "👋 🤚 🖐 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🦶 🦵 👂 🦻 👃 🧠 🦷 🦴 👀 👁 👅 👄 💋 💘 💝 💖 💗 💓 💞 💕 💟 ❣️ 💔 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍".split(" "),
  },
  {
    id: "nature", icon: "🌿", label: "Природа и животные",
    emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🦟 🕷 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🌸 💮 🏵 🌹 🥀 🌺 🌻 🌼 🌷 🌱 🪴 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍀".split(" "),
  },
  {
    id: "food", icon: "🍔", label: "Еда и напитки",
    emojis: "🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🍙 🍚 🍘 🍥 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 ☕ 🫖 🍵 🧃 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🥄 🍴 🍽".split(" "),
  },
  {
    id: "activities", icon: "⚽", label: "Активности",
    emojis: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸ 🥌 🎿 ⛷ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖 🎗 🎫 🎟 🎪 🤹 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🎸 🪕 🎻 🎲 ♟ 🎯 🎳 🎮 🎰 🧩".split(" "),
  },
  {
    id: "objects", icon: "💡", label: "Объекты",
    emojis: "⌚ 📱 📲 💻 ⌨️ 🖥 🖨 🖱 🖲 🕹 🗜 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽 🎞 📞 ☎️ 📟 📠 📺 📻 🎙 🎚 🎛 🧭 ⏱ ⏲ ⏰ 🕰 ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯 🪔 🧯 🛢 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🔧 🔨 ⚒ 🛠 ⛏ 🪚 🔩 ⚙️ 🪤 🧱 ⛓ 🧲 🔫 💣 🧨 🪓 🔪 🗡 ⚔️ 🛡".split(" "),
  },
  {
    id: "symbols", icon: "✨", label: "Символы",
    emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿ 🅿️ 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟".split(" "),
  },
];

const RECENT_KEY = "hiroo-recent-emojis";

function loadRecent(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(RECENT_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(emoji: string) {
  try {
    const list = loadRecent().filter((e) => e !== emoji);
    list.unshift(emoji);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 24)));
  } catch {}
}

export function EmojiPicker({ onPick, onClose, anchor = "bottom-right" }: Props) {
  const [category, setCategory] = useState("smileys");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  useLayoutEffect(() => {
    // Find trigger by walking up the DOM from wrapper's parent
    const wrapper = wrapperRef.current;
    const parent = wrapper?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left: number;
    let top: number;

    const preferRight = anchor.endsWith("-right");
    const preferBottom = anchor.startsWith("bottom");

    if (preferRight) left = rect.right - PICKER_WIDTH;
    else left = rect.left;

    if (preferBottom) top = rect.top - PICKER_HEIGHT - MARGIN;
    else top = rect.bottom + MARGIN;

    // Clamp
    left = Math.max(MARGIN, Math.min(left, vw - PICKER_WIDTH - MARGIN));
    if (top < MARGIN) top = rect.bottom + MARGIN;
    if (top + PICKER_HEIGHT > vh - MARGIN) top = Math.max(MARGIN, rect.top - PICKER_HEIGHT - MARGIN);
    if (top < MARGIN) top = MARGIN;

    setPos({ left, top });
  }, [anchor]);

  const emojis = useMemo(() => {
    if (query.trim()) return Array.from(new Set(CATEGORIES.flatMap((c) => c.emojis)));
    if (category === "recent") return recent;
    return CATEGORIES.find((c) => c.id === category)?.emojis ?? [];
  }, [category, query, recent]);

  const pick = (e: string) => {
    saveRecent(e);
    setRecent(loadRecent());
    onPick(e);
  };

  return (
    <>
      <div ref={wrapperRef} style={{ display: "none" }} />
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      {pos && (
        <div style={{
          position: "fixed", zIndex: 201,
          left: pos.left, top: pos.top,
          width: PICKER_WIDTH, height: PICKER_HEIGHT,
          background: "var(--bg-2)", border: "1px solid var(--line-strong)",
          borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", padding: 4, borderBottom: "1px solid var(--line)", gap: 2 }}>
            {CATEGORIES.map((c) => {
              const active = c.id === category && !query;
              const disabled = c.id === "recent" && recent.length === 0;
              return (
                <button
                  key={c.id}
                  onClick={() => { setCategory(c.id); setQuery(""); }}
                  disabled={disabled}
                  title={c.label}
                  style={{
                    flex: 1, height: 30, border: "none", borderRadius: 6, cursor: disabled ? "default" : "pointer",
                    background: active ? "var(--bg-active)" : "transparent",
                    fontSize: 16, opacity: disabled ? 0.3 : 1,
                  }}
                >
                  {c.icon}
                </button>
              );
            })}
          </div>

          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              style={{
                width: "100%", padding: "6px 10px", borderRadius: 6, background: "var(--bg-0)",
                border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 13,
                outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
            {emojis.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>
                {category === "recent" ? "Вы ещё не использовали эмодзи" : "Ничего не найдено"}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 2 }}>
                {emojis.map((e, i) => (
                  <button
                    key={`${e}-${i}`}
                    onClick={() => pick(e)}
                    style={{
                      height: 34, border: "none", borderRadius: 6, cursor: "pointer",
                      background: "transparent", fontSize: 22, lineHeight: 1, padding: 0,
                    }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
