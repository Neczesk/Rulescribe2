import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./util/dayjsSetup";
import App from "./app/App.tsx";

// The pre-paint color scheme resolver lives in index.html (runs before this
// bundle loads); MantineProvider's defaultColorScheme="auto" takes over after.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
