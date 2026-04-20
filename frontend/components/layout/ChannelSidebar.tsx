"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { serversApi } from "@/lib/api";
import { useServerStore } from "@/store/serverStore";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { useVoicePresenceStore } from "@/store/voicePresenceStore";
import { useServerRoles } from "@/hooks/useServerRoles";
import { CreateChannelModal } from "@/components/modals/CreateChannelModal";
import { Avatar } from "@/components/ui/Avatar";
import type { Server, Channel } from "@/types";

interface Props {
  server: Server;
  channels: Channel[];
  activeChannelId: string | null;
  onPickChannel: (id: string) => void;
  onOpenVoice: (id: string) => void;
}

export function ChannelSidebar({ server, channels, activeChannelId, onPickChannel, onOpenVoice }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [createChannel, setCreateChannel] = useState<"text" | "voice" | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const { setServers, servers } = useServerStore();
  const { has } = useServerPermissions(server.id);
  const voicePresence = useVoicePresenceStore((s) => s.byRoom);
  const { membersById } = useServerRoles(server.id);

  const leave = useMutation({
    mutationFn: () => serversApi.leave(server.id),
    onSuccess: () => {
      setServers(servers.filter((s) => s.id !== server.id));
      qc.invalidateQueries({ queryKey: ["my-servers"] });
      router.push("/friends");
    },
  });

  const regen = useMutation({
    mutationFn: () => serversApi.regenerateInvite(server.id),
    onSuccess: (res) => { (server as any).invite_code = res.invite_code; setMenuOpen(false); setShowInvite(true); },
  });

  const copyInvite = async () => {
    const link = `${window.location.origin}/invite/${server.invite_code}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      else {
        const ta = document.createElement("textarea");
        ta.value = link; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const text = channels.filter((c) => c.type === "text" || c.type === "announcement");
  const voice = channels.filter((c) => c.type === "voice");

  const renderGroup = (label: string, groupKey: "text" | "voice", chs: Channel[]) => (
    <div key={label} style={{ marginBottom: 4 }}>
      <div style={{ padding: "10px 6px 6px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-2)" }}>
        <div onClick={() => setCollapsed((s) => ({ ...s, [label]: !s[label] }))} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer", flex: 1 }}>
          <i className={`fa-solid fa-chevron-${collapsed[label] ? "right" : "down"}`} style={{ fontSize: 9, marginRight: 3 }} />
          {label}
        </div>
        {has("MANAGE_CHANNELS") && (
          <button
            onClick={() => setCreateChannel(groupKey)}
            title={`Создать ${groupKey === "voice" ? "голосовой" : "текстовый"} канал`}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 2, borderRadius: 4 }}
          >
            <i className="fa-solid fa-plus" style={{ fontSize: 12, opacity: 0.6 }} />
          </button>
        )}
      </div>
      {!collapsed[label] && chs.map((ch) => {
        const isActive = ch.id === activeChannelId;
        const isVoice = ch.type === "voice";
        const participants = isVoice ? (voicePresence[`channel:${ch.id}`] ?? []) : [];
        const Icon = () => isVoice
          ? <i className="fa-solid fa-volume-high" style={{ fontSize: 15 }} />
          : ch.is_private
          ? <i className="fa-solid fa-lock" style={{ fontSize: 15 }} />
          : <i className="fa-solid fa-hashtag" style={{ fontSize: 15 }} />;
        return (
          <div key={ch.id}>
            <div onClick={() => isVoice ? onOpenVoice(ch.id) : onPickChannel(ch.id)} style={{
              padding: "6px 8px", borderRadius: 6,
              display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
              background: isActive ? "var(--bg-active)" : "transparent",
              color: isActive ? "var(--text-0)" : "var(--text-2)",
              fontSize: 14, fontWeight: isActive ? 500 : 400,
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
              {isVoice && participants.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "Geist Mono" }}>{participants.length}</span>
              )}
            </div>
            {isVoice && participants.map((uid) => {
              const m = membersById.get(uid);
              const name = m?.nickname || m?.user.display_name || m?.user.username || uid.slice(0, 6);
              return (
                <div key={uid} style={{ padding: "3px 8px 3px 30px", display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-1)" }}>
                  <Avatar name={m?.user.username ?? name} size={20} shape="circle" avatarUrl={m?.user.avatar_url ?? null} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const menuItem = (icon: string, label: string, onClick: () => void, danger = false) => (
    <div onClick={onClick} style={{
      padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderRadius: 6, margin: "0 4px",
      color: danger ? "var(--danger)" : "var(--text-1)", fontSize: 13.5,
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "rgba(255,80,80,0.1)" : "var(--bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
      <i className={`fa-solid ${icon}`} style={{ fontSize: 12, opacity: 0.8 }} />
    </div>
  );

  return (
    <div style={{
      width: 252, flexShrink: 0, background: "var(--bg-1)",
      borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden",
      position: "relative",
    }}>
      {/* Server header */}
      <div
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          height: 48, padding: "0 14px", borderBottom: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
          background: menuOpen ? "var(--bg-hover)" : "transparent",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)", letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server.name}</div>
        <i className={`fa-solid fa-${menuOpen ? "xmark" : "chevron-down"}`} style={{ fontSize: 13, color: "var(--text-2)" }} />
      </div>

      {/* Server dropdown menu */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{
            position: "absolute", top: 52, left: 6, right: 6, zIndex: 50,
            background: "var(--bg-2)", border: "1px solid var(--line-strong)",
            borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            padding: "6px 0", animation: "fadeIn 120ms ease-out",
          }}>
            {has("CREATE_INVITE") && menuItem("fa-user-plus", "Пригласить людей", () => { setMenuOpen(false); setShowInvite(true); })}
            {has("MANAGE_CHANNELS") && menuItem("fa-hashtag", "Создать канал", () => { setMenuOpen(false); setCreateChannel("text"); })}
            {has("MANAGE_CHANNELS") && menuItem("fa-volume-high", "Голосовой канал", () => { setMenuOpen(false); setCreateChannel("voice"); })}
            {(has("MANAGE_SERVER") || has("MANAGE_ROLES") || has("MANAGE_CHANNELS") || has("KICK_MEMBERS")) &&
              menuItem("fa-gear", "Настройки сервера", () => { setMenuOpen(false); router.push(`/servers/${server.id}/settings`); })}
            {has("MANAGE_SERVER") && menuItem("fa-rotate", "Новая ссылка-приглашение", () => regen.mutate())}
            <div style={{ height: 1, background: "var(--line)", margin: "6px 0" }} />
            {menuItem("fa-right-from-bracket", "Покинуть сервер", () => { if (confirm(`Покинуть «${server.name}»?`)) leave.mutate(); }, true)}
          </div>
        </>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 6px 14px" }}>
        {renderGroup("текстовые каналы", "text", text)}
        {renderGroup("голосовые", "voice", voice)}
      </div>

      {createChannel && (
        <CreateChannelModal
          serverId={server.id}
          initialType={createChannel}
          onClose={() => setCreateChannel(null)}
        />
      )}

      {showInvite && (
        <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 4 }}>Пригласить на «{server.name}»</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 14 }}>Отправьте эту ссылку друзьям</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${server.invite_code}`}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 13, fontFamily: "Geist Mono", outline: "none" }}
              />
              <button onClick={copyInvite} style={{ padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
