import { createBrowserRouter, Navigate, useParams } from "react-router-dom";

import { HomeRoute } from "../../pages/home/HomeRoute";
import { ProjectCreateRoute } from "../../pages/projects/project-create/ProjectCreateRoute";
import { ProjectWorkspaceRoute } from "../../pages/projects/project-workspace/ProjectWorkspaceRoute";
import { ProjectsRoute } from "../../pages/projects/ProjectsRoute";
import { PrivacySettingsRoute } from "../../pages/settings/privacy/PrivacySettingsRoute";
import { ProviderSettingsRoute } from "../../pages/settings/providers/ProviderSettingsRoute";
import { SettingsRoute } from "../../pages/settings/SettingsRoute";

function ProjectWorkspaceRouteFromParams() {
  const { projectId, workspaceSection } = useParams<{
    projectId: string;
    workspaceSection: string;
  }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <ProjectWorkspaceRoute projectId={projectId} section={workspaceSection || "overview"} />;
}

function ProjectWorkspaceIndexRedirect() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <Navigate replace to={`/projects/${encodeURIComponent(projectId)}/workspace/overview`} />;
}

export const router = createBrowserRouter([
  { path: "/", element: <HomeRoute /> },
  { path: "/projects", element: <ProjectsRoute /> },
  { path: "/projects/create", element: <ProjectCreateRoute /> },
  { path: "/projects/:projectId/workspace", element: <ProjectWorkspaceIndexRedirect /> },
  {
    path: "/projects/:projectId/workspace/:workspaceSection",
    element: <ProjectWorkspaceRouteFromParams />,
  },
  { path: "/settings", element: <SettingsRoute /> },
  { path: "/settings/privacy", element: <PrivacySettingsRoute /> },
  { path: "/settings/providers", element: <ProviderSettingsRoute /> },
  { path: "*", element: <HomeRoute /> },
]);
