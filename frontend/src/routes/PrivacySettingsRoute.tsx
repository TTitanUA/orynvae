import { useShowHiddenItems } from "../privacySettings";
import { PrivacySettingsPanel } from "../components/organisms/PrivacySettingsPanel";
import { SettingsLayout } from "../components/templates/SettingsLayout";

export function PrivacySettingsRoute() {
  const [showHiddenItems, setShowHiddenItems] = useShowHiddenItems();

  return (
    <SettingsLayout eyebrow="Настройки" title="Приватность">
      <PrivacySettingsPanel
        showHiddenItems={showHiddenItems}
        onShowHiddenItemsChange={setShowHiddenItems}
      />
    </SettingsLayout>
  );
}
