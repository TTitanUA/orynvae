import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { AppShell } from "../../../widgets/app-shell";
import "./ProjectCreateRoute.css";

export function ProjectCreateRoute() {
  return (
    <AppShell>
      <div className="project-create-route">
        <header className="project-create-route__header">
          <div>
            <p className="project-create-route__eyebrow">Новый проект</p>
            <h1>Создание проекта</h1>
          </div>
          <Link className="project-create-route__back-link" to="/projects">
            <ChevronLeft size={16} aria-hidden="true" />
            Проекты
          </Link>
        </header>

        <section className="project-create-skeleton" aria-label="Каркас создания проекта">
          <div className="project-create-skeleton__bar" />
          <div className="project-create-skeleton__layout">
            <div className="project-create-skeleton__panel" />
            <div className="project-create-skeleton__panel" />
          </div>
          <div className="project-create-skeleton__footer" />
        </section>
      </div>
    </AppShell>
  );
}
