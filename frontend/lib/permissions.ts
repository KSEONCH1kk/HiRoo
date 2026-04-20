export const PERMISSIONS = {
  MANAGE_SERVER: 1 << 0,
  MANAGE_CHANNELS: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_MESSAGES: 1 << 3,
  KICK_MEMBERS: 1 << 4,
  BAN_MEMBERS: 1 << 5,
  CREATE_INVITE: 1 << 6,
  SEND_MESSAGES: 1 << 7,
  READ_MESSAGES: 1 << 8,
  ATTACH_FILES: 1 << 9,
  ADD_REACTIONS: 1 << 10,
  MENTION_EVERYONE: 1 << 11,
  CONNECT_VOICE: 1 << 12,
  SPEAK_VOICE: 1 << 13,
  VIDEO: 1 << 14,
  SCREENSHARE: 1 << 15,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_GROUPS: { title: string; items: { key: PermissionKey; label: string; hint: string }[] }[] = [
  {
    title: "Общие",
    items: [
      { key: "MANAGE_SERVER", label: "Управление сервером", hint: "Имя, описание, иконка" },
      { key: "MANAGE_ROLES", label: "Управление ролями", hint: "Создание и редактирование ролей" },
      { key: "MANAGE_CHANNELS", label: "Управление каналами", hint: "Создание, редактирование, удаление" },
      { key: "CREATE_INVITE", label: "Создавать приглашения", hint: "Приглашать новых участников" },
    ],
  },
  {
    title: "Участники",
    items: [
      { key: "KICK_MEMBERS", label: "Исключать участников", hint: "" },
      { key: "BAN_MEMBERS", label: "Банить участников", hint: "" },
    ],
  },
  {
    title: "Сообщения",
    items: [
      { key: "READ_MESSAGES", label: "Читать сообщения", hint: "" },
      { key: "SEND_MESSAGES", label: "Отправлять сообщения", hint: "" },
      { key: "MANAGE_MESSAGES", label: "Управлять сообщениями", hint: "Удаление чужих сообщений" },
      { key: "ATTACH_FILES", label: "Прикреплять файлы", hint: "" },
      { key: "ADD_REACTIONS", label: "Добавлять реакции", hint: "" },
      { key: "MENTION_EVERYONE", label: "Упоминать @everyone", hint: "" },
    ],
  },
  {
    title: "Голос",
    items: [
      { key: "CONNECT_VOICE", label: "Подключаться к голосовым", hint: "" },
      { key: "SPEAK_VOICE", label: "Говорить в голосовых", hint: "" },
      { key: "VIDEO", label: "Видео", hint: "Включать камеру" },
      { key: "SCREENSHARE", label: "Демонстрация экрана", hint: "" },
    ],
  },
];

export function hasPerm(permissions: number, key: PermissionKey): boolean {
  return (permissions & PERMISSIONS[key]) !== 0;
}

export function togglePerm(permissions: number, key: PermissionKey): number {
  return permissions ^ PERMISSIONS[key];
}
