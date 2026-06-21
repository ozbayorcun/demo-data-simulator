import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dashboardDir = path.join(repoRoot, "examples", "field-service", "dashboard");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsonl", "application/x-ndjson; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
    const filePath = path.resolve(dashboardDir, `.${pathname}`);

    if (!filePath.startsWith(`${dashboardDir}${path.sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream" });
    response.end(body);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && error.code === "ENOENT" ? 404 : 500;
    response.writeHead(code);
    response.end(code === 404 ? "Not found" : error instanceof Error ? error.message : "Unknown server error");
  }
});

const address = await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address()));
});

if (!address || typeof address === "string") {
  throw new Error("Could not bind local dashboard smoke server.");
}

try {
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const [html, appSource, styles, eventsText, metricsText, manifest] = await Promise.all([
    fetchText(`${baseUrl}/`),
    fetchText(`${baseUrl}/app.js`),
    fetchText(`${baseUrl}/styles.css`),
    fetchText(`${baseUrl}/data/events.jsonl`),
    fetchText(`${baseUrl}/data/metrics_daily.csv`),
    fetchJson(`${baseUrl}/data/manifest.json`),
  ]);

  assertNoExternalUrls({ html, appSource, styles });
  assertAppLoadsFixtureSources(appSource);

  const events = eventsText
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const metrics = parseCsv(metricsText);

  assert(manifest.generator === "demo-data-simulator", "manifest generator should identify demo-data-simulator");
  assert(manifest.domain === "field-service", "manifest domain should be field-service");
  assert(manifest.seed === "42", "manifest seed should be 42");
  assert(manifest.files.includes("events.jsonl"), "manifest should include events.jsonl");
  assert(manifest.files.includes("metrics_daily.csv"), "manifest should include metrics_daily.csv");
  assert(manifest.rows["events.jsonl"] === events.length, "manifest event row count should match events.jsonl");
  assert(
    manifest.rows["metrics_daily.csv"] === metrics.length,
    "manifest metric row count should match metrics_daily.csv",
  );
  assert(events.some((event) => event.event_name === "work_order_completed"), "events should include completed work orders");
  assert(
    metrics.some((row) => row.metric === "completed_work_orders"),
    "metrics should include completed_work_orders",
  );

  console.log("Field-service dashboard smoke passed.");
  console.log(`- Served local dashboard from ${baseUrl}/`);
  console.log(`- Loaded events.jsonl (${events.length}), metrics_daily.csv (${metrics.length}), and manifest.json.`);
  console.log("- Dashboard assets reference no external URLs.");
} finally {
  server.close();
}

async function fetchText(url) {
  const response = await fetch(url);
  assert(response.ok, `Expected ${url} to load, got ${response.status}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url);
  assert(response.ok, `Expected ${url} to load, got ${response.status}`);
  return response.json();
}

function assertNoExternalUrls(assets) {
  for (const [name, source] of Object.entries(assets)) {
    assert(!/https?:\/\//i.test(source), `${name} should not reference external URLs`);
  }
}

function assertAppLoadsFixtureSources(appSource) {
  for (const fixturePath of ["./data/events.jsonl", "./data/metrics_daily.csv", "./data/manifest.json"]) {
    assert(appSource.includes(fixturePath), `app.js should fetch ${fixturePath}`);
  }
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
