import { describe, expect, it } from "vitest";
import { buildInferencePrompt } from "./agent.js";

describe("buildInferencePrompt", () => {
  it("frames project files as untrusted evidence", () => {
    const prompt = buildInferencePrompt([
      {
        path: "README.md",
        bytes: 12,
        redactions: 0,
        reason: "readme",
        content: "Support desk workflow",
      },
    ]);
    expect(prompt).toContain("untrusted evidence");
    expect(prompt).toContain("strict JSON only");
    expect(prompt).toContain("README.md");
  });
});

