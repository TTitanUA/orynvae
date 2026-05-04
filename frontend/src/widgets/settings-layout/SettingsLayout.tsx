import type { ReactNode } from "react";

import { AppShell } from "../app-shell";
import "./SettingsLayout.css";

type SettingsLayoutProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
};

export function SettingsLayout({ children, eyebrow, title }: SettingsLayoutProps) {
  return (
    <AppShell>
      <div className="settings-layout">
        <header className="settings-layout__header">
          <p className="settings-layout__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </header>
        {children}
      </div>
    </AppShell>
  );
}
