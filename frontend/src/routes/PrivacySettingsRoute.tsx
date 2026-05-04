import { useShowHiddenItems } from "../privacySettings";
import { AppShell } from "../components/templates/AppShell";
import "./SettingsRoute.css";

export function PrivacySettingsRoute() {
  const [showHiddenItems, setShowHiddenItems] = useShowHiddenItems();

  return (
    <AppShell>
      <div className="privacy-route">
        <header className="privacy-route__header">
          <p className="privacy-route__eyebrow">Настройки</p>
          <h1>Приватность</h1>
        </header>

        <label className="privacy-toggle">
          <span>Показать скрытые элементы</span>
          <input
            checked={showHiddenItems}
            name="show-hidden-items"
            onChange={(event) => setShowHiddenItems(event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>
    </AppShell>
  );
}
