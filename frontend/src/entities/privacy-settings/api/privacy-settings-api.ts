import { requestJson } from "../../../shared/api";
import type { PrivacySettings } from "../model/types";

export async function fetchPrivacySettings(): Promise<PrivacySettings> {
  return requestJson<PrivacySettings>("/api/settings/privacy");
}

export async function updatePrivacySettings(settings: PrivacySettings): Promise<PrivacySettings> {
  return requestJson<PrivacySettings>("/api/settings/privacy", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
