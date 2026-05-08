import type { StoryLineStatus, StoryLineType } from "./types";

export const storyLineTypeOptions: Array<{ value: StoryLineType; label: string }> = [
  { value: "character", label: "Герой" },
  { value: "mystery", label: "Тайна" },
  { value: "relationship", label: "Отношения" },
  { value: "threat", label: "Угроза" },
  { value: "theme", label: "Тема" },
  { value: "custom", label: "Своя" },
];

export const storyLineStatusOptions: Array<{ value: StoryLineStatus; label: string }> = [
  { value: "proposed", label: "AI-предложение" },
  { value: "active", label: "Активна" },
  { value: "sleeping", label: "Спит" },
  { value: "completed", label: "Завершена" },
  { value: "rejected", label: "Отклонена" },
];

export function storyLineTypeLabel(type: StoryLineType | string): string {
  return storyLineTypeOptions.find((option) => option.value === type)?.label || type;
}

export function storyLineStatusLabel(status: StoryLineStatus | string): string {
  return storyLineStatusOptions.find((option) => option.value === status)?.label || status;
}

export function storyLineStatusTone(status: StoryLineStatus): "neutral" | "ready" | "warning" | "danger" {
  if (status === "active") {
    return "ready";
  }
  if (status === "proposed" || status === "sleeping") {
    return "warning";
  }
  if (status === "rejected") {
    return "danger";
  }
  return "neutral";
}
