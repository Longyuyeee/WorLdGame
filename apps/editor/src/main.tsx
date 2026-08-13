import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioLauncher } from "./studio-launcher";
import "./styles/tokens.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <StudioLauncher />
  </StrictMode>
);
