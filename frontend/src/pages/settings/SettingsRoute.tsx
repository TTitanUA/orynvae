import { SettingsLayout } from "../../widgets/settings-layout";
import { SettingsOverviewPanel } from "./ui";

export function SettingsRoute() {
  return (
    <SettingsLayout eyebrow="Orynvae" title="Настройки">
      <SettingsOverviewPanel />
    </SettingsLayout>
  );
}
