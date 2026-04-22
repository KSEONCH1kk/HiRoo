"use client";
import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { forumApi, channelsApi, type ForumPost, type ForumTag } from "@/lib/api";
import { useServerPermissions } from "@/hooks/useServerPermissions";
import { useAuthStore } from "@/store/authStore";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ClanTag } from "@/components/ui/ClanTag";
import type { Channel } from "@/types";

type Sort = "recent" | "new" | "oldest";

export default function ForumChannelPage() {
  const params = useParams<{ serverId: string; channelId: string }>();
  const serverId = params?.serverId ?? "";
  const channelId = params?.channelId ?? "";
  const router = useRouter();
  const qc = useQueryClient();
  const { has } = useServerPermissions(serverId);
  const { user } = useAuthStore();

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingRules, setEditingRules] = useState(false);
  const [openPost, setOpenPost] = useState<ForumPost | null>(null);

  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["channels", serverId],
    queryFn: () => channelsApi.list(serverId),
  });
  const channel = channels?.find((c) => c.id === channelId);

  const { data, isLoading } = useQuery({
    queryKey: ["forum", channelId, q, sort, activeTag],
    queryFn: () => forumApi.list(channelId, {
      q: q.trim() || undefined,
      sort,
      tag: activeTag ?? undefined,
    }),
  });

  const canPost = has("SEND_MESSAGES");
  const canManage = has("MANAGE_CHANNELS") || has("MANAGE_MESSAGES");
  const canManageChannel = has("MANAGE_CHANNELS");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-1)" }}>
      {/* Header */}
      <div style={{
        height: 48, flexShrink: 0, padding: "0 16px",
        borderBottom: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 10, background: "var(--bg-1)",
      }}>
        <i className="fa-solid fa-comments" style={{ fontSize: 14, color: "var(--text-2)" }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-0)" }}>{channel?.name ?? "форум"}</span>
        {channel?.topic && (
          <>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>·</span>
            <span style={{ fontSize: 12.5, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {channel.topic}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {canManageChannel && (
            <Button size="sm" variant="soft" onClick={() => setEditingRules(true)}>
              <i className="fa-solid fa-gavel" style={{ marginRight: 6 }} />
              Правила
            </Button>
          )}
          {canPost && (
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Публикация
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar: search, sort, tags */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--line)",
        display: "flex", flexDirection: "column", gap: 10, background: "var(--bg-0)",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <i className="fa-solid fa-magnifying-glass" style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--text-3)", fontSize: 12,
            }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск публикаций…"
              style={{
                width: "100%", padding: "8px 12px 8px 30px", borderRadius: 8,
                background: "var(--bg-2)", border: "1px solid var(--line-strong)",
                color: "var(--text-0)", fontSize: 13.5, outline: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, background: "var(--bg-2)", borderRadius: 8, padding: 3 }}>
            {([["recent", "Активные"], ["new", "Новые"], ["oldest", "Старые"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: sort === k ? "var(--accent)" : "transparent",
                  color: sort === k ? "#fff" : "var(--text-1)",
                  fontSize: 12.5, fontWeight: 600,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {(data?.tags?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <TagChip
              active={activeTag === null}
              onClick={() => setActiveTag(null)}
              color="var(--text-2)"
              label="Все"
            />
            {data!.tags.map((t) => (
              <TagChip
                key={t.id}
                active={activeTag === t.id}
                onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
                color={t.color}
                label={t.emoji ? `${t.emoji} ${t.name}` : t.name}
              />
            ))}
            {canManageChannel && (
              <button
                onClick={async () => {
                  const name = prompt("Название тэга (до 32 символов)");
                  if (!name) return;
                  const color = prompt("Цвет HEX (#RRGGBB)", "#7c5cff") || "#7c5cff";
                  try { await forumApi.createTag(channelId, { name, color }); qc.invalidateQueries({ queryKey: ["forum", channelId] }); } catch {}
                }}
                style={{
                  padding: "3px 10px", borderRadius: 999, border: "1px dashed var(--line-strong)",
                  background: "transparent", color: "var(--text-2)", fontSize: 12, cursor: "pointer",
                }}
              >
                <i className="fa-solid fa-plus" style={{ marginRight: 4, fontSize: 10 }} />
                Тэг
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {isLoading && <div style={{ color: "var(--text-2)", fontSize: 13 }}>Загрузка…</div>}

        {data?.rules && (
          <PostCard
            post={data.rules}
            tags={data.tags}
            isRules
            onClick={() => setOpenPost(data.rules)}
          />
        )}

        {(data?.posts ?? []).length === 0 && !isLoading && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            {q ? "Ничего не найдено" : "Пока нет публикаций. Создайте первую!"}
          </div>
        )}

        {(data?.posts ?? []).map((p) => (
          <PostCard
            key={p.id}
            post={p}
            tags={data!.tags}
            onClick={() => setOpenPost(p)}
          />
        ))}
      </div>

      {creating && (
        <CreatePostModal
          channelId={channelId}
          tags={data?.tags ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["forum", channelId] });
          }}
        />
      )}

      {editingRules && (
        <RulesModal
          channelId={channelId}
          current={data?.rules ?? null}
          onClose={() => setEditingRules(false)}
          onSaved={() => {
            setEditingRules(false);
            qc.invalidateQueries({ queryKey: ["forum", channelId] });
          }}
        />
      )}

      {openPost && (
        <PostDetailModal
          post={openPost}
          tags={data?.tags ?? []}
          canManage={canManage}
          onClose={() => setOpenPost(null)}
          onDelete={async () => {
            if (!confirm(`Удалить публикацию «${openPost.title}»?`)) return;
            try { await forumApi.deletePost(channelId, openPost.id); qc.invalidateQueries({ queryKey: ["forum", channelId] }); setOpenPost(null); } catch {}
          }}
        />
      )}
    </div>
  );
}

// ── Post card ──────────────────────────────────────────────────────────

function PostCard({ post, tags, isRules, onClick }: {
  post: ForumPost; tags: ForumTag[]; isRules?: boolean; onClick?: () => void;
}) {
  const tagsById = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t] as const)), [tags]);
  const postTags = post.tag_ids.map((id) => tagsById[id]).filter(Boolean);
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px", borderRadius: 10, marginBottom: 8,
        background: isRules ? "rgba(124,92,255,0.08)" : "var(--bg-2)",
        border: isRules ? "1px solid var(--accent)" : "1px solid var(--line)",
        cursor: "pointer", display: "flex", gap: 12,
      }}
      onMouseEnter={(e) => { if (!isRules) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { if (!isRules) (e.currentTarget as HTMLElement).style.background = "var(--bg-2)"; }}
    >
      {!isRules && post.author && (
        <Avatar name={post.author.username} size={40} shape="circle" avatarUrl={post.author.avatar_url} />
      )}
      {isRules && (
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), #5b8af0)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          flexShrink: 0,
        }}>
          <i className="fa-solid fa-gavel" style={{ fontSize: 15 }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
          {isRules && <BadgeTag color="var(--accent)" text="ПРАВИЛА" />}
          {post.is_pinned && !isRules && (
            <i className="fa-solid fa-thumbtack" style={{ fontSize: 11, color: "var(--accent)" }} title="Закреплено" />
          )}
          {post.is_locked && (
            <i className="fa-solid fa-lock" style={{ fontSize: 11, color: "var(--text-3)" }} title="Закрыто для ответов" />
          )}
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {post.title}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-word" }}>
          {post.content}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          {postTags.map((t) => (
            <BadgeTag key={t.id} color={t.color} text={t.emoji ? `${t.emoji} ${t.name}` : t.name} />
          ))}
          {!isRules && post.author && (
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "Geist Mono", marginLeft: "auto" }}>
              {post.author.display_name ?? post.author.username}
              <ClanTag tag={post.author.tag} nonInteractive />
              {" · "}
              {post.reply_count} отв.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function BadgeTag({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 999,
      background: `${color}22`,
      border: `1px solid ${color}55`,
      color,
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3,
      display: "inline-flex", alignItems: "center",
    }}>
      {text}
    </span>
  );
}

