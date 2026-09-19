// Shared across PerspectiveGrid and the admin registry view. Literal class
// names (not template-built) so Tailwind's static scan picks them up.
export const PROVIDER_ACCENT_BORDER: Record<string, string> = {
  anthropic: "border-t-accent-claude",
  openai: "border-t-accent-openai",
  gemini: "border-t-accent-gemini",
};

export const PROVIDER_ACCENT_DOT: Record<string, string> = {
  anthropic: "bg-accent-claude",
  openai: "bg-accent-openai",
  gemini: "bg-accent-gemini",
};
