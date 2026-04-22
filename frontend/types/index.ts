export type BadgeId = "platform_admin" | "verified" | "server_owner" | "early_user" | (string & {});

export interface ClanTag {
  label: string;
  icon: string;
  server_id: string;
  server_name?: string | null;
}

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "online" | "idle" | "dnd" | "offline";
  custom_status: string | null;
  is_verified: boolean;
  is_platform_admin?: boolean;
  created_at: string;
  public_key?: string | null;
  signing_public_key?: string | null;
  badges?: BadgeId[];
  dm_permission?: "everyone" | "friends";
  friend_request_permission?: "everyone" | "friends";
  show_online_status?: boolean;
  notif_sound?: boolean;
  notif_desktop?: boolean;
  notif_level?: "all" | "mentions" | "none";
  tag?: ClanTag | null;
}

export interface UserPublic {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "online" | "idle" | "dnd" | "offline";
  custom_status: string | null;
  is_verified?: boolean;
  is_platform_admin?: boolean;
  created_at?: string | null;
  public_key?: string | null;
  signing_public_key?: string | null;
  badges?: BadgeId[];
  tag?: ClanTag | null;
}

export interface Server {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  owner_id: string;
  invite_code: string;
  is_discoverable: boolean;
  tag_label?: string | null;
  tag_icon?: string | null;
  created_at: string;
  member_count: number;
}

export interface ServerMember {
  user_id: string;
  server_id: string;
  role: "owner" | "admin" | "member" | "moderator";
  nickname: string | null;
  joined_at: string;
  user: UserPublic;
  role_ids: string[];
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: "text" | "voice" | "announcement" | "category" | "forum";
  position: number;
  topic: string | null;
  is_private: boolean;
  slowmode_seconds: number;
  parent_id?: string | null;
  created_at: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ReplyPreview {
  id: string;
  author: UserPublic | null;
  content: string;
  is_deleted: boolean;
}

export interface EmbedField { name: string; value: string; inline?: boolean; }
export interface EmbedAuthor { name: string; url?: string | null; icon_url?: string | null; }
export interface EmbedFooter { text: string; icon_url?: string | null; }
export interface EmbedImage { url: string; }

export interface Embed {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  color?: number | null;
  timestamp?: string | null;
  author?: EmbedAuthor | null;
  footer?: EmbedFooter | null;
  image?: EmbedImage | null;
  thumbnail?: EmbedImage | null;
  fields?: EmbedField[] | null;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string | null;
  content: string;
  reply_to_id: string | null;
  reply_to: ReplyPreview | null;
  edited_at: string | null;
  is_deleted: boolean;
  created_at: string;
  author: UserPublic | null;
  reactions: Reaction[];
  webhook_id: string | null;
  webhook_name: string | null;
  webhook_avatar_url: string | null;
  embeds: Embed[] | null;
  components?: any[] | null;
  application_id?: string | null;
}

export interface DMParticipant {
  user_id: string;
  joined_at: string;
  user: UserPublic;
}

export interface DirectMessage {
  id: string;
  is_group: boolean;
  name: string | null;
  icon_url: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  participants: DMParticipant[];
  last_message: string | null;
}

export interface DMMessageType {
  id: string;
  dm_id: string;
  author_id: string | null;
  type: "text" | "call_log";
  content: string;
  reply_to_id: string | null;
  reply_to: ReplyPreview | null;
  edited_at: string | null;
  is_deleted: boolean;
  created_at: string;
  author: UserPublic | null;
  reactions: Reaction[];
}

export interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "rejected" | "blocked";
  created_at: string;
  from_user: UserPublic;
  to_user: UserPublic;
}

export interface Notification {
  id: string;
  kind: "mention" | "reply" | "friend_request" | "missed_call" | "event";
  content: string | null;
  is_read: boolean;
  created_at: string;
  from_user: UserPublic | null;
  server_id: string | null;
  channel_id: string | null;
}

export interface VoiceState {
  user_id: string;
  channel_id: string | null;
  server_id: string | null;
  is_muted: boolean;
  is_deafened: boolean;
  is_sharing_screen: boolean;
  is_video: boolean;
}

export interface PaginatedMessages {
  items: Message[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}
