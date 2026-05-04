import { LabeledCheckbox } from "../../../../shared/ui";
import "./PrivacySettingsPanel.css";

type PrivacySettingsPanelProps = {
  showHiddenItems: boolean;
  onShowHiddenItemsChange: (showHiddenItems: boolean) => void;
};

export function PrivacySettingsPanel({
  showHiddenItems,
  onShowHiddenItemsChange,
}: PrivacySettingsPanelProps) {
  return (
    <section className="privacy-settings-panel" aria-label="Настройки приватности">
      <LabeledCheckbox
        checked={showHiddenItems}
        label="Показать скрытые элементы"
        name="show-hidden-items"
        onChange={onShowHiddenItemsChange}
      />
    </section>
  );
}
