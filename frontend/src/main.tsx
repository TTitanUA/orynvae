import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AppProviders } from "./app/providers/app-providers";
import { initializeFrontendDebugLogging } from "./debugLogging";
import "./app/styles/global.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

function renderApp(): void {
  createRoot(rootElement!).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}

void initializeFrontendDebugLogging().finally(renderApp);
