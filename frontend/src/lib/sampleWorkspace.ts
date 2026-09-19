// PLACEHOLDER content for Overview sections that have no backend yet (team,
// integrations, milestone). It exists so the dashboard matches the design
// reference; swap each block for real data as the feature is built:
//   - team          -> needs real auth (multiple users)
//   - integrations  -> needs an integrations/connectors backend
//   - milestone     -> needs a milestones table
export const SAMPLE_TEAM = {
  total: 8,
  activeNow: 3,
  // shown avatars; the remainder renders as "+N"
  shown: [
    { initials: "CA", cls: "from-amber-200 to-orange-400" },
    { initials: "AO", cls: "from-rose-200 to-pink-400" },
    { initials: "TM", cls: "from-emerald-200 to-teal-400" },
    { initials: "SK", cls: "from-sky-200 to-blue-400" },
    { initials: "JD", cls: "from-violet-200 to-purple-400" },
  ],
};

export const SAMPLE_INTEGRATIONS = [
  { key: "github", name: "GitHub", logo: "/logos/github.svg", connected: true },
  { key: "linear", name: "Linear", logo: "/logos/linear.svg", connected: true },
  { key: "notion", name: "Notion", logo: "/logos/notion.svg", connected: true },
  { key: "slack", name: "Slack", logo: "/logos/slack.svg", connected: true },
];

export const SAMPLE_MILESTONE = { title: "Beta Release", date: "Oct 15, 2026" };

// Main Dashboard tiles (workspace level, placeholder until auth + integrations exist)
export const WORKSPACE_TEAM = { total: 4, online: 2 };
export const WORKSPACE_INTEGRATIONS = 6;
