import { EyeOff, Shapes } from "lucide-react";
import { Link } from "react-router-dom";

import type { Project } from "../../types/projects";
import "./ProjectList.css";

type ProjectListProps = {
  projects: Project[];
};

function projectField(value: string | null | undefined): string {
  return value?.trim() || "Не задано";
}

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <section className="project-list" aria-label="Список проектов">
      {projects.map((project) => (
        <article className="project-card" key={project.id}>
          <div className="project-card__title">
            <Shapes size={18} aria-hidden="true" />
            <h2>
              <Link to={`/projects/${encodeURIComponent(project.id)}/workspace/overview`}>
                {project.name}
              </Link>
            </h2>
            {project.is_hidden && (
              <span className="project-card__hidden" title="Скрытый проект">
                <EyeOff size={14} aria-hidden="true" />
              </span>
            )}
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
  );
}
