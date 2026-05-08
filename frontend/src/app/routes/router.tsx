import { createBrowserRouter } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { ProjectCreateRoute } from "../../pages/projects/project-create/ProjectCreateRoute";
import { ProjectsRoute } from "../../pages/projects/ProjectsRoute";
import { PrivacySettingsRoute } from "../../pages/settings/privacy/PrivacySettingsRoute";
import { ProviderSettingsRoute } from "../../pages/settings/providers/ProviderSettingsRoute";
import { SettingsRoute } from "../../pages/settings/SettingsRoute";
import {
  ChapterPrepareRouteFromParams,
  ProjectWorkspaceIndexRedirect,
  ProjectWorkspaceRouteFromParams,
  StoryLineCreateRouteFromParams,
  StoryLineDetailRouteFromParams,
  StoryLinesRouteFromParams,
} from "./route-components";

export const router = createBrowserRouter([
  { path: "/", element: <HomeRoute /> },
  { path: "/projects", element: <ProjectsRoute /> },
  { path: "/projects/create", element: <ProjectCreateRoute /> },
  { path: "/projects/:projectId", element: <ProjectWorkspaceRouteFromParams /> },
  { path: "/projects/:projectId/story-lines", element: <StoryLinesRouteFromParams /> },
  { path: "/projects/:projectId/story-lines/new", element: <StoryLineCreateRouteFromParams /> },
  { path: "/projects/:projectId/story-lines/:lineId", element: <StoryLineDetailRouteFromParams /> },
  { path: "/projects/:projectId/chapters/prepare", element: <ChapterPrepareRouteFromParams /> },
  { path: "/projects/:projectId/chapters/:chapterId/prepare", element: <ChapterPrepareRouteFromParams /> },
  { path: "/projects/:projectId/workspace", element: <ProjectWorkspaceIndexRedirect /> },
  {
    path: "/projects/:projectId/workspace/*",
    element: <ProjectWorkspaceIndexRedirect />,
  },
  { path: "/settings", element: <SettingsRoute /> },
  { path: "/settings/privacy", element: <PrivacySettingsRoute /> },
  { path: "/settings/providers", element: <ProviderSettingsRoute /> },
  { path: "*", element: <HomeRoute /> },
]);
