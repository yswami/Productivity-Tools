import { contextBridge, ipcRenderer } from "electron";
import { AppSettings, MeetingPlatform } from "./types";

contextBridge.exposeInMainWorld("meetingNotes", {
  snapshot: () => ipcRenderer.invoke("app:snapshot"),
  start: (title: string, platform: MeetingPlatform) => ipcRenderer.invoke("meeting:start", { title, platform }),
  stop: () => ipcRenderer.invoke("meeting:stop"),
  details: (id: string) => ipcRenderer.invoke("meeting:details", id),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke("settings:update", patch),
  checkForUpdates: () => ipcRenderer.invoke("app:check-updates"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  openFile: (file: string) => ipcRenderer.invoke("file:open", file),
  openFolder: (directory: string) => ipcRenderer.invoke("folder:open", directory),
  onSnapshot: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on("app:snapshot", listener);
    return () => ipcRenderer.removeListener("app:snapshot", listener);
  }
});
