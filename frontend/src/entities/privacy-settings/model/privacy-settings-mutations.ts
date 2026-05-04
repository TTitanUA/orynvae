import { mutationOptions } from "@tanstack/react-query";

import { updatePrivacySettings } from "../api/privacy-settings-api";
import type { PrivacySettings } from "./types";

export const privacySettingsMutations = {
  update: () =>
    mutationOptions({
      mutationKey: ["privacy-settings", "update"] as const,
      mutationFn: (settings: PrivacySettings) => updatePrivacySettings(settings),
    }),
};
