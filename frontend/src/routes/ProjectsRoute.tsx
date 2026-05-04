import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, FolderKanban, Plus, Shapes } from "lucide-react";

import { fetchProjects } from "../api/projects";
import { AppShell } from "../components/templates/AppShell";
import type { Project } from "../types/projects";
import "./ProjectsRoute.css";

function projectField(value: string | null | undefined): string {
  return value?.trim() || "Не задано";
}

export function ProjectsRoute() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active").length,
    [projects],
  );

  useEffect(() => {
    let isCurrent = true;

    fetchProjects()
      .then((nextProjects) => {
        if (isCurrent) {
          setProjects(nextProjects);
          setError(undefined);
        }
      })
      .catch((reason) => {
        if (isCurrent) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить проекты.");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <AppShell>
      <div className="projects-route">
        <header className="projects-route__header">
          <div>
            <p className="projects-route__eyebrow">Orynvae</p>
            <h1>Проекты</h1>
          </div>
          <div className="projects-route__actions">
            <div className="projects-route__summary" aria-label="Сводка проектов">
              <span>
                <FolderKanban size={16} aria-hidden="true" />
                {projects.length}
              </span>
              <span>
                <BookOpen size={16} aria-hidden="true" />
                {activeProjects}
              </span>
            </div>
            <Link className="projects-route__create-link" to="/projects/create">
              <Plus size={16} aria-hidden="true" />
              Создать проект
            </Link>
          </div>
        </header>

        {error && <div className="projects-route__message is-error">{error}</div>}

        {loading && <div className="projects-route__empty">Загрузка проектов</div>}

        {!loading && !error && projects.length === 0 && (
          <div className="projects-route__empty">Проектов пока нет</div>
        )}

        {!loading && projects.length > 0 && (
          <section className="project-list" aria-label="Список проектов">
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card__title">
                  <Shapes size={18} aria-hidden="true" />
                  <h2>
                    <Link to={`/projects/${encodeURIComponent(project.id)}/workspace`}>
                      {project.name}
                    </Link>
                  </h2>
                </div>
                <dl className="project-card__meta">
                  <div>
                    <dt>Формат</dt>
                    <dd>{projectField(project.settings?.format)}</dd>
                  </div>
                  <div>
                    <dt>Жанр</dt>
                    <dd>{projectField(project.settings?.genre)}</dd>
                  </div>
                  <div>
                    <dt>Сеттинг</dt>
                    <dd>{projectField(project.settings?.setting)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}
