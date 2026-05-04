import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { TestQueryClientProvider } from "./query-client";

export function renderWithProviders(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, { wrapper: TestQueryClientProvider, ...options });
}
