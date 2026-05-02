import { HomeRoute } from "./routes/HomeRoute";
import { ProviderSettingsRoute } from "./routes/ProviderSettingsRoute";

export function App() {
  if (window.location.pathname === "/settings/providers") {
    return <ProviderSettingsRoute />;
  }

  return <HomeRoute />;
}
