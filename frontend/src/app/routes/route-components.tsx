import { Navigate, useParams } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { ChapterPrepareRoute } from "../../pages/projects/chapter-prepare/ChapterPrepareRoute";
import { ProjectWorkspaceRoute } from "../../pages/projects/project-workspace/ProjectWorkspaceRoute";
import { StoryLinesRoute } from "../../pages/projects/story-lines/StoryLinesRoute";

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

export function StoryLinesRouteFromParams() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <StoryLinesRoute projectId={projectId} />;
}

export function ChapterPrepareRouteFromParams() {
  const { chapterId, projectId } = useParams<{
    chapterId?: string;
    projectId: string;
  }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <ChapterPrepareRoute chapterId={chapterId} projectId={projectId} />;
}
