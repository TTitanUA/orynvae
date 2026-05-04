import { createBrowserRouter } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { ProjectCreateRoute } from "../../pages/projects/project-create/ProjectCreateRoute";
import { ProjectsRoute } from "../../pages/projects/ProjectsRoute";
import { PrivacySettingsRoute } from "../../pages/settings/privacy/PrivacySettingsRoute";
import { ProviderSettingsRoute } from "../../pages/settings/providers/ProviderSettingsRoute";
import { SettingsRoute } from "../../pages/settings/SettingsRoute";
import {
  CharacterFormRouteFromParams,
  CharacterListRouteFromParams,
  ProjectWorkspaceIndexRedirect,
  ProjectWorkspaceRouteFromParams,
} from "./route-components";

export const router = createBrowserRouter([
  { path: "/", element: <HomeRoute /> },
  { path: "/projects", element: <ProjectsRoute /> },
  { path: "/projects/create", element: <ProjectCreateRoute /> },
  { path: "/projects/:projectId/workspace", element: <ProjectWorkspaceIndexRedirect /> },
  {
    path: "/projects/:projectId/workspace/characters",
    element: <CharacterListRouteFromParams />,
  },
  {
    path: "/projects/:projectId/workspace/characters/create",
    element: <CharacterFormRouteFromParams />,
  },
  {
    path: "/projects/:projectId/workspace/characters/:characterId/edit",
    element: <CharacterFormRouteFromParams />,
  },
  {
    path: "/projects/:projectId/workspace/:workspaceSection",
    element: <ProjectWorkspaceRouteFromParams />,
  },
  { path: "/settings", element: <SettingsRoute /> },
  { path: "/settings/privacy", element: <PrivacySettingsRoute /> },
  { path: "/settings/providers", element: <ProviderSettingsRoute /> },
  { path: "*", element: <HomeRoute /> },
]);
