# Airbnb Review Reply Desk Implementation

## Purpose

Airbnb Review Reply Desk is a local host-assistance tool that drafts:

- public reviews a host can leave for a guest
- public responses a host can leave under a guest review
- optional private-feedback style wording for follow-up notes
- multiple warm, appreciative reply versions for loaded reviews
- a selected reply posting workflow

The tool is designed for factual, host-reviewed drafts. It can post through a configured partner/PMS API adapter, but it does not scrape Airbnb or assume private Airbnb endpoints.

## Runtime Architecture

The app is intentionally dependency-light.

- `server.js` runs a Node HTTP server.
- `public/index.html` defines the product UI.
- `public/app.js` handles form state, local validation, generation requests, rendering, and copy actions.
- `public/styles.css` defines the responsive product interface.
- `.env` supplies local runtime configuration.

The browser never receives the OpenAI API key or Airbnb/PMS token. Browser code loads reviews through local server routes, requests AI suggestions for a selected review, then posts the selected reply through the server adapter.

## Configuration

| Name | Default | Definition |
|---|---:|---|
| `OPENAI_API_KEY` | none | Required for generation. Read only by `server.js`. |
| `OPENAI_BASE_URL` | `https://api.openai.com` | OpenAI-compatible API base URL. Keep default for production; tests use a local mock. |
| `OPENAI_MODEL` | `gpt-5.2` | Model used for the Responses API call. |
| `OPENAI_TIMEOUT_MS` | `30000` | Timeout for the OpenAI request in milliseconds. |
| `PORT` | `5173` | Local HTTP server port. |
| `AIRBNB_API_BASE_URL` | none | Base URL for an approved Airbnb partner API or PMS/channel-manager API. |
| `AIRBNB_API_TOKEN` | none | Bearer token for the configured review API. |
| `AIRBNB_TIMEOUT_MS` | `15000` | Timeout for configured review API requests in milliseconds. |
| `AIRBNB_REVIEWS_PATH` | `/reviews` | Path used to load reviews from the configured API. |
| `AIRBNB_REPLY_PATH_TEMPLATE` | `/reviews/:id/reply` | Path template used to post a reply. `:id` is replaced with the review ID. |

## Local Routes

| Route | Method | Definition |
|---|---|---|
| `/` | `GET`, `HEAD` | Serves the review writer UI. |
| `/api/health` | `GET` | Reports server health, selected model, and whether an API key is configured. |
| `/api/generate` | `POST` | Validates user input, calls OpenAI, validates the model result, and returns drafts. |
| `/api/airbnb/reviews` | `GET` | Loads live reviews through the configured adapter, or demo reviews when unconfigured. |
| `/api/airbnb/reviews/:id/suggest` | `POST` | Generates four warm, appreciative, humanized reply versions for the selected review. |
| `/api/airbnb/reviews/:id/reply` | `POST` | Posts the selected reply through the configured adapter, or saves locally in demo mode. |

## Generate Request

`POST /api/generate` accepts JSON with these fields:

| Field | Type | Definition |
|---|---|---|
| `mode` | string | `guest-review` or `review-response`. |
| `guestName` | string | Optional guest name or first name. |
| `propertyName` | string | Optional listing or property context. |
| `rating` | string | Optional rating context. |
| `staySummary` | string | Factual stay details. |
| `guestReview` | string | Required when `mode` is `review-response`. |
| `highlights` | string | Positive facts to include. |
| `concerns` | string | Issues to phrase carefully as observable behavior. |
| `tone` | string | Draft tone preference. |
| `length` | string | Draft length preference. |
| `language` | string | Output language preference. |
| `privateNotes` | string | Private context for model guidance only. |
| `includePrivateFeedback` | boolean | Adds one private-feedback style option when true. |

The server rejects requests with too little context, missing response-review text, or more than 6,000 combined characters.

## Generate Response

Successful responses use this shape:

