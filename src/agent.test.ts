import { describe, expect, it } from "vitest";
import { buildInferencePrompt, parseInferenceEnvelope, runCommandAgent } from "./agent.js";

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

describe("parseInferenceEnvelope", () => {
  it("parses direct structured JSON", () => {
    const envelope = parseInferenceEnvelope('{"schemaVersion":"inference.v1","status":"needs_decision"}');
    expect(envelope.status).toBe("needs_decision");
  });

  it("parses Claude structured_output envelopes", () => {
    const envelope = parseInferenceEnvelope(
      '{"structured_output":{"schemaVersion":"inference.v1","status":"ok","brief":"done"}}',
    );
    expect(envelope.status).toBe("ok");
    expect(envelope.brief).toBe("done");
  });
});

describe("runCommandAgent", () => {
  it("returns an inference error when the command is missing", async () => {
    const envelope = await runCommandAgent({
      command: "definitely-not-a-real-dds-agent",
      args: [],
      cwd: process.cwd(),
      prompt: "{}",
      timeoutMs: 1000,
    });

    expect(envelope.status).toBe("error");
    expect(envelope.error).toContain("spawn definitely-not-a-real-dds-agent ENOENT");
  });
});
