import { useEffect, useState } from "react";

const PRIVACY_SETTINGS_EVENT = "orynvae:privacy-settings-change";

export type PrivacySettings = {
  show_hidden_items: boolean;
};

export async function fetchPrivacySettings(): Promise<PrivacySettings> {
  const response = await fetch("/api/settings/privacy", {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(response.statusText || "Privacy settings could not be loaded.");
  }
  return response.json() as Promise<PrivacySettings>;
}

export async function updatePrivacySettings(settings: PrivacySettings): Promise<PrivacySettings> {
  const response = await fetch("/api/settings/privacy", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(response.statusText || "Privacy settings could not be saved.");
  }
  const saved = (await response.json()) as PrivacySettings;
  window.dispatchEvent(new Event(PRIVACY_SETTINGS_EVENT));
  return saved;
}

export function useShowHiddenItems(): readonly [boolean, (value: boolean) => void] {
  const [showHiddenItems, setShowHiddenItems] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function refresh() {
      const settings = await fetchPrivacySettings();
      if (isCurrent) {
        setShowHiddenItems(settings.show_hidden_items);
      }
    }

    void refresh();
    window.addEventListener(PRIVACY_SETTINGS_EVENT, refresh);
    return () => {
      isCurrent = false;
      window.removeEventListener(PRIVACY_SETTINGS_EVENT, refresh);
    };
  }, []);

  function update(value: boolean) {
    setShowHiddenItems(value);
    void updatePrivacySettings({ show_hidden_items: value }).catch(() => {
      setShowHiddenItems(!value);
    });
  }

  return [showHiddenItems, update] as const;
}
