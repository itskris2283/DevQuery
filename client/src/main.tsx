import { createRoot } from "react-dom/client";
import React from 'react';
import App from "./App";
import "./index.css";

// Add debug logging
console.log("Starting app initialization...");
const rootElement = document.getElementById("root");
console.log("Root element found:", !!rootElement);

if (rootElement) {
  try {
    console.log("Initializing React root...");
    const root = createRoot(rootElement);
    console.log("Rendering App component...");
    root.render(<App />);
    console.log("App rendered successfully");
  } catch (error) {
    console.error("Error rendering app:", error);
  }
} else {
  console.error("Root element not found! The app cannot be mounted.");
}