function TagChip({ active, onClick, color, label }: { active: boolean; onClick: () => void; color: string; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 999, border: `1px solid ${active ? color : "var(--line-strong)"}`,
        background: active ? `${color}22` : "transparent",
        color: active ? color : "var(--text-1)",
        fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── Create post modal ──────────────────────────────────────────────────

function CreatePostModal({ channelId, tags, onClose, onCreated }: {
  channelId: string; tags: ForumTag[]; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => forumApi.createPost(channelId, { title: title.trim(), content: content.trim(), tag_ids: selectedTags }),
    onSuccess: onCreated,
    onError: (e: any) => setErr(e?.response?.data?.detail || "Ошибка"),
  });

  const toggleTag = (id: string) => {
    setSelectedTags((s) => s.includes(id)
      ? s.filter((x) => x !== id)
      : s.length < 5 ? [...s, id] : s);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: "94vw", background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 14 }}>Новая публикация</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder="Заголовок *" style={inputStyle} autoFocus
          />
          <textarea
            value={content} onChange={(e) => setContent(e.target.value.slice(0, 10000))}
            placeholder="Текст публикации" rows={8} style={{ ...inputStyle, resize: "vertical" }}
          />
          {tags.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                Тэги (до 5)
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {tags.map((t) => (
                  <TagChip
                    key={t.id}
                    active={selectedTags.includes(t.id)}
                    onClick={() => toggleTag(t.id)}
                    color={t.color}
                    label={t.emoji ? `${t.emoji} ${t.name}` : t.name}
                  />
                ))}
              </div>
            </div>
          )}
          {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Публикуем…" : "Опубликовать"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Rules modal (admin) ────────────────────────────────────────────────

function RulesModal({ channelId, current, onClose, onSaved }: {
  channelId: string; current: ForumPost | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(current?.title ?? "Правила форума");
  const [content, setContent] = useState(current?.content ?? "");

  const save = useMutation({
    mutationFn: () => forumApi.upsertRules(channelId, { title: title.trim(), content }),
    onSuccess: onSaved,
  });
  const del = useMutation({
    mutationFn: () => forumApi.deleteRules(channelId),
    onSuccess: onSaved,
  });

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    background: "var(--bg-0)", border: "1px solid var(--line-strong)",
    color: "var(--text-0)", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 580, maxWidth: "94vw", background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 14, padding: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-0)", marginBottom: 14 }}>
          <i className="fa-solid fa-gavel" style={{ marginRight: 8, color: "var(--accent)" }} />
          Правила форума
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.55 }}>
          Эта публикация будет закреплена первой и видна всем посетителям.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Заголовок" style={inputStyle} />
          <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 10000))} placeholder="Опишите правила публикации, формат, запреты…" rows={10} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
          {current ? (
            <Button variant="ghost" onClick={() => { if (confirm("Удалить правила?")) del.mutate(); }} disabled={del.isPending}>
              Удалить
            </Button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Отмена</Button>
            <Button variant="primary" onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
              {save.isPending ? "…" : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Post detail modal ──────────────────────────────────────────────────

function PostDetailModal({ post, tags, canManage, onClose, onDelete }: {
  post: ForumPost; tags: ForumTag[]; canManage: boolean;
  onClose: () => void; onDelete: () => void;
}) {
  const tagsById = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t] as const)), [tags]);
  const postTags = post.tag_ids.map((id) => tagsById[id]).filter(Boolean);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "94vw", maxHeight: "80vh", background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {post.is_rules && <BadgeTag color="var(--accent)" text="ПРАВИЛА" />}
            {postTags.map((t) => (
              <BadgeTag key={t.id} color={t.color} text={t.emoji ? `${t.emoji} ${t.name}` : t.name} />
            ))}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-0)", marginBottom: 4 }}>{post.title}</div>
          {post.author && (
            <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "Geist Mono", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {post.author.display_name ?? post.author.username}
              <ClanTag tag={post.author.tag} nonInteractive />
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", fontSize: 14, color: "var(--text-1)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {post.content || <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>(пусто)</span>}
        </div>
        <div style={{ padding: "10px 22px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {canManage && !post.is_rules && (
            <Button variant="ghost" onClick={onDelete}>Удалить</Button>
          )}
          <Button variant="primary" onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    </div>
  );
}
