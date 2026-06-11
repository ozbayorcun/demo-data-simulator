import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { EvidenceFile, EvidenceManifest } from "./types.js";
import { toPosixPath, writeJson } from "./fs-utils.js";

export interface CollectEvidenceOptions {
  projectRoot: string;
  include?: string[];
  exclude?: string[];
  maxFiles?: number;
  maxBytes?: number;
}

export interface EvidenceBundle {
  files: EvidenceFile[];
  manifest: EvidenceManifest;
}

const DEFAULT_MAX_FILES = 80;
const DEFAULT_MAX_BYTES = 160_000;
const MAX_FILE_BYTES = 24_000;

const ALLOWED_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sql",
  ".prisma",
  ".yaml",
  ".yml",
  ".toml",
]);

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".demo-data-simulator",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "dist",
  "build",
  "out",
  "node_modules",
  "vendor",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env($|\.)/,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /credentials/i,
  /token/i,
  /secret/i,
];

export async function collectEvidence(options: CollectEvidenceOptions): Promise<EvidenceBundle> {
  const projectRoot = path.resolve(options.projectRoot);
  const gitignore = await readGitignore(projectRoot);
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const files: EvidenceFile[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  const visit = async (absolutePath: string): Promise<void> => {
    if (files.length >= maxFiles) return;
    const relative = toPosixPath(path.relative(projectRoot, absolutePath));
    if (!relative) {
      for (const entry of await sortedEntries(absolutePath)) {
        await visit(path.join(absolutePath, entry));
      }
      return;
    }

    if (matchesAny(relative, options.exclude ?? [])) {
      skipped.push({ path: relative, reason: "excluded by user pattern" });
      return;
    }
    if (options.include?.length && !matchesAny(relative, options.include)) {
      skipped.push({ path: relative, reason: "not matched by include pattern" });
      return;
    }
    if (isGitignored(relative, gitignore)) {
      skipped.push({ path: relative, reason: "matched .gitignore" });
      return;
    }

    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      skipped.push({ path: relative, reason: "symlink" });
      return;
    }
    if (stat.isDirectory()) {
      if (SKIP_DIRECTORIES.has(path.basename(absolutePath))) {
        skipped.push({ path: relative, reason: "skipped directory" });
        return;
      }
      for (const entry of await sortedEntries(absolutePath)) {
        await visit(path.join(absolutePath, entry));
      }
      return;
    }
    if (!stat.isFile()) return;
    if (SECRET_FILE_PATTERNS.some((pattern) => pattern.test(path.basename(relative)))) {
      skipped.push({ path: relative, reason: "secret-like filename" });
      return;
    }
    if (!ALLOWED_EXTENSIONS.has(path.extname(relative))) {
      skipped.push({ path: relative, reason: "unsupported extension" });
      return;
    }
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push({ path: relative, reason: "file too large" });
      return;
    }
    const currentBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    if (currentBytes + stat.size > maxBytes) {
      skipped.push({ path: relative, reason: "evidence byte budget reached" });
      return;
    }
    const raw = await readFile(absolutePath);
    if (raw.includes(0)) {
      skipped.push({ path: relative, reason: "binary content" });
      return;
    }
    const text = raw.toString("utf8");
    const redacted = redactSecrets(text);
    files.push({
      path: relative,
      bytes: Buffer.byteLength(redacted.content, "utf8"),
      redactions: redacted.count,
      reason: inferReason(relative),
      content: redacted.content,
    });
  };

  await visit(projectRoot);

  const manifest: EvidenceManifest = {
    projectRoot,
    generatedAt: new Date(0).toISOString(),
    files: files.map(({ content: _content, ...file }) => file),
    skipped,
    totals: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      redactions: files.reduce((sum, file) => sum + file.redactions, 0),
    },
  };

  await mkdir(path.join(projectRoot, ".demo-data-simulator"), { recursive: true });
  await writeJson(path.join(projectRoot, ".demo-data-simulator", "evidence-manifest.json"), manifest);
  return { files, manifest };
}

export function redactSecrets(input: string): { content: string; count: number } {
  let count = 0;
  const replace = (value: string): string => {
    count += 1;
    const [key] = value.split(/[:=]/);
    return `${key}=<REDACTED>`;
  };

  let content = input.replace(
    /\b(api[_-]?key|token|secret|password|authorization)\b\s*[:=]\s*["']?[^"'\s]+/gi,
    replace,
  );
  content = content.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, () => {
    count += 1;
    return "<REDACTED_OPENAI_KEY>";
  });
  content = content.replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, () => {
    count += 1;
    return "<REDACTED_SLACK_TOKEN>";
  });
  return { content, count };
}

function inferReason(relativePath: string): string {
  const base = path.basename(relativePath).toLowerCase();
  if (base.includes("readme")) return "readme";
  if (relativePath.includes("schema") || relativePath.includes("model")) return "schema or model";
  if (relativePath.includes("route") || relativePath.includes("api")) return "api surface";
  if (relativePath.includes("test") || relativePath.includes("spec")) return "test or fixture";
  return "allowlisted source";
}

async function sortedEntries(directory: string): Promise<string[]> {
  return (await readdir(directory)).sort((a, b) => a.localeCompare(b));
}

async function readGitignore(projectRoot: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

function isGitignored(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const clean = pattern.replace(/^\//, "").replace(/\/$/, "");
    if (!clean) return false;
    if (clean.includes("*")) {
      const regexp = new RegExp(`^${clean.split("*").map(escapeRegExp).join(".*")}`);
      return regexp.test(relativePath);
    }
    return relativePath === clean || relativePath.startsWith(`${clean}/`) || relativePath.includes(`/${clean}/`);
  });
}

function matchesAny(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => relativePath.includes(pattern.replace(/^\//, "")));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
