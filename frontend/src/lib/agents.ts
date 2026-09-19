// Personas reused from prince-web-app's established team roster (Wendy Rhoades,
// Chief, Chloe O'Brien, Lisa, Sage — see src/Controllers/TeamController.php
// there), recast with generic roles for this project. Unlike prince-web-app,
// there's no per-agent chat backend here — picking one just presets the
// task_type sent to the router, which genuinely feeds routing/affinity
// scoring, rather than faking a status or chat history that doesn't exist.
export interface AgentPersona {
  key: string;
  name: string;
  role: string;
  taskType: string;
  avatarClass: string; // literal Tailwind class, not built dynamically
}

export const AGENTS: AgentPersona[] = [
  { key: "wendy", name: "Wendy", role: "Product & Operations", taskType: "product", avatarClass: "bg-rose-400" },
  { key: "chief", name: "Chief", role: "Architecture & Tech", taskType: "architecture", avatarClass: "bg-amber-500" },
  { key: "chloe", name: "Chloe", role: "Monitoring & Errors", taskType: "debugging", avatarClass: "bg-emerald-400" },
  { key: "lisa", name: "Lisa", role: "Customer Support", taskType: "support", avatarClass: "bg-purple-400" },
  { key: "sage", name: "Sage", role: "Research & Insights", taskType: "research", avatarClass: "bg-sky-400" },
];
