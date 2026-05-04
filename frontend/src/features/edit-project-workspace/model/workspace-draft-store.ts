import { create } from "zustand";

import type { ProjectWorkspace } from "../../../entities/project";

type WorkspaceDraftStore = {
  workspace?: ProjectWorkspace;
  savedWorkspace?: ProjectWorkspace;
  continuityText: string;
  setWorkspace: (
    workspace:
      | ProjectWorkspace
      | undefined
      | ((current: ProjectWorkspace | undefined) => ProjectWorkspace | undefined),
  ) => void;
  setSavedWorkspace: (workspace: ProjectWorkspace | undefined) => void;
  setWorkspaceFromServer: (workspace: ProjectWorkspace) => void;
  setContinuityText: (continuityText: string) => void;
};

export const useWorkspaceDraftStore = create<WorkspaceDraftStore>()((set) => ({
  workspace: undefined,
  savedWorkspace: undefined,
  continuityText: "",
  setWorkspace: (workspace) =>
    set((state) => ({
      workspace: typeof workspace === "function" ? workspace(state.workspace) : workspace,
    })),
  setSavedWorkspace: (savedWorkspace) => set({ savedWorkspace }),
  setWorkspaceFromServer: (workspace) => set({ workspace, savedWorkspace: workspace }),
  setContinuityText: (continuityText) => set({ continuityText }),
}));
