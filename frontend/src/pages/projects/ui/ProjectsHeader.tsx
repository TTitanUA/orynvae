import { BookOpen, FolderKanban, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import "./ProjectsHeader.css";

type ProjectsHeaderProps = {
  activeProjects: number;
  totalProjects: number;
};

export function ProjectsHeader({ activeProjects, totalProjects }: ProjectsHeaderProps) {
  return (
    <header className="projects-header">
      <div>
        <p className="projects-header__eyebrow">Orynvae</p>
        <h1>Проекты</h1>
      </div>
      <div className="projects-header__actions">
        <div className="projects-header__summary" aria-label="Сводка проектов">
          <span>
            <FolderKanban size={16} aria-hidden="true" />
            {totalProjects}
          </span>
          <span>
            <BookOpen size={16} aria-hidden="true" />
            {activeProjects}
          </span>
        </div>
        <Link className="projects-header__create-link" to="/projects/create">
          <Plus size={16} aria-hidden="true" />
          Создать проект
        </Link>
      </div>
    </header>
  );
}
