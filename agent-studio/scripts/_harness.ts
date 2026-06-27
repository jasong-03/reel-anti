/**
 * Test harness. The headless editor + health check now live in
 * `lib/twick/headless.ts` (so server code can reuse them); this module re-exports
 * them and adds the shared seed fixtures the scripts run against.
 */
import type { ProjectJSON } from "@twick/timeline";

export { makeNodeEditor, healthCheck, type HealthResult } from "../lib/twick/headless";

export const SEED_TITLES: ProjectJSON = {
  version: 1,
  tracks: [
    {
      id: "t-titles",
      name: "Titles",
      type: "element",
      elements: [
        { id: "e-clip1", trackId: "t-titles", name: "Clip One", type: "text", s: 0, e: 2, props: { text: "Clip One" } },
        { id: "e-clip2", trackId: "t-titles", name: "Clip Two", type: "text", s: 2, e: 4, props: { text: "Clip Two" } },
        { id: "e-clip3", trackId: "t-titles", name: "Clip Three", type: "text", s: 4, e: 6, props: { text: "Clip Three" } },
      ],
    },
  ],
} as ProjectJSON;
