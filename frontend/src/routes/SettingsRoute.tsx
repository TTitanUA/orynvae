import { SettingsOverviewPanel } from "../components/organisms/SettingsOverviewPanel";
import { SettingsLayout } from "../components/templates/SettingsLayout";

export function SettingsRoute() {
  return (
    <SettingsLayout eyebrow="Orynvae" title="Настройки">
      <SettingsOverviewPanel />
    </SettingsLayout>
  );
}
