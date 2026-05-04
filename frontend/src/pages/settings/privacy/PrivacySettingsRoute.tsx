import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  privacySettingsMutations,
  privacySettingsQueries,
  privacySettingsQueryKeys,
} from "../../../entities/privacy-settings";
import { projectQueryKeys } from "../../../entities/project";
import { SettingsLayout } from "../../../widgets/settings-layout";
import { PrivacySettingsPanel } from "./ui";

export function PrivacySettingsRoute() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(privacySettingsQueries.detail());
  const updateSettingsMutation = useMutation({
    ...privacySettingsMutations.update(),
    onSuccess: async (settings) => {
      queryClient.setQueryData(privacySettingsQueryKeys.detail(), settings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: privacySettingsQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectQueryKeys.all }),
      ]);
    },
  });

  return (
    <SettingsLayout eyebrow="Настройки" title="Приватность">
      <PrivacySettingsPanel
        showHiddenItems={settingsQuery.data?.show_hidden_items ?? false}
        onShowHiddenItemsChange={(showHiddenItems) =>
          updateSettingsMutation.mutate({ show_hidden_items: showHiddenItems })
        }
      />
    </SettingsLayout>
  );
}
