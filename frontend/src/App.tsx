import { BrowserRouter, Route, Routes, useParams } from "react-router-dom";

import { HomeRoute } from "./routes/HomeRoute";
import { ProjectWorkspaceRoute } from "./routes/ProjectWorkspaceRoute";
import { ProviderSettingsRoute } from "./routes/ProviderSettingsRoute";
import { ProjectsRoute } from "./routes/ProjectsRoute";

function ProjectWorkspaceRouteFromParams() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <HomeRoute />;
  }

  return <ProjectWorkspaceRoute projectId={projectId} />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/projects" element={<ProjectsRoute />} />
        <Route path="/projects/new" element={<ProjectsRoute />} />
        <Route path="/projects/:projectId/workspace" element={<ProjectWorkspaceRouteFromParams />} />
        <Route path="/settings/providers" element={<ProviderSettingsRoute />} />
        <Route path="*" element={<HomeRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
