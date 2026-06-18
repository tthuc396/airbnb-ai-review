import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

loadEnvFile(path.join(__dirname, ".env"));

const configuredPort = Number(process.env.PORT || 5173);
const port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 5173;
const model = process.env.OPENAI_MODEL || "gpt-5.2";
const openaiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
const openaiBaseUrl = trimTrailingSlash(process.env.OPENAI_BASE_URL || "https://api.openai.com");
const airbnbTimeoutMs = Number(process.env.AIRBNB_TIMEOUT_MS || 15000);
const airbnbApiBaseUrl = trimTrailingSlash(process.env.AIRBNB_API_BASE_URL || "");
const airbnbApiToken = process.env.AIRBNB_API_TOKEN || "";
const airbnbReviewsPath = process.env.AIRBNB_REVIEWS_PATH || "/reviews";
const airbnbReplyPathTemplate = process.env.AIRBNB_REPLY_PATH_TEMPLATE || "/reviews/:id/reply";

const demoReviews = [
  {
    id: "demo-review-1001",
    guestName: "Maya",
    propertyName: "Lakeside studio near downtown",
    rating: 5,
    submittedAt: "2026-06-15",
    review:
      "The studio was spotless and exactly as described. Check-in was easy, the lake view was lovely, and the host was quick to answer our questions. We would happily stay again.",
    status: "needs_reply",
    postedReply: ""
  },
  {
    id: "demo-review-1002",
    guestName: "Daniel",
    propertyName: "Garden apartment by the market",
    rating: 4,
    submittedAt: "2026-06-12",
    review:
      "Great location and a comfortable bed. There was a little street noise on Saturday night, but everything else was smooth and the host was very responsive.",
    status: "needs_reply",
    postedReply: ""
  },
  {
    id: "demo-review-1003",
    guestName: "Priya",
    propertyName: "Sunny loft with workspace",
    rating: 5,
    submittedAt: "2026-06-09",
    review:
      "Beautiful place with thoughtful touches. The workspace was perfect for a few remote meetings, and the kitchen had everything we needed.",
    status: "needs_reply",
    postedReply: ""
  }
];

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    drafts: {
      type: "array",
      description: "Exactly four ready-to-paste draft options.",
      minItems: 4,
      maxItems: 4,
      items: { type: "string" }
    },
    notes: {
      type: "array",
      description: "Two to four short cautions or rationale notes.",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" }
    },
    best_fit: {
      type: "string",
      description: "One sentence explaining which option is safest and why."
    }
  },
  required: ["drafts", "notes", "best_fit"]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/generate") {
      await handleGenerate(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/airbnb/reviews") {
      await handleAirbnbReviews(res);
      return;
    }

    const suggestMatch = url.pathname.match(/^\/api\/airbnb\/reviews\/([^/]+)\/suggest$/);
    if (req.method === "POST" && suggestMatch) {
      await handleAirbnbSuggest(req, res, suggestMatch[1]);
      return;
    }

    const replyMatch = url.pathname.match(/^\/api\/airbnb\/reviews\/([^/]+)\/reply$/);
    if (req.method === "POST" && replyMatch) {
      await handleAirbnbReply(req, res, replyMatch[1]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        model,
        openai_configured: Boolean(process.env.OPENAI_API_KEY),
        airbnb_configured: Boolean(airbnbApiBaseUrl && airbnbApiToken),
        airbnb_mode: airbnbApiBaseUrl && airbnbApiToken ? "configured" : "demo"
      });
      return;
    }

    if (!["GET", "HEAD"].includes(req.method)) {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Unexpected server error." });
  }
});

server.listen(port, () => {
  console.log(`Airbnb Review Reply Desk running at http://localhost:${port}`);
});

async function handleGenerate(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message || "Invalid JSON." });
    return;
  }

  const validationError = validatePayload(body);

  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  try {
    const result = await generateDrafts(body);
    sendJson(res, 200, { model, result });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Generation failed." });
  }
}

async function handleAirbnbReviews(res) {
  if (!airbnbApiBaseUrl || !airbnbApiToken) {
    sendJson(res, 200, {
      mode: "demo",
      reviews: demoReviews,
      message: "Using local sample reviews. Add Airbnb partner or PMS API settings to .env for live reviews."
    });
    return;
  }

  try {
    const data = await airbnbFetch(airbnbReviewsPath);
    sendJson(res, 200, { mode: "configured", reviews: normalizeReviews(data) });
  } catch (error) {
    sendJson(res, error.status || 502, { error: error.message || "Could not load reviews." });
  }
}

