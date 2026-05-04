import { create } from "zustand";

import type { ChapterAiAction, ChapterEditorState } from "../../../entities/project";

type ChapterEditorStore = {
  editor?: ChapterEditorState;
  savedEditor?: ChapterEditorState;
  selectedChapterId?: string;
  selectedSceneId?: string;
  persona: string;
  instructions: string;
  selection: string;
  action: ChapterAiAction;
  suggestion: string;
  aiProviderId: string;
  aiModelId: string;
  setEditor: (
    editor:
      | ChapterEditorState
      | undefined
      | ((current: ChapterEditorState | undefined) => ChapterEditorState | undefined),
  ) => void;
  setSavedEditor: (savedEditor: ChapterEditorState | undefined) => void;
  setEditorFromServer: (editor: ChapterEditorState) => void;
  setSelectedChapterId: (selectedChapterId: string | undefined) => void;
  setSelectedSceneId: (selectedSceneId: string | undefined) => void;
  setPersona: (persona: string) => void;
  setInstructions: (instructions: string) => void;
  setSelection: (selection: string) => void;
  setAction: (action: ChapterAiAction) => void;
  setSuggestion: (suggestion: string | ((current: string) => string)) => void;
  setAiProviderId: (aiProviderId: string) => void;
  setAiModelId: (aiModelId: string) => void;
};

export const useChapterEditorStore = create<ChapterEditorStore>()((set) => ({
  editor: undefined,
  savedEditor: undefined,
  selectedChapterId: undefined,
  selectedSceneId: undefined,
  persona: "Development editor focused on continuity and character arcs.",
  instructions: "",
  selection: "",
  action: "continue",
  suggestion: "",
  aiProviderId: "",
  aiModelId: "",
  setEditor: (editor) =>
    set((state) => ({
      editor: typeof editor === "function" ? editor(state.editor) : editor,
    })),
  setSavedEditor: (savedEditor) => set({ savedEditor }),
  setEditorFromServer: (editor) => set({ editor, savedEditor: editor }),
  setSelectedChapterId: (selectedChapterId) => set({ selectedChapterId }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setPersona: (persona) => set({ persona }),
  setInstructions: (instructions) => set({ instructions }),
  setSelection: (selection) => set({ selection }),
  setAction: (action) => set({ action }),
  setSuggestion: (suggestion) =>
    set((state) => ({
      suggestion: typeof suggestion === "function" ? suggestion(state.suggestion) : suggestion,
    })),
  setAiProviderId: (aiProviderId) => set({ aiProviderId }),
  setAiModelId: (aiModelId) => set({ aiModelId }),
}));
