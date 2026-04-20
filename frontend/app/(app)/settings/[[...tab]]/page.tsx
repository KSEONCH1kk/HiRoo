"use client";
import { useRouter } from "next/navigation";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { VoiceSettings } from "@/components/settings/VoiceSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

const TABS = [
  { id: "profile", label: "Профиль", icon: "fa-user" },
  { id: "voice", label: "Звук и видео", icon: "fa-microphone" },
  { id: "appearance", label: "Внешний вид", icon: "fa-palette" },
  { id: "privacy", label: "Конфиденциальность", icon: "fa-lock" },
  { id: "notifications", label: "Уведомления", icon: "fa-bell" },
];

export default function SettingsPage({ params }: { params: { tab?: string[] } }) {
  const activeTab = params.tab?.[0] ?? "profile";
  const router = useRouter();
  const { clearAuth } = useAuthStore();

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    disconnectSocket();
    clearAuth();
    router.replace("/login");
  };

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, background: "var(--bg-1)" }}>
      {/* Settings sidebar */}
      <div style={{ width: 220, flexShrink: 0, padding: "20px 8px", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 10px 8px" }}>
          Настройки
        </div>
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => router.push(`/settings/${t.id}`)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
              background: activeTab === t.id ? "var(--bg-active)" : "transparent",
              color: activeTab === t.id ? "var(--text-0)" : "var(--text-1)",
              fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400,
            }}
            onMouseEnter={(e) => { if (activeTab !== t.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (activeTab !== t.id) e.currentTarget.style.background = "transparent"; }}
          >
            <i className={`fa-solid ${t.icon}`} style={{ width: 16, textAlign: "center", fontSize: 13 }} />
            {t.label}
          </div>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--line)" }}>
          <div
            onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", color: "var(--danger)", fontSize: 14 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,80,80,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <i className="fa-solid fa-arrow-right-from-bracket" style={{ width: 16, textAlign: "center", fontSize: 13 }} />
            Выйти
          </div>
        </div>
      </div>

      {/* Settings content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 40px", maxWidth: 680 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-0)", marginBottom: 24, letterSpacing: -0.4 }}>
          {TABS.find((t) => t.id === activeTab)?.label ?? "Настройки"}
        </div>
        {activeTab === "profile" && <ProfileSettings />}
        {activeTab === "voice" && <VoiceSettings />}
        {activeTab === "appearance" && <AppearanceSettings />}
        {activeTab === "privacy" && (
          <div style={{ color: "var(--text-2)", fontSize: 14 }}>Настройки конфиденциальности — скоро</div>
        )}
        {activeTab === "notifications" && (
          <div style={{ color: "var(--text-2)", fontSize: 14 }}>Настройки уведомлений — скоро</div>
        )}
      </div>
    </div>
  );
}
