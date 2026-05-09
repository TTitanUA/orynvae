import type { DraftMode, DraftStatus } from "./types";

export const draftModeOptions: Array<{ value: DraftMode; label: string }> = [
  { value: "faithful", label: "Близко к событиям" },
  { value: "literary", label: "Более литературно" },
  { value: "shorter", label: "Короче" },
  { value: "expanded", label: "Подробнее" },
  { value: "dialogue_focus", label: "Фокус на диалог" },
  { value: "atmosphere_focus", label: "Фокус на атмосферу" },
];

export function draftModeLabel(value: DraftMode | string | null | undefined): string {
  return draftModeOptions.find((option) => option.value === value)?.label || "режим сборки";
}

export function draftStatusLabel(value: DraftStatus | string | null | undefined): string {
  switch (value) {
    case "generated":
      return "сгенерирован";
    case "edited":
      return "редактируется";
    case "accepted":
      return "принят";
    default:
      return "черновик";
  }
}
