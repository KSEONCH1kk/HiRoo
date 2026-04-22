"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";

export function DevicesSettings() {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["me-sessions"],
    queryFn: usersApi.listSessions,
    staleTime: 10_000,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => usersApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-sessions"] }),
  });

  const revokeAll = useMutation({
    mutationFn: () => usersApi.revokeOtherSessions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-sessions"] }),
  });

  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
        Устройства и браузеры, в которых выполнен вход в HiRoo. Отзовите запись — и на том устройстве
        вылетит из аккаунта при следующем запросе.
      </div>

      {otherCount > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => {
              if (confirm(`Выйти из ${otherCount} устройств, кроме этого?`)) revokeAll.mutate();
            }}
            disabled={revokeAll.isPending}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--danger)",
              background: "transparent", color: "var(--danger)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {revokeAll.isPending ? "…" : `Выйти со всех других устройств (${otherCount})`}
          </button>
        </div>
      )}

      {isLoading && <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>}

      {!isLoading && sessions.length === 0 && (
        <div style={{
          padding: 24, textAlign: "center", borderRadius: 10,
          border: "1px dashed var(--line-strong)", color: "var(--text-3)", fontSize: 13,
        }}>
          Пусто.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sessions.map((s) => {
          const parsed = parseUA(s.user_agent || "");
          return (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px", borderRadius: 10,
              background: "var(--bg-2)",
              border: `1px solid ${s.current ? "var(--accent)" : "var(--line)"}`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "var(--bg-3)", color: s.current ? "var(--accent)" : "var(--text-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <i className={`fa-solid ${parsed.icon}`} style={{ fontSize: 17 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-0)" }}>
                    {parsed.label}
                  </span>
                  {s.current && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                      background: "var(--accent)", color: "#fff", letterSpacing: 0.4,
                    }}>
                      ЭТО УСТРОЙСТВО
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 11.5, color: "var(--text-3)", fontFamily: "Geist Mono", marginTop: 3,
                  display: "flex", gap: 10, flexWrap: "wrap",
                }}>
                  {s.ip && <span><i className="fa-solid fa-location-dot" style={{ marginRight: 4 }} />{s.ip}</span>}
                  <span><i className="fa-solid fa-clock" style={{ marginRight: 4 }} />{formatRel(s.last_used_at)}</span>
                </div>
              </div>
              {!s.current && (
                <button
                  onClick={() => { if (confirm("Выйти с этого устройства?")) revoke.mutate(s.id); }}
                  disabled={revoke.isPending}
                  style={{
                    padding: "6px 12px", borderRadius: 6, border: "1px solid var(--danger)",
                    background: "transparent", color: "var(--danger)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {revoke.isPending ? "…" : "Выйти"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function parseUA(ua: string): { icon: string; label: string } {
  const s = ua.toLowerCase();

  // Detect platform first.
  if (s.includes("android")) return { icon: "fa-mobile-screen", label: uaBrowser(ua) + " · Android" };
  if (s.includes("iphone") || s.includes("ipad") || s.includes("ipod")) return { icon: "fa-mobile-screen", label: uaBrowser(ua) + " · iOS" };
  if (s.includes("hiroodesktop") || s.includes("electron")) return { icon: "fa-desktop", label: "HiRoo Desktop" };
  if (s.includes("macintosh") || s.includes("mac os")) return { icon: "fa-apple", label: uaBrowser(ua) + " · macOS" };
  if (s.includes("windows")) return { icon: "fa-windows", label: uaBrowser(ua) + " · Windows" };
  if (s.includes("linux")) return { icon: "fa-linux", label: uaBrowser(ua) + " · Linux" };
  return { icon: "fa-globe", label: uaBrowser(ua) || "Неизвестно" };
}

function uaBrowser(ua: string): string {
  const s = ua.toLowerCase();
  if (s.includes("edg/")) return "Edge";
  if (s.includes("opr/") || s.includes("opera")) return "Opera";
  if (s.includes("yabrowser")) return "Yandex";
  if (s.includes("firefox")) return "Firefox";
  if (s.includes("chrome")) return "Chrome";
  if (s.includes("safari")) return "Safari";
  return "Браузер";
}

function formatRel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} д назад`;
  return d.toLocaleDateString();
}
