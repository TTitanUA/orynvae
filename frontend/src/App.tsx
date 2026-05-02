import { HomeRoute } from "./routes/HomeRoute";
import { ProjectWorkspaceRoute } from "./routes/ProjectWorkspaceRoute";
import { ProviderSettingsRoute } from "./routes/ProviderSettingsRoute";
import { ProjectsRoute } from "./routes/ProjectsRoute";

export function App() {
  const workspaceMatch = window.location.pathname.match(/^\/projects\/([^/]+)\/workspace$/);
  if (workspaceMatch) {
    return <ProjectWorkspaceRoute projectId={decodeURIComponent(workspaceMatch[1])} />;
  }

  if (window.location.pathname === "/settings/providers") {
    return <ProviderSettingsRoute />;
  }

  if (window.location.pathname === "/projects" || window.location.pathname === "/projects/new") {
    return <ProjectsRoute />;
  }

  return <HomeRoute />;
}
