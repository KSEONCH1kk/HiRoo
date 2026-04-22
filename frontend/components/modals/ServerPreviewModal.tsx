"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { serversApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ClanTag } from "@/components/ui/ClanTag";
import type { Server } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function resolveIcon(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

interface Props {
  serverId: string;
  onClose: () => void;
}

/** Shown when a user clicks on someone else's clan tag. If the referenced
 * server is publicly discoverable, we fetch a lightweight preview and offer
 * a Join button. Non-public servers → friendly "this is private" message. */
export function ServerPreviewModal({ serverId, onClose }: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  // Check if we're already a member — saves a round trip and lets us show
  // "Open server" instead of "Join".
  const { data: myServers } = useQuery<Server[]>({
    queryKey: ["my-servers"],
    queryFn: () => serversApi.list(),
    staleTime: 30_000,
  });
  const alreadyMember = (myServers ?? []).some((s) => s.id === serverId);

  const { data: server, isLoading, error } = useQuery<Server>({
    queryKey: ["server-preview", serverId],
    queryFn: () => serversApi.preview(serverId),
    retry: false,
    enabled: !alreadyMember,
  });

  const join = useMutation({
    mutationFn: (code: string) => serversApi.join(code),
    onSuccess: (joined) => {
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      onClose();
      router.push(`/servers/${joined.id}`);
    },
  });

  const openServer = () => {
    onClose();
    router.push(`/servers/${serverId}`);
  };

  const iconUrl = server ? resolveIcon(server.icon_url) : undefined;
  const isNotPublic = (error as any)?.response?.status === 404;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: "90vw",
          background: "var(--bg-1)", borderRadius: 16,
          border: "1px solid var(--line-strong)",
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Banner */}
        <div style={{
          height: 100,
          background: "linear-gradient(135deg, var(--accent), oklch(50% 0.18 310))",
          position: "relative",
        }}>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 12,
              width: 28, height: 28, borderRadius: "50%", border: "none",
              background: "rgba(0,0,0,0.35)", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Закрыть"
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: 13 }} />
          </button>
          {(iconUrl || server?.name) && (
            <div style={{
              position: "absolute", bottom: -30, left: 24,
              width: 80, height: 80, borderRadius: 20,
              background: iconUrl ? "#000" : "linear-gradient(135deg, var(--accent), #5b8af0)",
              border: "4px solid var(--bg-1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 26, fontWeight: 700,
              overflow: "hidden",
            }}>
              {iconUrl ? (
                <img src={iconUrl} alt={server?.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                (server?.name ?? "?").slice(0, 2).toUpperCase()
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "42px 24px 24px" }}>
          {alreadyMember ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 8 }}>
                Вы уже на этом сервере
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-2)", marginBottom: 18 }}>
                Откройте его, чтобы продолжить общение.
              </div>
              <Button variant="primary" onClick={openServer} style={{ width: "100%" }}>
                Открыть сервер
              </Button>
            </>
          ) : isLoading ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-2)", fontSize: 13.5 }}>
              Загрузка…
            </div>
          ) : isNotPublic ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 6 }}>
                Это закрытый сервер
              </div>
              <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.55, marginBottom: 18 }}>
                Администраторы не добавили его в обзор. Попросите участника поделиться приглашением.
              </div>
              <Button variant="soft" onClick={onClose} style={{ width: "100%" }}>Закрыть</Button>
            </>
          ) : error ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)", marginBottom: 6 }}>
                Не удалось загрузить
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 18 }}>
                Попробуйте позже.
              </div>
              <Button variant="soft" onClick={onClose} style={{ width: "100%" }}>Закрыть</Button>
            </>
          ) : server ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {server.name}
                {server.tag_label && server.tag_icon && (
                  <ClanTag
                    tag={{ label: server.tag_label, icon: server.tag_icon, server_id: server.id, server_name: server.name }}
                    size="md"
                    nonInteractive
                  />
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "Geist Mono", marginBottom: 12 }}>
                <i className="fa-solid fa-user-group" style={{ fontSize: 10, marginRight: 5 }} />
                {server.member_count.toLocaleString("ru-RU")} {pluralize(server.member_count, ["участник", "участника", "участников"])}
              </div>
              {server.description && (
                <div style={{ fontSize: 13.5, color: "var(--text-1)", lineHeight: 1.55, marginBottom: 18, whiteSpace: "pre-wrap" }}>
                  {server.description}
                </div>
              )}
              {(join.error as any)?.response?.data?.detail && (
                <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)", color: "var(--danger)", fontSize: 13 }}>
                  {(join.error as any).response.data.detail}
                </div>
              )}
              <Button
                variant="primary"
                onClick={() => join.mutate(server.invite_code)}
                disabled={join.isPending}
                style={{ width: "100%" }}
              >
                {join.isPending ? "Вступаем…" : "Вступить на сервер"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
