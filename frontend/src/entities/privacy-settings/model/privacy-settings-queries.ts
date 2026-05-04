import { queryOptions } from "@tanstack/react-query";

import { fetchPrivacySettings } from "../api/privacy-settings-api";
import { privacySettingsQueryKeys } from "./privacy-settings-query-keys";

export const privacySettingsQueries = {
  detail: () =>
    queryOptions({
      queryKey: privacySettingsQueryKeys.detail(),
      queryFn: fetchPrivacySettings,
    }),
};
