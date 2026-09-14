const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_USERS = 100;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_USERS = 500;
const ERROR_MARKERS = [
  "데모 데이터를 불러오지 못했습니다.",
  "데모를 준비하는 중입니다",
];

function readInteger(name, fallback, { min, max }) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function uniqueMatches(html, pattern) {
  return [...new Set([...html.matchAll(pattern)].map((match) => match[1]))];
}

async function getPage(baseUrl, path, timeoutMs) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(path, baseUrl), {
      method: "GET",
      headers: { accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await response.text();
    const durationMs = performance.now() - startedAt;
    if (!response.ok) throw new Error(`HTTP ${response.status} at ${path}`);
    if (ERROR_MARKERS.some((marker) => body.includes(marker))) {
      throw new Error(`demo error state at ${path}`);
    }
    return { body, durationMs, path };
  } finally {
    clearTimeout(timer);
  }
}

async function runUser({ baseUrl, departmentPath, timeoutMs }) {
  const measurements = [await getPage(baseUrl, "/demo", timeoutMs)];
  const dashboard = await getPage(baseUrl, departmentPath, timeoutMs);
  measurements.push(dashboard);

  const cardPaths = uniqueMatches(
    dashboard.body,
    /href=["'](\/demo\/d\/[^"'/?#]+\/cards\/[^"'/?#]+)["']/g,
  );
  if (cardPaths.length === 0) throw new Error(`card link missing at ${departmentPath}`);

  for (const suffix of ["ledger", "ask", "roles"]) {
    measurements.push(await getPage(baseUrl, `${departmentPath}/${suffix}`, timeoutMs));
  }
  measurements.push(await getPage(baseUrl, cardPaths[0], timeoutMs));
  return measurements;
}

async function main() {
  const baseUrl = new URL(process.env.LOAD_TEST_BASE_URL ?? DEFAULT_BASE_URL);
  const users = readInteger("LOAD_TEST_USERS", DEFAULT_USERS, { min: 1, max: MAX_USERS });
  const timeoutMs = readInteger("LOAD_TEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, { min: 100, max: 60_000 });

  const landing = await getPage(baseUrl, "/demo", timeoutMs);
  const departmentPaths = uniqueMatches(
    landing.body,
    /href=["'](\/demo\/d\/[^"'/?#]+)["']/g,
  );
  if (departmentPaths.length === 0) throw new Error("demo department links are missing");

  const startedAt = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: users }, (_, index) => runUser({
      baseUrl,
      departmentPath: departmentPaths[index % departmentPaths.length],
      timeoutMs,
    })),
  );
  const elapsedMs = performance.now() - startedAt;
  const failures = results.filter((result) => result.status === "rejected");
  const measurements = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const durations = [landing, ...measurements].map((measurement) => measurement.durationMs).sort((a, b) => a - b);

  console.log(`demo load test: users=${users} completed=${users - failures.length} failed=${failures.length}`);
  console.log(`requests=${durations.length} elapsed_ms=${Math.round(elapsedMs)} p50_ms=${Math.round(percentile(durations, 0.5))} p95_ms=${Math.round(percentile(durations, 0.95))} max_ms=${Math.round(durations.at(-1) ?? 0)}`);
  for (const failure of failures.slice(0, 5)) {
    const reason = failure.reason instanceof Error ? failure.reason.message : "unknown failure";
    console.error(`failure: ${reason}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "load test failed");
  process.exitCode = 1;
});
