import "./lib/react-scan";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { GraphicsModeProvider } from "./lib/graphics-mode";
import { ThemeProvider } from "./lib/useTheme";
import "./index.css";
import "./theme-bridge.css";
import "./app.css";
import "./sections.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element for bso-site bootstrap.");
}

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      <GraphicsModeProvider>
        <App />
      </GraphicsModeProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
