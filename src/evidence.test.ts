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
});

