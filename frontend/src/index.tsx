import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

rootElement.innerHTML = '<div style="padding:24px;font-family:Arial,sans-serif">Loading SynapseIQ...</div>';

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
} catch (error) {
  rootElement.innerHTML = `<div style="padding:24px;font-family:Arial,sans-serif;color:#a4161a">
    <h1>SynapseIQ failed to start</h1>
    <pre style="white-space:pre-wrap">${error instanceof Error ? error.message : String(error)}</pre>
  </div>`;
  throw error;
}
