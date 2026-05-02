import { HomeRoute } from "./routes/HomeRoute";
import { ProviderSettingsRoute } from "./routes/ProviderSettingsRoute";
import { ProjectsRoute } from "./routes/ProjectsRoute";

export function App() {
  if (window.location.pathname === "/settings/providers") {
    return <ProviderSettingsRoute />;
  }

  if (window.location.pathname === "/projects" || window.location.pathname === "/projects/new") {
    return <ProjectsRoute />;
  }

  return <HomeRoute />;
}
