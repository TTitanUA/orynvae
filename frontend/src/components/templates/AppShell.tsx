import type { ReactNode } from "react";

import "./AppShell.css";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="Разделы Orynvae">
        <div className="app-shell__brand">
          <span>Orynvae</span>
          <small>local authoring workspace</small>
        </div>
        <nav className="app-shell__nav">
          <a href="/" aria-current="page">
            Обзор
          </a>
          <a href="/projects">Проекты</a>
          <a href="/settings/providers">AI-провайдеры</a>
        </nav>
      </aside>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}

