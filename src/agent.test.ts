import { describe, expect, it } from "vitest";
import { buildInferencePrompt, doctorAgentWithRunner, parseInferenceEnvelope, runCommandAgent } from "./agent.js";

function makeDoctorRunner(options: {
  commands: Record<string, { status: number; stdout?: string; stderr?: string }>;
  env?: Record<string, string>;
  existingPaths?: string[];
}) {
  return {
    env: options.env ?? {},
    existsSync: (filePath: string) => (options.existingPaths ?? []).includes(filePath),
    homedir: () => "/home/tester",
    spawnSync: (command: string, args: string[]) =>
      options.commands[[command, ...args].join(" ")] ?? {
        status: 1,
        stdout: "",
        stderr: `${command} ${args.join(" ")} failed`,
      },
  };
}

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

describe("doctorAgent", () => {
  it("reports the auto-selected adapter, structured output support, and auth state", () => {
    const result = doctorAgentWithRunner(
      "auto",
      makeDoctorRunner({
        commands: {
          "which codex": { status: 0, stdout: "/usr/local/bin/codex\n" },
          "codex --version": { status: 0, stdout: "codex 1.2.3\n" },
          "codex exec --help": { status: 0, stdout: "Usage: codex exec --output-schema --output-last-message\n" },
        },
        existingPaths: ["/home/tester/.codex/auth.json"],
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.detail).toContain("Auto selected codex");
    expect(result.detail).toContain("Structured JSON: supported");
    expect(result.detail).toContain("Auth: Codex auth/config file detected");
  });

  it("fails with a clear next action when the requested adapter is not installed", () => {
    const result = doctorAgentWithRunner(
      "codex",
      makeDoctorRunner({
        commands: {
          "which codex": { status: 1, stderr: "codex not found" },
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("codex not found on PATH");
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
