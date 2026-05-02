import type { ReactNode } from "react";

import "./AppShell.css";

type AppShellProps = {
  children: ReactNode;
  currentPath?: string;
};

export function AppShell({ children, currentPath = "/" }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="Разделы Orynvae">
        <div className="app-shell__brand">
          <span>Orynvae</span>
          <small>local authoring workspace</small>
        </div>
        <nav className="app-shell__nav">
          <a href="/" aria-current={currentPath === "/" ? "page" : undefined}>
            Обзор
          </a>
          <a href="/projects">Проекты</a>
          <a
            href="/settings/providers"
            aria-current={currentPath === "/settings/providers" ? "page" : undefined}
          >
            AI-провайдеры
          </a>
        </nav>
      </aside>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
