import type { OutcomeDirection } from '@/lib/schemas/outcomeSchema';

/**
 * Pure function to assemble outcome text from components
 * Deterministic - same inputs always produce same output
 *
 * Formula:
 * - Launch/Ship: "{Direction} {object} by {metric} through {clarifier}"
 * - Others: "{Direction} the {object} by {metric} through {clarifier}"
 *
 * @param outcome - Object containing direction, object, metric, clarifier
 * @returns Assembled outcome text with proper grammar
 *
 * @example
 * assembleOutcome({
 *   direction: 'increase',
 *   object: 'monthly recurring revenue',
 *   metric: '25% within 6 months',
 *   clarifier: 'enterprise customer acquisition'
 * })
 * // Returns: "Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"
 *
 * @example
 * assembleOutcome({
 *   direction: 'launch',
 *   object: 'beta product to 50 users',
 *   metric: 'by Q2',
 *   clarifier: 'targeted outreach'
 * })
 * // Returns: "Launch beta product to 50 users by by Q2 through targeted outreach"
 */
export function assembleOutcome(outcome: {
  direction: OutcomeDirection;
  object: string;
  metric: string;
  clarifier: string;
}): string {
  const { direction, object, metric, clarifier } = outcome;

  // Capitalize first letter of direction
  const capitalizedDirection = capitalize(direction);

  // For Launch/Ship: omit "the" article for natural phrasing
  if (direction === 'launch' || direction === 'ship') {
    return `${capitalizedDirection} ${object} by ${metric} through ${clarifier}`.trim();
  }

  // For Increase/Decrease/Maintain: include "the" article
  return `${capitalizedDirection} the ${object} by ${metric} through ${clarifier}`.trim();
}

/**
 * Capitalize first letter of a string
 * @param str - String to capitalize
 * @returns String with first letter capitalized
 */
function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Validate assembled outcome text length
 * Prevents excessively long outcomes from UI bugs or malicious input
 *
 * @param assembledText - The assembled outcome text
 * @returns true if length is acceptable (< 500 chars)
 */
export function validateAssembledLength(assembledText: string): boolean {
  return assembledText.length > 0 && assembledText.length <= 500;
}
