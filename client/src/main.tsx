import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";
import { initSounds } from "./lib/sounds";
import { initBasicSounds } from "./lib/basic-sound";

// Initialize both sound systems
initSounds();
initBasicSounds();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Toaster />
  </>
);
