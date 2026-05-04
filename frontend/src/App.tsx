import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";

import { HomeRoute } from "./routes/HomeRoute";
import { ProjectCreateRoute } from "./routes/ProjectCreateRoute";
import { ProjectWorkspaceRoute } from "./routes/ProjectWorkspaceRoute";
import { PrivacySettingsRoute } from "./routes/PrivacySettingsRoute";
import { ProviderSettingsRoute } from "./routes/ProviderSettingsRoute";
import { ProjectsRoute } from "./routes/ProjectsRoute";
import { SettingsRoute } from "./routes/SettingsRoute";

function ProjectWorkspaceRouteFromParams() {
  const { projectId, workspaceSection } = useParams<{ projectId: string; workspaceSection: string }>();

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

export function App() {
  return <RouterProvider router={router} />;
}

const router = createBrowserRouter([
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
