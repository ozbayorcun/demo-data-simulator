import path from "node:path";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { buildInferencePrompt, doctorAgent, runCommandAgent, runPresetAgent } from "./agent.js";
import { collectEvidence } from "./evidence.js";
import { writeJson, writeText } from "./fs-utils.js";
import { normalizeSpec, validateSpec } from "./spec.js";
import type { AgentName } from "./agent.js";
import type { InferenceEnvelope } from "./types.js";

export interface InferOptions {
  projectRoot: string;
  agent: AgentName;
  agentCmd?: string;
  agentArgs?: string[];
  include?: string[];
  exclude?: string[];
  maxFiles?: number;
  maxBytes?: number;
  acceptGenerated?: boolean;
}

export async function inferSpec(options: InferOptions): Promise<InferenceEnvelope> {
  const projectRoot = path.resolve(options.projectRoot);
  const workspaceDir = path.join(projectRoot, ".demo-data-simulator");
  const evidence = await collectEvidence({
    projectRoot,
    include: options.include,
    exclude: options.exclude,
    maxFiles: options.maxFiles,
    maxBytes: options.maxBytes,
  });

  if (options.agent === "none") {
    const envelope: InferenceEnvelope = {
      schemaVersion: "inference.v1",
      status: "needs_decision",
      brief: "No agent was selected. Create or edit simulator.spec.json manually.",
      questions: [
        {
          id: "manual_spec",
          question: "Create simulator.spec.json from examples/specs/field-service.simulator.spec.json, then run validate and generate.",
          default: "manual",
        },
      ],
    };
    await writeDecisionFile(projectRoot, envelope);
    return envelope;
  }

  const prompt = buildInferencePrompt(evidence.files);
  const agent = resolveAgent(options.agent);
  const envelope =
    agent === "command"
      ? await runCommandInference(options, projectRoot, prompt)
      : await runPresetInference(agent, options, projectRoot, prompt);

  await writeJson(path.join(workspaceDir, "inference.json"), envelope);

  if (envelope.status === "needs_decision") {
    await writeDecisionFile(projectRoot, envelope);
    return envelope;
  }
  if (envelope.status !== "ok" || !envelope.spec) {
    return envelope;
  }

  const normalizedSpec = normalizeSpec(envelope.spec);
  const validation = validateSpec(normalizedSpec);
  if (!validation.ok) {
    return {
      ...envelope,
      status: "error",
      error: `Inferred spec failed validation: ${validation.errors.join("; ")}`,
    };
  }

  const generatedSpecPath = path.join(workspaceDir, "simulator.spec.generated.json");
  envelope.spec = normalizedSpec;
  await writeJson(generatedSpecPath, normalizedSpec);
  await writeText(path.join(workspaceDir, "assumptions.md"), renderAssumptions(envelope));

  const userSpecPath = path.join(projectRoot, "simulator.spec.json");
  if (options.acceptGenerated || !existsSync(userSpecPath)) {
    await copyFile(generatedSpecPath, userSpecPath);
  }
  return envelope;
}

function resolveAgent(agent: Exclude<AgentName, "none">): Exclude<AgentName, "auto" | "none"> {
  if (agent !== "auto") return agent;
  if (doctorAgent("codex").ok) return "codex";
  if (doctorAgent("claude").ok) return "claude";
  return "command";
}

async function runCommandInference(options: InferOptions, projectRoot: string, prompt: string): Promise<InferenceEnvelope> {
  if (!options.agentCmd) {
    return {
      schemaVersion: "inference.v1",
      status: "needs_decision",
      brief: "No agent command was provided.",
      questions: [
        {
          id: "agent_command",
          question: "Rerun with --agent command --agent-cmd <binary> and repeat --agent-arg for arguments.",
          default: "codex exec -",
        },
      ],
    };
  }

  return runCommandAgent({
    command: options.agentCmd,
    args: options.agentArgs ?? [],
    cwd: projectRoot,
    prompt,
  });
}

async function runPresetInference(
  agent: Exclude<AgentName, "auto" | "command" | "none">,
  options: InferOptions,
  projectRoot: string,
  prompt: string,
): Promise<InferenceEnvelope> {
  const doctor = doctorAgent(agent);
  if (!doctor.ok) {
    return {
      schemaVersion: "inference.v1",
      status: "error",
      error: doctor.detail,
    };
  }

  return runPresetAgent({
    agent,
    cwd: projectRoot,
    prompt,
    extraArgs: options.agentArgs,
  });
}

async function writeDecisionFile(projectRoot: string, envelope: InferenceEnvelope): Promise<void> {
  await writeText(
    path.join(projectRoot, "NEEDS_DECISION.md"),
    [
      "# Needs Decision",
      "",
      envelope.brief ?? "Inference could not safely finish.",
      "",
      ...(envelope.questions ?? []).map((question, index) => `${index + 1}. ${question.question}\n   Default: ${question.default ?? "none"}`),
      "",
    ].join("\n"),
  );
}

function renderAssumptions(envelope: InferenceEnvelope): string {
  return [
    "# Inference Assumptions",
    "",
    ...(envelope.assumptions ?? ["No assumptions reported."]).map((assumption) => `- ${assumption}`),
    "",
  ].join("\n");
}
