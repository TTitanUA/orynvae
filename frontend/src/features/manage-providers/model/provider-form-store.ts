import { create } from "zustand";

import type { ProviderType } from "../../../entities/provider";

export type ProviderFormState = {
  type: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  isLocal: boolean;
  streamingEnabled: boolean;
  modelsPath: string;
  chatPath: string;
};

export const initialProviderForm: ProviderFormState = {
  type: "lmstudio",
  name: "LM Studio",
  baseUrl: "http://localhost:1234/v1",
  apiKey: "",
  isLocal: true,
  streamingEnabled: true,
  modelsPath: "/models",
  chatPath: "/chat/completions",
};

type ProviderFormStore = {
  form: ProviderFormState;
  setForm: (form: ProviderFormState | ((current: ProviderFormState) => ProviderFormState)) => void;
};

export const useProviderFormStore = create<ProviderFormStore>()((set) => ({
  form: initialProviderForm,
  setForm: (form) =>
    set((state) => ({
      form: typeof form === "function" ? form(state.form) : form,
    })),
}));
