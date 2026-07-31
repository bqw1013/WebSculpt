export default {
  id: "websculpt",
  name: "WebSculpt",
  description: "Self-evolving browser automation command library for OpenClaw",
  register() {
    // This plugin delivers WebSculpt through:
    // 1. package.json dependencies: websculpt CLI and @playwright/cli are installed automatically
    // 2. openclaw.plugin.json skills: four lifecycle skills are loaded into OpenClaw
    // Skills invoke the CLI via "npx websculpt", which resolves to the locally installed package.
  },
};
