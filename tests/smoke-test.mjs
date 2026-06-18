import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const appPort = 6197;
const appBaseUrl = `http://127.0.0.1:${appPort}`;
const postedReplies = [];

const mockServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://mock.local");

  if (req.method === "POST" && url.pathname === "/v1/responses") {
    assert.equal(req.headers.authorization, "Bearer test-openai-key");
    const body = await readJson(req);
    assert.equal(body.model, "test-model");
    assert.equal(body.text?.format?.type, "json_schema");
    assert.equal(body.text?.format?.schema?.required?.includes("drafts"), true);
    assert.equal(body.text?.format?.schema?.properties?.drafts?.minItems, 4);
    assert.equal(body.text?.format?.schema?.properties?.drafts?.maxItems, 4);
    assert.equal(body.text?.format?.schema?.properties?.notes?.minItems, 2);
    assert.equal(body.text?.format?.schema?.properties?.notes?.maxItems, 4);
    assert.match(body.input, /Loved the stay|Guest review/i);

    sendJson(res, 200, {
      output_text: JSON.stringify({
        drafts: [
          "Thank you so much, Ava. I am really glad the place felt comfortable and that the stay went smoothly. We would be happy to host you again anytime.",
          "Ava, thank you for the kind words. It was a pleasure hosting you, and I am glad the space worked well for your trip.",
          "We appreciate you taking the time to share this, Ava. I am happy the home felt easy to settle into and that you enjoyed your stay.",
          "Thank you, Ava. I am glad the stay was a good one overall, and I appreciate you being such a thoughtful guest."
        ],
        notes: ["Review the reply before posting.", "Keep the wording specific to the guest review."],
        best_fit: "The first option is safest because it is warm, specific, and concise."
      })
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/reviews") {
    assert.equal(req.headers.authorization, "Bearer pms-token");
    sendJson(res, 200, {
      data: [
        {
          review_id: "live-review-1",
          guest_name: "Ava",
          listing: { name: "Canal house studio" },
          overall_rating: 5,
          created_at: "2026-06-18",
          public_review:
            "Loved the stay. The studio was spotless, check-in was simple, and the host was very responsive.",
          reply_status: "needs_reply"
        },
        {
          review_id: "live-review-empty",
          guest_name: "Noah",
          listing: { name: "Courtyard room" },
          overall_rating: 5,
          created_at: "2026-06-17",
          public_review: "   ",
          reply_status: "needs_reply"
        }
      ]
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/reviews/live-review-1/reply") {
    assert.equal(req.headers.authorization, "Bearer pms-token");
    const body = await readJson(req);
    assert.match(body.reply, /Thank you|appreciate|glad/i);
    postedReplies.push(body.reply);
    sendJson(res, 200, { ok: true, id: "live-review-1" });
    return;
  }

  sendJson(res, 404, { error: "Mock route not found." });
});

const mockBaseUrl = await listen(mockServer);

const configuredApp = spawnApp({
  PORT: String(appPort),
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_BASE_URL: mockBaseUrl,
  OPENAI_MODEL: "test-model",
  AIRBNB_API_BASE_URL: mockBaseUrl,
  AIRBNB_API_TOKEN: "pms-token",
  AIRBNB_REVIEWS_PATH: "/reviews",
  AIRBNB_REPLY_PATH_TEMPLATE: "/reviews/:id/reply"
});

try {
  await waitForHealth(appBaseUrl);

  const page = await text(`${appBaseUrl}/`);
  assert.match(page, /Airbnb Review Replies/);

  const headResponse = await fetch(`${appBaseUrl}/`, { method: "HEAD" });
  assert.equal(headResponse.status, 200);

  const missingAsset = await fetch(`${appBaseUrl}/missing.css`);
  assert.equal(missingAsset.status, 404);

  const health = await json(`${appBaseUrl}/api/health`);
  assert.equal(health.ok, true);
  assert.equal(health.openai_configured, true);
  assert.equal(health.airbnb_configured, true);
  assert.equal(health.airbnb_mode, "configured");

  const reviews = await json(`${appBaseUrl}/api/airbnb/reviews`);
  assert.equal(reviews.mode, "configured");
  assert.equal(reviews.reviews.length, 2);
  assert.equal(reviews.reviews[0].id, "live-review-1");
  assert.equal(reviews.reviews[0].guestName, "Ava");
  assert.equal(reviews.reviews[0].propertyName, "Canal house studio");
  assert.equal(reviews.reviews[1].review, "");

  const emptySuggestion = await fetch(
    `${appBaseUrl}/api/airbnb/reviews/live-review-empty/suggest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }
  );
  assert.equal(emptySuggestion.status, 400);

  const suggestion = await json(`${appBaseUrl}/api/airbnb/reviews/live-review-1/suggest`, {
    method: "POST",
    body: "{}"
  });
  assert.equal(suggestion.review_id, "live-review-1");
  assert.equal(suggestion.result.drafts.length, 4);
  assert.match(suggestion.result.drafts[0], /Ava/);

  const posted = await json(`${appBaseUrl}/api/airbnb/reviews/live-review-1/reply`, {
    method: "POST",
    body: JSON.stringify({ reply: suggestion.result.drafts[0] })
  });
  assert.equal(posted.ok, true);
  assert.equal(posted.mode, "configured");
  assert.equal(postedReplies.length, 1);

  const invalidReply = await fetch(`${appBaseUrl}/api/airbnb/reviews/live-review-1/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply: "short" })
  });
  assert.equal(invalidReply.status, 400);
} finally {
  configuredApp.kill();
}

await waitForExit(configuredApp);

const demoApp = spawnApp({
  PORT: String(appPort),
  OPENAI_API_KEY: "test-openai-key",
  OPENAI_BASE_URL: mockBaseUrl,
  OPENAI_MODEL: "test-model",
  AIRBNB_API_BASE_URL: "",
  AIRBNB_API_TOKEN: ""
});

try {
  await waitForHealth(appBaseUrl);
  const health = await json(`${appBaseUrl}/api/health`);
  assert.equal(health.airbnb_mode, "demo");

  const reviews = await json(`${appBaseUrl}/api/airbnb/reviews`);
  assert.equal(reviews.mode, "demo");
  assert.equal(reviews.reviews.length >= 3, true);

  const demoPosted = await json(`${appBaseUrl}/api/airbnb/reviews/demo-review-1001/reply`, {
    method: "POST",
    body: JSON.stringify({
      reply:
        "Thank you so much, Maya. I am glad the studio was comfortable and that check-in felt easy."
    })
  });
  assert.equal(demoPosted.mode, "demo");
  assert.equal(demoPosted.ok, true);
} finally {
  demoApp.kill();
  mockServer.close();
}

await waitForExit(demoApp);
console.log("Smoke tests passed.");

function spawnApp(extraEnv) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      ...extraEnv,
      NODE_ENV: "test"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  return child;
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await sleep(80);
    }
  }

  throw new Error("App server did not become healthy.");
}

async function waitForExit(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => child.once("exit", resolve));
}

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  assert.equal(response.ok, true, data.error || `Unexpected ${response.status}`);
  return data;
}

async function text(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true);
  return response.text();
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
