import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PoseSheet, { IconArt } from "./PoseSheet.jsx";
import "./styles.css";

const sheet = new URLSearchParams(location.search).get("sheet");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{sheet === "icon" ? <IconArt /> : sheet != null ? <PoseSheet /> : <App />}</React.StrictMode>
);
