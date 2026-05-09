import type {
  ChapterReviewLineUpdateStatus,
  ChapterReviewNoteStatus,
  ChapterReviewNoteType,
  ChapterReviewStatus,
} from "./types";

export function chapterReviewStatusLabel(value: ChapterReviewStatus | string | null | undefined): string {
  switch (value) {
    case "applied":
      return "применен";
    case "pending":
      return "ожидает решений";
    default:
      return "разбор";
  }
}

export function chapterReviewLineStatusLabel(
  value: ChapterReviewLineUpdateStatus | string | null | undefined,
): string {
  switch (value) {
    case "accepted":
      return "принято";
    case "rejected":
      return "отклонено";
    case "deferred":
      return "отложено";
    default:
      return "ожидает";
  }
}

export function chapterReviewNoteStatusLabel(
  value: ChapterReviewNoteStatus | string | null | undefined,
): string {
  switch (value) {
    case "resolved":
      return "решено";
    case "rejected":
      return "отклонено";
    case "deferred":
      return "отложено";
    default:
      return "ожидает";
  }
}

export function chapterReviewNoteTypeLabel(value: ChapterReviewNoteType): string {
  return value === "contradiction" ? "Противоречие" : "Открытый вопрос";
}
