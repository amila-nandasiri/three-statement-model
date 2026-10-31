// Chart colours (categorical slots validated for colour-vision deficiency)
import type { ScenarioKey } from "./model";

export const SCENARIO_COLOR: Record<ScenarioKey, string> = { base: "#2a78d6", downside: "#eb6834", upside: "#1baf7a" };

export const C = {
  revenue: "#2a78d6",
  ebitda: "#eb6834",
  cash: "#2a78d6",
  revolver: "#eb6834",
  reference: "#71717a",
  grid: "#e4e4e7",
  axis: "#71717a"
};
