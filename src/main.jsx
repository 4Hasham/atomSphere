import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

// Sign-in happens inside the app (see src/auth/), against the Cognito user pool.
root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);