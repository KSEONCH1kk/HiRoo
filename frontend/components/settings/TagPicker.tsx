"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, serversApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ClanTag } from "@/components/ui/ClanTag";
import type { Server } from "@/types";

/** Profile settings section: let the user pick which server's clan tag to
 * display next to their name, or turn it off. */
export function TagPicker() {
  const { user, updateUser } = useAuthStore();
  const qc = useQueryClient();

  const { data: servers, isLoading } = useQuery<Server[]>({
    queryKey: ["my-servers"],
    queryFn: () => serversApi.list(),
  });

  const setTag = useMutation({
    mutationFn: (serverId: string | null) =>
      usersApi.updateMe({ active_tag_server_id: serverId ?? null }),
    onSuccess: (updated) => {
      updateUser(updated);
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  if (!user) return null;
  const serversWithTag = (servers ?? []).filter((s) => s.tag_label && s.tag_icon);
  const activeId = user.tag?.server_id ?? null;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "16px 20px", borderRadius: 12,
      background: "var(--bg-2)", border: "1px solid var(--line)",
    }}>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-0)" }}>
          Тэг сервера
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>
          Отображается рядом с вашим именем во всех сообщениях и списках участников
        </div>
      </div>

      {isLoading ? (
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>Загрузка…</div>
      ) : serversWithTag.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-3)", padding: "10px 12px", borderRadius: 8, background: "var(--bg-1)" }}>
          Ни один из ваших серверов пока не настроил тэг. Администратор сервера может
          создать его в настройках сервера → «Тэг сервера».
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <TagRow
            active={activeId === null}
            label="Без тэга"
            onClick={() => setTag.mutate(null)}
            pending={setTag.isPending && setTag.variables === null}
          />
          {serversWithTag.map((s) => (
            <TagRow
              key={s.id}
              active={activeId === s.id}
              label={s.name}
              preview={{
                label: s.tag_label!,
                icon: s.tag_icon!,
                server_id: s.id,
                server_name: s.name,
              }}
              onClick={() => setTag.mutate(s.id)}
              pending={setTag.isPending && setTag.variables === s.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TagRow({ active, label, preview, onClick, pending }: {
  active: boolean;
  label: string;
  preview?: { label: string; icon: string; server_id: string; server_name?: string };
  onClick: () => void;
  pending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", borderRadius: 8, cursor: "pointer",
        background: active ? "rgba(124,92,255,0.15)" : "var(--bg-1)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--line)",
        color: "var(--text-0)", fontSize: 14, textAlign: "left",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: "50%",
        border: active ? "5px solid var(--accent)" : "2px solid var(--line-strong)",
        transition: "border-width 120ms",
        flexShrink: 0,
      }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {preview && <ClanTag tag={preview} nonInteractive />}
    </button>
  );
}
