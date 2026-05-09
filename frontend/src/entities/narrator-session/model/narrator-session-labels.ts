import type { NarratorInputType } from "./types";

export const narratorInputOptions: Array<{ value: NarratorInputType; label: string }> = [
  { value: "action", label: "Действие" },
  { value: "dialogue", label: "Реплика" },
  { value: "author_command", label: "Автор" },
  { value: "note", label: "Заметка" },
];

export function narratorInputLabel(value: string): string {
  return narratorInputOptions.find((option) => option.value === value)?.label || value;
}

export function sessionStatusLabel(value: string): string {
  switch (value) {
    case "preparing":
      return "подготовлена";
    case "active":
      return "идет";
    case "paused":
      return "на паузе";
    case "completed":
      return "завершена";
    case "draft_ready":
      return "черновик готов";
    case "reviewed":
      return "разобрана";
    default:
      return value;
  }
}

export function actorLabel(value: string): string {
  switch (value) {
    case "ai":
      return "Рассказчик";
    case "user":
      return "Пользователь";
    case "system":
      return "Система";
    default:
      return value;
  }
}
