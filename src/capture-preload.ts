import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("captureBridge", {
  ready: () => ipcRenderer.send("capture:ready"),
  onStart: (callback: (options: unknown) => void) => ipcRenderer.on("capture:start", (_event, options) => callback(options)),
  onStop: (callback: (options: unknown) => void) => ipcRenderer.on("capture:stop", (_event, options) => callback(options)),
  chunk: (sessionId: string, data: ArrayBuffer) => ipcRenderer.send("capture:chunk", sessionId, data),
  started: (payload: unknown) => ipcRenderer.send("capture:started", payload),
  stopped: (payload: unknown) => ipcRenderer.send("capture:stopped", payload),
  error: (sessionId: string, message: string) => ipcRenderer.send("capture:error", sessionId, message)
});
