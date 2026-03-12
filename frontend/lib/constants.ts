/**
 * Shared visual constants used across the frontend.
 */

/** Primary brand color (lobster red/orange). */
export const BRAND_COLOR = "#c84a20";

/**
 * 15-color palette for distinguishing agents in visualizations.
 * First color is the brand color. Wraps around via getAgentColor().
 */
export const AGENT_COLORS = [
  "#c84a20", "#2a6fb0", "#9b3a8a", "#1a8a50", "#6b4ac8",
  "#c43030", "#0a8a9a", "#b07a10", "#b0306a", "#0a7a5a",
  "#4a4ac0", "#c06010", "#0a8a6a", "#8a3ac0", "#5a8a10",
];

/** Get a color for an agent by index (wraps around). */
export function getAgentColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length];
}
