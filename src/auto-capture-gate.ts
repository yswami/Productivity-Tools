export class AutoCaptureGate {
  private blockedKey = "";
  private reason = "";

  observe(detectionKey: string): void {
    if (!detectionKey || (this.blockedKey && detectionKey !== this.blockedKey)) this.clear();
  }

  canAttempt(detectionKey: string): boolean {
    return Boolean(detectionKey) && detectionKey !== this.blockedKey;
  }

  block(detectionKey: string, reason: string): void {
    this.blockedKey = detectionKey;
    this.reason = reason;
  }

  get pausedReason(): string | undefined {
    return this.blockedKey ? this.reason : undefined;
  }

  clear(): void {
    this.blockedKey = "";
    this.reason = "";
  }
}
