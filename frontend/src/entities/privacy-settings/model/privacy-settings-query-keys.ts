export const privacySettingsQueryKeys = {
  all: ["privacy-settings"] as const,
  detail: () => [...privacySettingsQueryKeys.all, "detail"] as const,
};
