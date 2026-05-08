import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Feather, FolderKanban, Home, Settings } from "lucide-react";

import "./AppShell.css";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { to: "/", label: "Обзор", icon: Home, end: true },
  { to: "/projects", label: "Проекты", icon: FolderKanban },
  { to: "/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar" aria-label="Разделы Orynvae">
        <div className="app-shell__brand" aria-label="Orynvae" title="Orynvae">
          <Feather size={21} strokeWidth={2} aria-hidden="true" />
        </div>
        <nav className="app-shell__nav" aria-label="Основная навигация">
          {navItems.map(({ end, icon: Icon, label, to }) => (
            <NavLink aria-label={label} end={end} key={to} title={label} to={to}>
              <Icon size={21} strokeWidth={2} aria-hidden="true" />
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
