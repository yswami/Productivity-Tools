interface DetectorStopInput {
  startedAutomatically: boolean;
  detectionMatches: boolean;
  absentSince: number;
  now: number;
  graceSeconds: number;
}

interface DetectorStopDecision {
  absentSince: number;
  shouldStop: boolean;
}

export function evaluateDetectorStop(input: DetectorStopInput): DetectorStopDecision {
  if (!input.startedAutomatically || input.detectionMatches) {
    return { absentSince: 0, shouldStop: false };
  }

  const absentSince = input.absentSince || input.now;
  return {
    absentSince,
    shouldStop: input.now - absentSince >= input.graceSeconds * 1000
  };
}
