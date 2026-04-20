"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { channelsApi } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { CreateChannelModal } from "@/components/modals/CreateChannelModal";
import type { Channel } from "@/types";

export function ChannelsTab({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [createType, setCreateType] = useState<"text" | "voice" | null>(null);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [editName, setEditName] = useState("");
  const [editTopic, setEditTopic] = useState("");

  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["channels", serverId],
    queryFn: () => channelsApi.list(serverId),
  });

  const save = useMutation({
    mutationFn: () => channelsApi.update(serverId, editing!.id, { name: editName, topic: editTopic } as Partial<Channel>),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels", serverId] }); setEditing(null); },
  });

  const del = useMutation({
    mutationFn: (id: string) => channelsApi.delete(serverId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", serverId] }),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => channelsApi.reorder(serverId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels", serverId] }),
  });

  const move = (channel: Channel, direction: -1 | 1) => {
    const same = channels.filter((c) => c.type === channel.type).sort((a, b) => a.position - b.position);
    const idx = same.findIndex((c) => c.id === channel.id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= same.length) return;
    const reordered = [...same];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const others = channels.filter((c) => c.type !== channel.type).sort((a, b) => a.position - b.position);
    reorder.mutate([...others, ...reordered].map((c) => c.id));
  };

  const text = channels.filter((c) => c.type !== "voice").sort((a, b) => a.position - b.position);
  const voice = channels.filter((c) => c.type === "voice").sort((a, b) => a.position - b.position);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, background: "var(--bg-0)",
    border: "1px solid var(--line-strong)", color: "var(--text-0)", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  const renderGroup = (title: string, type: "text" | "voice", list: Channel[]) => (
    <div key={type} style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6 }}>{title} — {list.length}</span>
        <Button size="sm" variant="soft" icon={<i className="fa-solid fa-plus" style={{ fontSize: 11 }} />} onClick={() => setCreateType(type)}>
          Создать
        </Button>
      </div>
      <div style={{ background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
        {list.map((ch, i) => (
          <div key={ch.id} style={{
            padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
            borderBottom: i === list.length - 1 ? "none" : "1px solid var(--line)",
          }}>
            <i className={`fa-solid fa-${type === "voice" ? "volume-high" : "hashtag"}`} style={{ color: "var(--text-2)", fontSize: 14, width: 16 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: "var(--text-0)" }}>{ch.name}</div>
              {ch.topic && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{ch.topic}</div>}
            </div>
            <button onClick={() => move(ch, -1)} title="Выше" style={{ border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", padding: 4 }}>
              <i className="fa-solid fa-arrow-up" style={{ fontSize: 12 }} />
            </button>
            <button onClick={() => move(ch, 1)} title="Ниже" style={{ border: "none", background: "transparent", color: "var(--text-2)", cursor: "pointer", padding: 4 }}>
              <i className="fa-solid fa-arrow-down" style={{ fontSize: 12 }} />
            </button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(ch); setEditName(ch.name); setEditTopic(ch.topic ?? ""); }}>
              Изменить
            </Button>
            <button
              onClick={() => { if (confirm(`Удалить канал «${ch.name}»?`)) del.mutate(ch.id); }}
              title="Удалить"
              style={{ border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer", padding: 4 }}
            >
              <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
            </button>
          </div>
        ))}
        {list.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>Пусто</div>}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720 }}>
      {renderGroup("Текстовые каналы", "text", text)}
      {renderGroup("Голосовые каналы", "voice", voice)}

      {createType && <CreateChannelModal serverId={serverId} initialType={createType} onClose={() => setCreateType(null)} />}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, borderRadius: 14, background: "var(--bg-2)", border: "1px solid var(--line-strong)", padding: 22, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 16 }}>Изменить канал</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                  Название
                </label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
              </div>
              {editing.type !== "voice" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
                    Тема
                  </label>
                  <input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} style={inputStyle} />
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <Button variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
              <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