async function handleAirbnbSuggest(req, res, reviewId) {
  let review;

  try {
    review = await getReviewForSuggestion(reviewId);
  } catch (error) {
    sendJson(res, error.status || 502, { error: error.message || "Could not load review." });
    return;
  }

  if (!review) {
    sendJson(res, 404, { error: "Review not found." });
    return;
  }

  if (!String(review.review || "").trim()) {
    sendJson(res, 400, { error: "This review has no public text to respond to." });
    return;
  }

  const body = {
    mode: "review-response",
    tone: "Warm, appreciative, and human",
    length: "Medium",
    language: "English",
    guestName: review.guestName,
    propertyName: review.propertyName,
    rating: review.rating ? `${review.rating} stars` : "",
    staySummary: `Guest review received on ${review.submittedAt || "an unspecified date"}.`,
    guestReview: review.review,
    highlights: "Thank the guest naturally and reference specific positive details from their review.",
    concerns: "If the review mentions an issue, acknowledge it calmly without sounding defensive.",
    privateNotes:
      "Write like a real host: warm, appreciative, direct, lightly varied sentence rhythm. Avoid generic AI phrasing, marketing language, exaggerated praise, and stiff customer-service scripts."
  };

  try {
    const result = await generateDrafts(body);
    sendJson(res, 200, { model, review_id: review.id, result });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Could not suggest replies." });
  }
}

async function handleAirbnbReply(req, res, reviewId) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message || "Invalid JSON." });
    return;
  }

  const reply = String(body.reply || "").trim();

  if (reply.length < 12) {
    sendJson(res, 400, { error: "Choose or write a reply before posting." });
    return;
  }

  if (reply.length > 2000) {
    sendJson(res, 400, { error: "Reply is too long. Keep it under 2,000 characters." });
    return;
  }

  if (!airbnbApiBaseUrl || !airbnbApiToken) {
    const review = demoReviews.find((item) => item.id === reviewId);
    if (!review) {
      sendJson(res, 404, { error: "Review not found." });
      return;
    }

    review.status = "posted_demo";
    review.postedReply = reply;
    sendJson(res, 200, {
      ok: true,
      mode: "demo",
      review_id: reviewId,
      posted_reply: reply,
      message: "Demo mode: reply saved locally. Configure Airbnb partner or PMS API settings to post live."
    });
    return;
  }

  try {
    const path = airbnbReplyPathTemplate.replace(":id", encodeURIComponent(reviewId));
    const data = await airbnbFetch(path, {
      method: "POST",
      body: JSON.stringify({ reply })
    });
    sendJson(res, 200, { ok: true, mode: "configured", review_id: reviewId, response: data });
  } catch (error) {
    sendJson(res, error.status || 502, { error: error.message || "Could not post reply." });
  }
}

