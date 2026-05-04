import { Navigate, useParams } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { CharacterFormRoute } from "../../pages/projects/characters/CharacterFormRoute";
import { CharacterListRoute } from "../../pages/projects/characters/CharacterListRoute";
import { ProjectWorkspaceRoute } from "../../pages/projects/project-workspace/ProjectWorkspaceRoute";

export function ProjectWorkspaceRouteFromParams() {
  const { projectId, workspaceSection } = useParams<{
    projectId: string;
    workspaceSection: string;
  }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <ProjectWorkspaceRoute projectId={projectId} section={workspaceSection || "overview"} />;
}

export function ProjectWorkspaceIndexRedirect() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <Navigate replace to={`/projects/${encodeURIComponent(projectId)}/workspace/overview`} />;
}

export function CharacterListRouteFromParams() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <CharacterListRoute projectId={projectId} />;
}

export function CharacterFormRouteFromParams() {
  const { projectId, characterId } = useParams<{ projectId: string; characterId?: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <CharacterFormRoute projectId={projectId} characterId={characterId} />;
}
