const MAX_PRIORITY = 100;

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function calculatePriority(impact: number, effort: number, confidence: number): number {
  const normalizedEffort = Math.max(effort, 0.5);
  const base = (impact * 10) / (normalizedEffort / 8);
  const priority = base * confidence;
  return Number(clamp(priority, 0, MAX_PRIORITY).toFixed(2));
}