async function generateDrafts(body) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw Object.assign(
      new Error("Missing OPENAI_API_KEY. Add it to .env, then restart the server."),
      { status: 400 }
    );
  }

  const prompt = buildPrompt(body);
  const controller = new AbortController();
  const timeout = windowlessSetTimeout(() => controller.abort(), openaiTimeoutMs);
  let response;

  try {
    response = await fetch(`${openaiBaseUrl}/v1/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions:
          "You write polished, factual Airbnb host communication. Make every reply sound human, warm, appreciative, and specific to the guest's words. Avoid protected-class references, threats, speculation, private medical/family details, revenge language, unsupported platform-policy claims, generic AI phrasing, stiff customer-service scripts, and anything the host cannot substantiate.",
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "airbnb_review_drafts",
            strict: true,
            schema: responseSchema
          }
        }
      })
    });
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "OpenAI request timed out. Try again with shorter details."
        : "Could not reach OpenAI. Check your network connection and try again.";
    throw Object.assign(new Error(message), { status: error.name === "AbortError" ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(
      new Error(
        data?.error?.message || "OpenAI request failed. Check your key, model, and account access."
      ),
      { status: response.status }
    );
  }

  const outputText = data.output_text || extractOutputText(data);
  const parsed = parseJsonOutput(outputText);
  const normalized = normalizeModelResult(parsed);

  if (!normalized) {
    throw Object.assign(
      new Error("The model response did not match the expected draft format. Please try again."),
      { status: 502 }
    );
  }

  return normalized;
}

async function getReviewForSuggestion(reviewId) {
  if (!airbnbApiBaseUrl || !airbnbApiToken) {
    return demoReviews.find((review) => review.id === reviewId);
  }

  const data = await airbnbFetch(airbnbReviewsPath);
  return normalizeReviews(data).find((review) => review.id === reviewId);
}

async function airbnbFetch(apiPath, options = {}) {
  const controller = new AbortController();
  const timeout = windowlessSetTimeout(() => controller.abort(), airbnbTimeoutMs);
  let response;

  try {
    response = await fetch(`${airbnbApiBaseUrl}${ensureLeadingSlash(apiPath)}`, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${airbnbApiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
      },
      body: options.body
    });
  } catch (error) {
    const message =
      error.name === "AbortError"
        ? "Airbnb/PMS API request timed out."
        : "Could not reach the Airbnb/PMS API.";
    throw Object.assign(new Error(message), { status: error.name === "AbortError" ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(
      new Error(data?.error?.message || data?.message || "Airbnb/PMS API request failed."),
      { status: response.status }
    );
  }

  return data;
}

function normalizeReviews(data) {
  const items = Array.isArray(data) ? data : data?.reviews || data?.data || [];

  if (!Array.isArray(items)) return [];

  return items.map((item, index) => ({
    id: String(item.id || item.review_id || item.uuid || `review-${index + 1}`).trim(),
    guestName: String(item.guestName || item.guest_name || item.guest?.name || "Guest").trim(),
    propertyName: String(
      item.propertyName || item.property_name || item.listingName || item.listing?.name || "Listing"
    ).trim(),
    rating: item.rating || item.overall_rating || item.score || "",
    submittedAt: String(item.submittedAt || item.submitted_at || item.created_at || "").trim(),
    review: String(item.review || item.text || item.public_review || item.comment || "").trim(),
    status: String(item.status || item.reply_status || "needs_reply").trim(),
    postedReply: String(item.postedReply || item.posted_reply || item.host_reply || "").trim()
  }));
}

async function serveStatic(requestPath, res, headOnly = false) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    sendText(res, 400, "Bad request");
    return;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicDir, path.normalize(relativePath));

  if (!filePath.startsWith(`${publicDir}${path.sep}`)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath) && path.extname(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const finalPath = existsSync(filePath) ? filePath : path.join(publicDir, "index.html");
  const ext = path.extname(finalPath);
  const file = await readFile(finalPath);

  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  if (headOnly) {
    res.end();
    return;
  }
  res.end(file);
}

function validatePayload(body) {
  if (!body || typeof body !== "object") return "Invalid request body.";
  if (!["guest-review", "review-response"].includes(body.mode)) return "Choose a valid mode.";
  if (!body.tone || typeof body.tone !== "string") return "Choose a tone.";
  if (!body.length || typeof body.length !== "string") return "Choose a length.";
  if (body.mode === "review-response" && !String(body.guestReview || "").trim()) {
    return "Paste the guest review before generating a public response.";
  }

  const combined = [
    body.guestName,
    body.propertyName,
    body.rating,
    body.staySummary,
    body.guestReview,
    body.highlights,
    body.concerns,
    body.privateNotes
  ]
    .filter(Boolean)
    .join(" ");

  if (combined.trim().length < 12) {
    return "Add a few stay or review details before generating.";
  }

  if (combined.length > 6000) {
    return "Please shorten the details to under 6,000 characters.";
  }

  return "";
}

function buildPrompt(body) {
  const modeLabel =
    body.mode === "guest-review"
      ? "Write a host review for a guest after their stay."
      : "Write a public host response to a guest's Airbnb review.";

  return JSON.stringify(
    {
      task: modeLabel,
      output_contract: {
        drafts:
          "Array of exactly 4 ready-to-paste options. Each option must be complete and meaningfully different: concise, warmly personal, issue-aware if needed, and polished.",
        notes: "Array of 2 to 4 short cautions or rationale notes.",
        best_fit: "One sentence explaining which option is safest and why."
      },
      constraints: [
        "Keep the writing factual, calm, warm, appreciative, and professional.",
        "Humanize the writing: vary sentence rhythm, avoid corporate scripts, avoid generic phrases like 'thank you for your feedback' unless it is naturally extended with specifics.",
        "Do not invent details.",
        "Do not mention protected classes, personal traits, medical details, family status, nationality, disability, race, religion, age, gender, or other sensitive traits.",
        "If the host included concerns, phrase only observable behavior and avoid accusations.",
        "Do not offer refunds, discounts, threats, or platform-policy claims unless explicitly provided.",
        "No markdown. No headings inside the draft text.",
        "If include_private_feedback is true, include one draft that is suitable for private guest feedback, but keep every draft safe for a host to paste after review."
      ],
      preferences: {
        tone: body.tone,
        length: body.length,
        language: body.language || "English",
        include_private_feedback: Boolean(body.includePrivateFeedback)
      },
      stay_context: {
        guest_name: body.guestName || "",
        property_name: body.propertyName || "",
        rating: body.rating || "",
        stay_summary: body.staySummary || "",
        guest_review_to_respond_to: body.guestReview || "",
        positives: body.highlights || "",
        concerns: body.concerns || "",
        private_notes_for_model_only: body.privateNotes || ""
      }
    },
    null,
    2
  );
}

function normalizeModelResult(result) {
  if (!result || typeof result !== "object") return null;
  const drafts = Array.isArray(result.drafts)
    ? result.drafts.map((draft) => String(draft || "").trim()).filter(Boolean)
    : [];
  const notes = Array.isArray(result.notes)
    ? result.notes.map((note) => String(note || "").trim()).filter(Boolean)
    : [];
  const bestFit = String(result.best_fit || "").trim();

  if (drafts.length !== 4 || !bestFit) return null;

  return {
    drafts,
    notes: notes.slice(0, 4),
    best_fit: bestFit
  };
}

function extractOutputText(data) {
  if (!Array.isArray(data.output)) return "";

  return data.output
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && content.text)
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function parseJsonOutput(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 7000) {
        req.destroy();
        reject(Object.assign(new Error("Request body too large."), { status: 413 }));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function windowlessSetTimeout(callback, delay) {
  return setTimeout(callback, Number.isFinite(delay) && delay > 0 ? delay : 30000);
}

function ensureLeadingSlash(value) {
  const text = String(value || "");
  return text.startsWith("/") ? text : `/${text}`;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
