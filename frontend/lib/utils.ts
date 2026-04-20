import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMessageTime(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return `вчера в ${format(date, "HH:mm")}`;
  return format(date, "dd.MM.yyyy в HH:mm", { locale: ru });
}

export function avatarInitial(name: string): string {
  return (name || "?").trim()[0].toUpperCase();
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "online": return "var(--ok)";
    case "idle": return "var(--warn)";
    case "dnd": return "var(--danger)";
    default: return "var(--text-3)";
  }
}
