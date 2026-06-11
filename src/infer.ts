import path from "node:path";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { buildInferencePrompt, runCommandAgent } from "./agent.js";
import { collectEvidence } from "./evidence.js";
import { writeJson, writeText } from "./fs-utils.js";
import { validateSpec } from "./spec.js";
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

  if (options.agent !== "command") {
    const envelope: InferenceEnvelope = {
      schemaVersion: "inference.v1",
      status: "needs_decision",
      brief: `${options.agent} preset is planned, but MVP uses the normalized command adapter first.`,
      questions: [
        {
          id: "agent_command",
          question: "Rerun with --agent command --agent-cmd <binary> and repeat --agent-arg for arguments.",
          default: "command",
        },
      ],
    };
    await writeDecisionFile(projectRoot, envelope);
    return envelope;
  }

  if (!options.agentCmd) {
    throw new Error("--agent-cmd is required when --agent command is used.");
  }

  const prompt = buildInferencePrompt(evidence.files);
  const envelope = await runCommandAgent({
    command: options.agentCmd,
    args: options.agentArgs ?? [],
    cwd: projectRoot,
    prompt,
  });

  await writeJson(path.join(workspaceDir, "inference.json"), envelope);

  if (envelope.status === "needs_decision") {
    await writeDecisionFile(projectRoot, envelope);
    return envelope;
  }
  if (envelope.status !== "ok" || !envelope.spec) {
    return envelope;
  }

  const validation = validateSpec(envelope.spec);
  if (!validation.ok) {
    return {
      ...envelope,
      status: "error",
      error: `Inferred spec failed validation: ${validation.errors.join("; ")}`,
    };
  }

  const generatedSpecPath = path.join(workspaceDir, "simulator.spec.generated.json");
  await writeJson(generatedSpecPath, envelope.spec);
  await writeText(path.join(workspaceDir, "assumptions.md"), renderAssumptions(envelope));

  const userSpecPath = path.join(projectRoot, "simulator.spec.json");
  if (options.acceptGenerated || !existsSync(userSpecPath)) {
    await copyFile(generatedSpecPath, userSpecPath);
  }
  return envelope;
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

