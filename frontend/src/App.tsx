import { RouterProvider } from "react-router-dom";

import { router } from "./app/routes/router";

export function App() {
  return <RouterProvider router={router} />;
}
