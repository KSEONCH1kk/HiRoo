"use client";
import { useRouter } from "next/navigation";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { VoiceSettings } from "@/components/settings/VoiceSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { NotificationsSettings } from "@/components/settings/NotificationsSettings";
import { DevicesSettings } from "@/components/settings/DevicesSettings";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { useIsMobile } from "@/hooks/useIsMobile";

const TABS = [
  { id: "profile", label: "Профиль", icon: "fa-user" },
  { id: "voice", label: "Звук и видео", icon: "fa-microphone" },
  { id: "appearance", label: "Внешний вид", icon: "fa-palette" },
  { id: "privacy", label: "Конфиденциальность", icon: "fa-lock" },
  { id: "notifications", label: "Уведомления", icon: "fa-bell" },
  { id: "devices", label: "Устройства", icon: "fa-mobile-screen" },
  { id: "developers", label: "Developers", icon: "fa-code", external: "/developers" },
];

export default function SettingsPage({ params }: { params: { tab?: string[] } }) {
  const router = useRouter();
  const { clearAuth } = useAuthStore();
  const isMobile = useIsMobile();
  const rawTab = params.tab?.[0];
  const activeTab = rawTab ?? (isMobile ? "" : "profile");

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    disconnectSocket();
    clearAuth();
    router.replace("/login");
  };

  const isIndex = !activeTab;
  const showSidebar = !isMobile || isIndex;
  const showContent = !isMobile || !isIndex;

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, background: "var(--bg-1)" }}>
      {showSidebar && (
        <div style={{
          width: isMobile ? "100%" : 220,
          flexShrink: 0, padding: "20px 8px",
          borderRight: isMobile ? "none" : "1px solid var(--line)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, padding: "0 10px 8px" }}>
            Настройки
          </div>
          {TABS.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push((t as any).external ?? `/settings/${t.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: activeTab === t.id ? "var(--bg-active)" : "transparent",
                color: activeTab === t.id ? "var(--text-0)" : "var(--text-1)",
                fontSize: 14.5, fontWeight: activeTab === t.id ? 600 : 400,
              }}
              onMouseEnter={(e) => { if (activeTab !== t.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (activeTab !== t.id) e.currentTarget.style.background = "transparent"; }}
            >
              <i className={`fa-solid ${t.icon}`} style={{ width: 18, textAlign: "center", fontSize: 14 }} />
              <span style={{ flex: 1 }}>{t.label}</span>
              {isMobile && <i className="fa-solid fa-chevron-right" style={{ fontSize: 11, color: "var(--text-3)" }} />}
            </div>
          ))}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div
              onClick={handleLogout}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", color: "var(--danger)", fontSize: 14.5 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,80,80,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="fa-solid fa-arrow-right-from-bracket" style={{ width: 18, textAlign: "center", fontSize: 14 }} />
              Выйти
            </div>
          </div>
        </div>
      )}

      {showContent && (
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px 28px" : "28px 40px", maxWidth: 680 }}>
          {isMobile && (
            <button
              onClick={() => router.push("/settings")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", fontSize: 13, marginBottom: 8, marginLeft: -6 }}
            >
              <i className="fa-solid fa-chevron-left" style={{ fontSize: 12 }} />
              Назад
            </button>
          )}
          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 700, color: "var(--text-0)", marginBottom: isMobile ? 16 : 24, letterSpacing: -0.4 }}>
            {TABS.find((t) => t.id === activeTab)?.label ?? "Настройки"}
          </div>
          {activeTab === "profile" && <ProfileSettings />}
          {activeTab === "voice" && <VoiceSettings />}
          {activeTab === "appearance" && <AppearanceSettings />}
          {activeTab === "privacy" && <PrivacySettings />}
          {activeTab === "notifications" && <NotificationsSettings />}
          {activeTab === "devices" && <DevicesSettings />}
        </div>
      )}
    </div>
  );
}
