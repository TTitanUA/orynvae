import { Shapes } from "lucide-react";
import { Link } from "react-router-dom";

import type { Project } from "../../../entities/project";
import "./ProjectList.css";

type ProjectListProps = {
  projects: Project[];
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function ProjectList({ projects }: ProjectListProps) {
  return (
    <section className="project-list" aria-label="Список проектов">
      {projects.map((project) => (
        <article className="project-card" key={project.id}>
          <div className="project-card__title">
            <Shapes size={18} aria-hidden="true" />
            <h2>
              <Link to={`/projects/${encodeURIComponent(project.id)}`}>{project.title}</Link>
            </h2>
            {project.is_hidden && <span className="project-card__hidden">Скрыт</span>}
          </div>
          {project.synopsis && <p className="project-card__synopsis">{project.synopsis}</p>}
          <dl className="project-card__meta">
            <div>
              <dt>Статус</dt>
              <dd>{project.status}</dd>
            </div>
            <div>
              <dt>Видимость</dt>
              <dd>{project.is_hidden ? "скрытый" : "обычный"}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd className="project-card__id">{project.id}</dd>
            </div>
            <div>
              <dt>Обновлен</dt>
              <dd>{formatTimestamp(project.updated_at)}</dd>
            </div>
            <div>
              <dt>Создан</dt>
              <dd>{formatTimestamp(project.created_at)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </section>
  );
}
