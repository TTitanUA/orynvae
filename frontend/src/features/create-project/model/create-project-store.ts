import { create } from "zustand";

import type { ProjectSetupAnalysis } from "../../../entities/project";

export type ProjectCreateDraft = {
  name: string;
  description: string;
  synopsis: string;
  genre: string;
  tone: string;
  setting: string;
  format: string;
  centralConflict: string;
  themes: string;
  directions: string[];
  selectedDirection: string;
  targetLength: string;
  pointOfView: string;
};

export const emptyProjectCreateDraft: ProjectCreateDraft = {
  name: "",
  description: "",
  synopsis: "",
  genre: "",
  tone: "",
  setting: "",
  format: "",
  centralConflict: "",
  themes: "",
  directions: [],
  selectedDirection: "",
  targetLength: "",
  pointOfView: "",
};

type CreateProjectStore = {
  ideaText: string;
  selectedProviderId: string;
  selectedModelId: string;
  draft: ProjectCreateDraft;
  setIdeaText: (ideaText: string) => void;
  setSelectedProviderId: (selectedProviderId: string) => void;
  setSelectedModelId: (selectedModelId: string) => void;
  setDraft: (draft: ProjectCreateDraft) => void;
  updateDraftField: <K extends keyof ProjectCreateDraft>(
    field: K,
    value: ProjectCreateDraft[K],
  ) => void;
  applyAnalysis: (analysis: ProjectSetupAnalysis) => void;
};

function draftFromAnalysis(analysis: ProjectSetupAnalysis): ProjectCreateDraft {
  return {
    name: analysis.title,
    description: analysis.description,
    synopsis: analysis.synopsis,
    genre: analysis.genre,
    tone: analysis.tone,
    setting: analysis.setting,
    format: analysis.format,
    centralConflict: analysis.central_conflict,
    themes: analysis.themes.join(", "),
    directions: analysis.directions,
    selectedDirection: analysis.directions[0] || "",
    targetLength: analysis.target_length || "",
    pointOfView: analysis.point_of_view || "",
  };
}

export const useCreateProjectStore = create<CreateProjectStore>()((set) => ({
  ideaText: "",
  selectedProviderId: "",
  selectedModelId: "",
  draft: emptyProjectCreateDraft,
  setIdeaText: (ideaText) => set({ ideaText }),
  setSelectedProviderId: (selectedProviderId) => set({ selectedProviderId }),
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
  setDraft: (draft) => set({ draft }),
  updateDraftField: (field, value) =>
    set((state) => ({ draft: { ...state.draft, [field]: value } })),
  applyAnalysis: (analysis) => set({ draft: draftFromAnalysis(analysis) }),
}));
