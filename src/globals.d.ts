export {};

declare global {
  interface Window {
    meetingNotes: {
      snapshot(): Promise<unknown>;
      start(title: string, platform: string): Promise<unknown>;
      stop(): Promise<unknown>;
      details(id: string): Promise<unknown>;
      updateSettings(patch: unknown): Promise<unknown>;
      checkForUpdates(): Promise<unknown>;
      openExternal(url: string): Promise<unknown>;
      openFile(file: string): Promise<unknown>;
      openFolder(directory: string): Promise<unknown>;
      onSnapshot(callback: (snapshot: unknown) => void): () => void;
    };
    captureBridge: {
      ready(): void;
      onStart(callback: (options: any) => void): void;
      onStop(callback: (options: any) => void): void;
      chunk(sessionId: string, data: ArrayBuffer): void;
      started(payload: unknown): void;
      stopped(payload: unknown): void;
      error(sessionId: string, message: string): void;
    };
  }
}