```json
{
  "model": "gpt-5.2",
  "result": {
    "drafts": ["...", "...", "...", "..."],
    "notes": ["...", "..."],
    "best_fit": "..."
  }
}
```

`server.js` asks OpenAI for structured output using `text.format.type = json_schema`, then validates the parsed result before returning it to the UI. The UI expects exactly four draft versions.

The structured output schema requires:

- `drafts`: exactly four strings
- `notes`: two to four strings
- `best_fit`: one non-empty string

## Loaded Review Shape

Live API responses are normalized into this shape:

```json
{
  "id": "review-id",
  "guestName": "Maya",
  "propertyName": "Lakeside studio near downtown",
  "rating": 5,
  "submittedAt": "2026-06-15",
  "review": "Guest review text",
  "status": "needs_reply",
  "postedReply": ""
}
```

The adapter accepts common field variants such as `guest_name`, `listing.name`, `public_review`, `comment`, `host_reply`, and `reply_status`.

Review text is trimmed during normalization. Suggestion requests fail with a clear `400` response if a selected review has no public text to answer.

## Posting Workflow

1. `GET /api/airbnb/reviews` loads reviews.
2. The host selects a review.
3. `POST /api/airbnb/reviews/:id/suggest` generates four reply versions.
4. The host chooses a version and can edit it in the text area.
5. `POST /api/airbnb/reviews/:id/reply` posts the selected reply.

In demo mode, posting updates the in-memory demo review only. In configured mode, posting calls:

```txt
{AIRBNB_API_BASE_URL}{AIRBNB_REPLY_PATH_TEMPLATE}
```

with `:id` replaced by the encoded review ID and JSON body:

```json
{ "reply": "Selected host reply" }
```

## Drafting Rules

The prompt and schema enforce these product rules:

- do not invent facts
- avoid protected-class references and sensitive personal details
- avoid accusations, threats, refund promises, and unsupported platform-policy claims
- phrase concerns as observable behavior
- return ready-to-paste draft text without markdown headings
- sound warm, appreciative, and specific to the review
- avoid stiff customer-service scripts and generic AI phrasing

The final review remains the host's responsibility. The generated text should be read and edited before posting.

## UI Definitions

| Term | Definition |
|---|---|
| Review guest | Drafts a host review about a guest after checkout. |
| Respond publicly | Drafts a public response to a guest's posted review. |
| Generate versions | Produces four different reply options for the selected loaded review. |
| Post reply | Sends the selected, editable reply to the configured review API, or saves locally in demo mode. |
| Private-feedback style option | A draft variant suitable for private guest feedback, not an Airbnb public response. |
| Best fit | The model's safest recommended option based on the supplied facts. |
| Notes | Short cautions explaining factual or tone constraints to consider before posting. |

## Audit Fixes Applied

- Replaced prompt-only JSON with structured output and server-side result validation.
- Added OpenAI request timeout handling.
- Added client-side validation that mirrors server validation.
- Required guest review text before generating a public response.
- Added a visible UI control for `includePrivateFeedback`.
- Added accessible copy-status announcements.
- Raised button touch targets to 44px.
- Added explicit focus-visible styling.
- Added `GET /api/health`.
- Hardened static file routing and missing asset handling.
- Added review loading, reply suggestion, and reply posting routes.
- Added configurable Airbnb/PMS adapter support with demo fallback.
- Reworked the UI around loaded reviews, selectable reply versions, editing, and posting.
- Added configured review API timeout handling.
- Tightened structured output schema counts for exactly four drafts and two to four notes.
- Added selected-review ARIA state, live connection status, and busy state announcements.
- Added clear handling for reviews with no public text.

## Known Limits

- Live Airbnb posting requires an approved Airbnb partner API or PMS/channel-manager API.
- The app does not persist history.
- The app does not moderate every possible platform-policy issue.
- The app does not authenticate users. It is built for local use.
