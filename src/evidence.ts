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
  profile?: EvidenceProfile;
}

export interface EvidenceBundle {
  files: EvidenceFile[];
  manifest: EvidenceManifest;
}

export type EvidenceProfile = "fast" | "balanced" | "wide";

const PROFILE_LIMITS: Record<EvidenceProfile, { maxFiles: number; maxBytes: number }> = {
  fast: { maxFiles: 35, maxBytes: 80_000 },
  balanced: { maxFiles: 80, maxBytes: 160_000 },
  wide: { maxFiles: 140, maxBytes: 280_000 },
};

export function isEvidenceProfile(value: string): value is EvidenceProfile {
  return value === "fast" || value === "balanced" || value === "wide";
}

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
  ".bg-shell",
  ".agent",
  ".next",
  ".planning",
  ".github",
  ".turbo",
  ".tmp",
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
  const profile = options.profile ?? "balanced";
  const maxFiles = options.maxFiles ?? PROFILE_LIMITS[profile].maxFiles;
  const maxBytes = options.maxBytes ?? PROFILE_LIMITS[profile].maxBytes;
  const files: EvidenceFile[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const candidates: Array<{ absolutePath: string; path: string; bytes: number; reason: string; score: number }> = [];

  const visit = async (absolutePath: string): Promise<void> => {
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
    const reason = inferReason(relative);
    candidates.push({
      absolutePath,
      path: relative,
      bytes: stat.size,
      reason,
      score: scoreEvidencePath(relative, reason),
    });
  };

  await visit(projectRoot);

  const rankedCandidates = candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.path.localeCompare(right.path);
  });

  for (const candidate of rankedCandidates) {
    if (files.length >= maxFiles) {
      skipped.push({ path: candidate.path, reason: "evidence file budget reached" });
      continue;
    }
    const currentBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    if (currentBytes + candidate.bytes > maxBytes) {
      skipped.push({ path: candidate.path, reason: "evidence byte budget reached" });
      continue;
    }
    const raw = await readFile(candidate.absolutePath);
    if (raw.includes(0)) {
      skipped.push({ path: candidate.path, reason: "binary content" });
      continue;
    }
    const text = raw.toString("utf8");
    const redacted = redactSecrets(text);
    files.push({
      path: candidate.path,
      bytes: Buffer.byteLength(redacted.content, "utf8"),
      redactions: redacted.count,
      reason: candidate.reason,
      content: redacted.content,
    });
  }

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

  let content = input.replace(/\bAuthorization\s*:\s*Bearer\s+[^\r\n]+/gi, () => {
    count += 1;
    return "Authorization: Bearer <REDACTED>";
  });
  content = content.replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/g, (match, scheme: string) => {
    count += 1;
    return `${scheme} <REDACTED>`;
  });
  content = content.replace(
    /\b([A-Z0-9_]*(?:DATABASE_URL|DB_URL|REDIS_URL|MONGO(?:DB)?_URI|POSTGRES_URL)[A-Z0-9_]*)\s*[:=]\s*["']?[^"'\s]+/gi,
    replace,
  );
  content = content.replace(
    /\b([A-Z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|token|secret|password|authorization)[A-Z0-9_-]*)\b\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n#]+)/gi,
    replace,
  );
  content = content.replace(/\/\/([^:\s/@]+):([^@\s/]+)@/g, () => {
    count += 1;
    return "//<REDACTED_CREDENTIALS>@";
  });
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
  if (relativePath.includes("prisma") || relativePath.includes("migration") || relativePath.includes("database")) return "schema or model";
  if (relativePath.includes("schema") || relativePath.includes("model")) return "schema or model";
  if (relativePath.includes("types") || relativePath.includes("entities")) return "schema or model";
  if (relativePath.includes("route") || relativePath.includes("api")) return "api surface";
  if (relativePath.includes("store") || relativePath.includes("service") || relativePath.includes("workflow")) return "domain logic";
  if (relativePath.includes("test") || relativePath.includes("spec")) return "test or fixture";
  return "allowlisted source";
}

function scoreEvidencePath(relativePath: string, reason: string): number {
  const pathLower = relativePath.toLowerCase();
  const base = path.basename(pathLower);
  let score = 10;

  if (pathLower.includes("/src/") || pathLower.startsWith("src/")) score += 30;
  if (pathLower.includes("/app/") || pathLower.startsWith("app/")) score += 18;
  if (pathLower.includes("/lib/") || pathLower.startsWith("lib/")) score += 12;
  if (pathLower.includes("/components/")) score += 5;

  if (reason === "schema or model") score += 55;
  if (reason === "domain logic") score += 45;
  if (reason === "api surface") score += 35;
  if (reason === "test or fixture") score += 20;
  if (reason === "readme") score += 18;

  if (/model|schema|entity|entities|type|types|database|prisma|migration/.test(pathLower)) score += 25;
  if (/task|order|customer|user|account|billing|job|event|workflow|capture|candidate|game|asset/.test(pathLower)) score += 16;
  if (/route|api|controller|service|store|repository|mutation|query/.test(pathLower)) score += 14;
  if (/fixture|seed|example|mock/.test(pathLower)) score += 10;

  if (base === "package.json") score -= 20;
  if (/config|eslint|postcss|tailwind|vite|next\.config|tsconfig|lock/.test(pathLower)) score -= 25;
  if (/agents\.md|claude\.md|license|changelog/.test(base)) score -= 30;
  if (pathLower.includes("/docs/")) score -= 8;

  return score;
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
