import { Navigate, useParams } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { ProjectWorkspaceRoute } from "../../pages/projects/project-workspace/ProjectWorkspaceRoute";

export function ProjectWorkspaceRouteFromParams() {
  const { projectId } = useParams<{
    projectId: string;
  }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <ProjectWorkspaceRoute projectId={projectId} />;
}

export function ProjectWorkspaceIndexRedirect() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <Navigate replace to={`/projects/${encodeURIComponent(projectId)}`} />;
}
