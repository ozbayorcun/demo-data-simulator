const numberFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

const [eventsText, metricsText] = await Promise.all([
  fetch("./data/events.jsonl").then((response) => response.text()),
  fetch("./data/metrics_daily.csv").then((response) => response.text()),
]);

const events = eventsText
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const metrics = parseCsv(metricsText);

const completedMetrics = metrics
  .filter((row) => row.metric === "completed_work_orders")
  .map((row) => ({ day: row.day, value: Number(row.value) }));

const completedEvents = events.filter((event) => event.event_name === "work_order_completed");
const firstTimeFixCount = completedEvents.filter((event) => event.first_time_fix === true).length;
const eventCounts = countBy(events, (event) => event.event_name);

document.querySelector("#total-events").textContent = numberFormat.format(events.length);
document.querySelector("#completed-orders").textContent = numberFormat.format(
  completedMetrics.reduce((sum, row) => sum + row.value, 0),
);
document.querySelector("#fix-rate").textContent = percentFormat.format(firstTimeFixCount / completedEvents.length);
document.querySelector("#active-days").textContent = numberFormat.format(new Set(completedMetrics.map((row) => row.day)).size);

renderBars(completedMetrics);
renderEventMix(eventCounts);
renderRecentEvents(events);

function renderBars(rows) {
  const bars = document.querySelector("#bars");
  const max = Math.max(...rows.map((row) => row.value), 1);
  bars.innerHTML = rows
    .map(
      (row) => `
        <div class="bar-row">
          <span>${formatDay(row.day)}</span>
          <div class="track"><div class="bar" style="width: ${(row.value / max) * 100}%"></div></div>
          <strong>${row.value}</strong>
        </div>
      `,
    )
    .join("");
}

function renderEventMix(counts) {
  const eventMix = document.querySelector("#event-mix");
  eventMix.innerHTML = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([name, count]) => `
        <div>
          <span>${name.replaceAll("_", " ")}</span>
          <strong>${count}</strong>
        </div>
      `,
    )
    .join("");
}

function renderRecentEvents(rows) {
  const recentEvents = document.querySelector("#recent-events");
  recentEvents.innerHTML = rows
    .slice(-6)
    .reverse()
    .map(
      (event) => `
        <li>
          <time>${formatDay(event.occurred_at)}</time>
          <span>${event.event_name.replaceAll("_", " ")}</span>
          <strong>${event.source_id}</strong>
        </li>
      `,
    )
    .join("");
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function countBy(rows, selectKey) {
  return rows.reduce((counts, row) => {
    const key = selectKey(row);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function formatDay(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
