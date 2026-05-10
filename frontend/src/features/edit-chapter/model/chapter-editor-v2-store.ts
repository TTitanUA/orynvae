import { create } from "zustand";

import type { DraftAssistActionKey } from "../../../entities/draft";
import type { EditorSelectionSnapshot } from "./editor-gateway";

export type ChapterEditorSuggestion = {
  id: string;
  actionKey: DraftAssistActionKey;
  scope: "selection" | "document";
  originalMarkdown: string;
  replacementMarkdown: string;
  rationale: string | null;
  warnings: string[];
  from: number;
  to: number;
};

type ChapterEditorV2Store = {
  activeActionKey: DraftAssistActionKey | null;
  dirty: boolean;
  markdown: string;
  savedMarkdown: string;
  selection: EditorSelectionSnapshot | null;
  suggestion: ChapterEditorSuggestion | null;
  setActiveActionKey: (activeActionKey: DraftAssistActionKey | null) => void;
  setLoadedMarkdown: (markdown: string) => void;
  setMarkdown: (markdown: string) => void;
  markSaved: (markdown: string) => void;
  setSelection: (selection: EditorSelectionSnapshot | null) => void;
  setSuggestion: (suggestion: ChapterEditorSuggestion | null) => void;
  reset: () => void;
};

export const useChapterEditorV2Store = create<ChapterEditorV2Store>()((set) => ({
  activeActionKey: null,
  dirty: false,
  markdown: "",
  savedMarkdown: "",
  selection: null,
  suggestion: null,
  setActiveActionKey: (activeActionKey) => set({ activeActionKey }),
  setLoadedMarkdown: (markdown) =>
    set({
      activeActionKey: null,
      dirty: false,
      markdown,
      savedMarkdown: markdown,
      selection: null,
      suggestion: null,
    }),
  setMarkdown: (markdown) =>
    set((state) => ({
      dirty: markdown !== state.savedMarkdown,
      markdown,
    })),
  markSaved: (markdown) =>
    set({
      dirty: false,
      markdown,
      savedMarkdown: markdown,
      suggestion: null,
    }),
  setSelection: (selection) => set({ selection }),
  setSuggestion: (suggestion) => set({ suggestion }),
  reset: () =>
    set({
      activeActionKey: null,
      dirty: false,
      markdown: "",
      savedMarkdown: "",
      selection: null,
      suggestion: null,
    }),
}));
