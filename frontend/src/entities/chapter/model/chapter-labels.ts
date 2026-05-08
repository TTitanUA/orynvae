import type { ChapterPace, ChapterUserRole } from "./types";

export const chapterUserRoleOptions: Array<{ value: ChapterUserRole; label: string }> = [
  { value: "single_character", label: "Один персонаж" },
  { value: "multiple_characters", label: "Несколько персонажей" },
  { value: "author", label: "Я автор" },
  { value: "unknown", label: "Пока не знаю" },
];

export const chapterPaceOptions: Array<{ value: ChapterPace; label: string }> = [
  { value: "slow", label: "Медленный" },
  { value: "medium", label: "Средний" },
  { value: "fast", label: "Быстрый" },
  { value: "user_choice", label: "По выбору в сессии" },
];

export function chapterUserRoleLabel(role: string | null | undefined): string {
  return chapterUserRoleOptions.find((option) => option.value === role)?.label || "Пока не знаю";
}

export function chapterPaceLabel(pace: string | null | undefined): string {
  return chapterPaceOptions.find((option) => option.value === pace)?.label || "Не задан";
}
