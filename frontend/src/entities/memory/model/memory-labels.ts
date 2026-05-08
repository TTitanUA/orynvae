import type { MemoryItemStatus, MemoryItemType } from "./types";

export const memoryTypeOptions: Array<{ value: MemoryItemType; label: string }> = [
  { value: "character", label: "Персонаж" },
  { value: "location", label: "Место" },
  { value: "item", label: "Предмет" },
  { value: "group", label: "Группа" },
  { value: "world_rule", label: "Правило мира" },
  { value: "mystery", label: "Тайна" },
  { value: "event", label: "Событие" },
  { value: "canon_fact", label: "Факт канона" },
  { value: "note", label: "Заметка" },
];

export const memoryStatusOptions: Array<{ value: MemoryItemStatus; label: string }> = [
  { value: "proposed", label: "AI-предложение" },
  { value: "draft", label: "Черновик" },
  { value: "canon", label: "Канон" },
  { value: "rejected", label: "Отклонено" },
  { value: "outdated", label: "Устарело" },
];

export function memoryTypeLabel(type: MemoryItemType | string): string {
  return memoryTypeOptions.find((option) => option.value === type)?.label || type;
}

export function memoryStatusLabel(status: MemoryItemStatus | string): string {
  return memoryStatusOptions.find((option) => option.value === status)?.label || status;
}

export function memoryStatusTone(status: MemoryItemStatus): "neutral" | "ready" | "warning" | "danger" {
  if (status === "canon") {
    return "ready";
  }
  if (status === "proposed" || status === "draft") {
    return "warning";
  }
  if (status === "rejected" || status === "outdated") {
    return "danger";
  }
  return "neutral";
}
