import { Navigate, useParams } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { ChaptersRoute } from "../../pages/projects/chapters/ChaptersRoute";
import { ChapterEditorRoute } from "../../pages/projects/chapter-editor/ChapterEditorRoute";
import { ChapterReviewRoute } from "../../pages/projects/chapter-review/ChapterReviewRoute";
import { ChapterPrepareRoute } from "../../pages/projects/chapter-prepare/ChapterPrepareRoute";
import { DraftAssemblyRoute } from "../../pages/projects/draft-assembly/DraftAssemblyRoute";
import { ForecastRoute } from "../../pages/projects/forecast/ForecastRoute";
import { NarratorSessionRoute } from "../../pages/projects/narrator-session/NarratorSessionRoute";
import { ProjectWorkspaceRoute } from "../../pages/projects/project-workspace/ProjectWorkspaceRoute";
import { StoryLineDetailRoute } from "../../pages/projects/story-lines/StoryLineDetailRoute";
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

export function StoryLineCreateRouteFromParams() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <StoryLineDetailRoute key={`story-line-new-${projectId}`} projectId={projectId} />;
}

export function StoryLineDetailRouteFromParams() {
  const { lineId, projectId } = useParams<{
    lineId: string;
    projectId: string;
  }>();

  if (!projectId || !lineId) {
    return <HomeRoute />;
  }

  return <StoryLineDetailRoute key={`story-line-${lineId}`} lineId={lineId} projectId={projectId} />;
}

export function ChaptersRouteFromParams() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <ChaptersRoute projectId={projectId} />;
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

export function NarratorSessionRouteFromParams() {
  const { projectId, sessionId } = useParams<{
    projectId: string;
    sessionId: string;
  }>();

  if (!projectId || !sessionId) {
    return <HomeRoute />;
  }

  return <NarratorSessionRoute projectId={projectId} sessionId={sessionId} />;
}

export function DraftAssemblyRouteFromParams() {
  const { projectId, sessionId } = useParams<{
    projectId: string;
    sessionId: string;
  }>();

  if (!projectId || !sessionId) {
    return <HomeRoute />;
  }

  return <DraftAssemblyRoute projectId={projectId} sessionId={sessionId} />;
}

export function ChapterReviewRouteFromParams() {
  const { chapterId, projectId } = useParams<{
    chapterId: string;
    projectId: string;
  }>();

  if (!projectId || !chapterId) {
    return <HomeRoute />;
  }

  return <ChapterReviewRoute chapterId={chapterId} projectId={projectId} />;
}

export function ChapterEditorRouteFromParams() {
  const { chapterId, projectId } = useParams<{
    chapterId: string;
    projectId: string;
  }>();

  if (!projectId || !chapterId) {
    return <HomeRoute />;
  }

  return <ChapterEditorRoute chapterId={chapterId} projectId={projectId} />;
}

export function ForecastRouteFromParams() {
  const { chapterId, projectId } = useParams<{
    chapterId: string;
    projectId: string;
  }>();

  if (!projectId || !chapterId) {
    return <HomeRoute />;
  }

  return <ForecastRoute chapterId={chapterId} projectId={projectId} />;
}
