import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, useMatch } from "react-router-dom";
import { Feather, FolderKanban, Home, Settings, SlidersHorizontal } from "lucide-react";

import { ProjectAssistantModelSettingsModal } from "../../entities/project-ai-settings";
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
  const nestedProjectMatch = useMatch("/projects/:projectId/*");
  const rootProjectMatch = useMatch("/projects/:projectId");
  const projectMatch = nestedProjectMatch || rootProjectMatch;
  const projectId = projectMatch?.params.projectId;
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        {projectId && (
          <button
            aria-label="Модель ассистента"
            className="app-shell__project-settings"
            onClick={() => setSettingsOpen(true)}
            title="Модель ассистента"
            type="button"
          >
            <SlidersHorizontal size={21} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </aside>
      <main className="app-shell__main">{children}</main>
      {projectId && settingsOpen && (
        <ProjectAssistantModelSettingsModal
          onClose={() => setSettingsOpen(false)}
          open={settingsOpen}
          projectId={projectId}
        />
      )}
    </div>
  );
}
