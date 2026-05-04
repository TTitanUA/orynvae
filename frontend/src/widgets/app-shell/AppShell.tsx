import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

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
          <NavLink to="/" end>
            Обзор
          </NavLink>
          <NavLink to="/projects">Проекты</NavLink>
          <NavLink to="/settings">Настройки</NavLink>
        </nav>
      </aside>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
