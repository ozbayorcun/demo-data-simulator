import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectEvidence, redactSecrets } from "./evidence.js";

describe("redactSecrets", () => {
  it("redacts key-like values", () => {
    const result = redactSecrets("OPENAI_API_KEY=sk-testsecretvalue12345\npassword: hunter2");
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.content).not.toContain("hunter2");
    expect(result.content).not.toContain("sk-testsecretvalue12345");
  });

  it("redacts common authorization headers and database URLs", () => {
    const result = redactSecrets(
      [
        "Authorization: Bearer secret-token-123456789",
        "DATABASE_URL=postgres://user:pass@example.com/db",
        'client_secret: "value with spaces"',
      ].join("\n"),
    );

    expect(result.content).not.toContain("secret-token-123456789");
    expect(result.content).not.toContain("postgres://user:pass@example.com/db");
    expect(result.content).not.toContain("value with spaces");
    expect(result.count).toBeGreaterThanOrEqual(3);
  });
});

describe("collectEvidence", () => {
  it("collects allowlisted files and skips secrets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dds-evidence-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "README.md"), "Field service app", "utf8");
    await writeFile(path.join(root, "src", "models.ts"), "const token = 'secret-value';", "utf8");
    await writeFile(path.join(root, ".env"), "TOKEN=secret", "utf8");

    const result = await collectEvidence({ projectRoot: root });
    expect(result.files.map((file) => file.path)).toContain("README.md");
    expect(result.files.map((file) => file.path)).toContain("src/models.ts");
    expect(result.files.some((file) => file.path === ".env")).toBe(false);
    expect(result.files.find((file) => file.path === "src/models.ts")?.content).not.toContain("secret-value");
    expect(result.manifest.totals.files).toBe(2);
  });

  it("prioritizes domain source over low-signal root docs when budget is tight", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dds-evidence-priority-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "AGENTS.md"), "Agent instructions", "utf8");
    await writeFile(path.join(root, "README.md"), "Generic README", "utf8");
    await writeFile(path.join(root, "src", "task-models.ts"), "export interface Task { id: string; status: string }", "utf8");

    const result = await collectEvidence({ projectRoot: root, maxFiles: 1 });
    expect(result.files.map((file) => file.path)).toEqual(["src/task-models.ts"]);
  });

  it("uses fast profile limits when raw limits are not provided", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dds-evidence-fast-"));
    await mkdir(path.join(root, "src"));
    for (let index = 0; index < 50; index += 1) {
      await writeFile(path.join(root, "src", `model-${index}.ts`), `export interface Entity${index} { id: string }`, "utf8");
    }

    const result = await collectEvidence({ projectRoot: root, profile: "fast" });
    expect(result.files.length).toBeLessThanOrEqual(35);
  });
});
