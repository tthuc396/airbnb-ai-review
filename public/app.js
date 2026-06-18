const loadReviewsButton = document.querySelector("#loadReviewsButton");
const suggestButton = document.querySelector("#suggestButton");
const postButton = document.querySelector("#postButton");
const copyButton = document.querySelector("#copyButton");
const connectionStatus = document.querySelector("#connectionStatus");
const reviewCount = document.querySelector("#reviewCount");
const reviewList = document.querySelector("#reviewList");
const reviewsEmpty = document.querySelector("#reviewsEmpty");
const selectedReview = document.querySelector("#selectedReview");
const replyOptions = document.querySelector("#replyOptions");
const replyEditor = document.querySelector("#replyEditor");
const errorState = document.querySelector("#errorState");
const successState = document.querySelector("#successState");
const notes = document.querySelector("#notes");
const copyStatus = document.querySelector("#copyStatus");
const reviewTemplate = document.querySelector("#reviewTemplate");
const optionTemplate = document.querySelector("#optionTemplate");

const optionLabels = ["Concise", "Warm personal", "Polished", "Issue-aware"];

let reviews = [];
let selectedReviewId = "";
let selectedOptionIndex = 0;

loadReviewsButton.addEventListener("click", loadReviews);
suggestButton.addEventListener("click", suggestReplies);
postButton.addEventListener("click", postReply);
copyButton.addEventListener("click", async () => {
  const reply = replyEditor.value.trim();
  if (!reply) return;

  await copyText(reply);
  copyStatus.textContent = "Selected reply copied.";
  copyButton.textContent = "Copied";
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1200);
});

replyEditor.addEventListener("input", syncActionState);

init();

async function init() {
  await loadHealth();
  await loadReviews();
}

async function loadHealth() {
  try {
    const data = await requestJson("/api/health");
    connectionStatus.textContent = data.airbnb_mode === "configured" ? "Live API" : "Demo reviews";
  } catch {
    connectionStatus.textContent = "Offline";
  }
}

async function loadReviews() {
  setBusy(loadReviewsButton, true, "Loading...");
  reviewList.setAttribute("aria-busy", "true");
  clearMessage();

  try {
    const data = await requestJson("/api/airbnb/reviews");
    reviews = Array.isArray(data.reviews) ? data.reviews : [];
    renderReviews();

    if (reviews.length) {
      selectReview(reviews[0].id);
    } else {
      selectedReviewId = "";
      renderSelectedReview();
    }

    connectionStatus.textContent = data.mode === "configured" ? "Live API" : "Demo reviews";
    if (data.message) showSuccess(data.message);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(loadReviewsButton, false, "Load reviews");
    reviewList.setAttribute("aria-busy", "false");
  }
}

async function suggestReplies() {
  const review = currentReview();
  if (!review) return;

  setBusy(suggestButton, true, "Generating...");
  replyOptions.setAttribute("aria-busy", "true");
  clearMessage();
  replyOptions.classList.add("hidden");
  notes.classList.add("hidden");
  replyOptions.innerHTML = "";
  notes.innerHTML = "";

  try {
    const data = await requestJson(`/api/airbnb/reviews/${encodeURIComponent(review.id)}/suggest`, {
      method: "POST",
      body: JSON.stringify({})
    });

    renderReplyOptions(data.result);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(suggestButton, false, "Generate versions");
    replyOptions.setAttribute("aria-busy", "false");
  }
}

async function postReply() {
  const review = currentReview();
  const reply = replyEditor.value.trim();

  if (!review || !reply) return;

  setBusy(postButton, true, "Posting...");
  clearMessage();

  try {
    const data = await requestJson(`/api/airbnb/reviews/${encodeURIComponent(review.id)}/reply`, {
      method: "POST",
      body: JSON.stringify({ reply })
    });

    review.status = data.mode === "demo" ? "posted_demo" : "posted";
    review.postedReply = reply;
    renderReviews();
    renderSelectedReview();
    showSuccess(data.message || "Reply posted.");
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(postButton, false, "Post reply");
    syncActionState();
  }
}

function renderReviews() {
  reviewList.innerHTML = "";
  reviewCount.textContent = String(reviews.length);
  reviewsEmpty.classList.toggle("hidden", reviews.length > 0);

  reviews.forEach((review) => {
    const fragment = reviewTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".review-item");

    button.dataset.reviewId = review.id;
    button.classList.toggle("selected", review.id === selectedReviewId);
    button.setAttribute("aria-pressed", String(review.id === selectedReviewId));
    button.querySelector(".review-guest").textContent = review.guestName || "Guest";
    button.querySelector(".review-rating").textContent = formatRating(review.rating);
    button.querySelector(".review-property").textContent = review.propertyName || "Listing";
    button.querySelector(".review-excerpt").textContent = review.review || "No review text provided.";
    button.querySelector(".review-status").textContent = formatStatus(review.status);
    button.addEventListener("click", () => selectReview(review.id));

    reviewList.appendChild(button);
  });
}

function selectReview(reviewId) {
  selectedReviewId = reviewId;
  selectedOptionIndex = 0;
  replyOptions.innerHTML = "";
  replyOptions.classList.add("hidden");
  replyEditor.value = "";
  notes.innerHTML = "";
  notes.classList.add("hidden");
  clearMessage();
  renderReviews();
  renderSelectedReview();
  syncActionState();
}

function renderSelectedReview() {
  const review = currentReview();

  if (!review) {
    selectedReview.textContent = "Select a review to generate warm, appreciative reply options.";
    suggestButton.disabled = true;
    suggestButton.title = "";
    syncActionState();
    return;
  }

  selectedReview.innerHTML = `
    <div class="selected-meta">
      <strong>${escapeHtml(review.guestName || "Guest")}</strong>
      <span>${escapeHtml(formatRating(review.rating))}</span>
      <span>${escapeHtml(review.submittedAt || "No date")}</span>
    </div>
    <div class="selected-property">${escapeHtml(review.propertyName || "Listing")}</div>
    <p>${escapeHtml(review.review || "No review text provided.")}</p>
    ${
      review.postedReply
        ? `<div class="posted-reply"><strong>Posted reply:</strong> ${escapeHtml(review.postedReply)}</div>`
        : ""
    }
  `;

  suggestButton.disabled = !String(review.review || "").trim();
  suggestButton.title = suggestButton.disabled ? "This review has no public text to respond to." : "";
  syncActionState();
}

function renderReplyOptions(result) {
  const drafts = Array.isArray(result?.drafts) ? result.drafts : [];
  selectedOptionIndex = 0;
  replyOptions.innerHTML = "";

  drafts.forEach((draft, index) => {
    const fragment = optionTemplate.content.cloneNode(true);
    const option = fragment.querySelector(".reply-option");
    const radio = fragment.querySelector("input");
    const optionName = fragment.querySelector(".option-name");
    const text = fragment.querySelector(".draft-text");
    const copyVersionButton = fragment.querySelector(".copy-version-button");

    radio.value = String(index);
    radio.checked = index === 0;
    radio.id = `replyVersion${index}`;
    radio.setAttribute("aria-describedby", `replyVersionText${index}`);
    optionName.textContent = optionLabels[index] || `Version ${index + 1}`;
    optionName.closest("label").setAttribute("for", radio.id);
    text.id = `replyVersionText${index}`;
    text.textContent = draft;

    radio.addEventListener("change", () => {
      selectedOptionIndex = index;
      replyEditor.value = draft;
      syncSelectedOption();
      syncActionState();
    });

    option.addEventListener("click", (event) => {
      if (event.target === copyVersionButton) return;
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
    });

    copyVersionButton.addEventListener("click", async () => {
      await copyText(draft);
      copyStatus.textContent = `${optionName.textContent} version copied.`;
      copyVersionButton.textContent = "Copied";
      window.setTimeout(() => {
        copyVersionButton.textContent = "Copy";
      }, 1200);
    });

    replyOptions.appendChild(option);
  });

  if (drafts.length) {
    replyEditor.value = drafts[0];
    replyOptions.classList.remove("hidden");
  }

  renderNotes(result);
  syncSelectedOption();
  syncActionState();
}

function renderNotes(result) {
  const cautionNotes = Array.isArray(result?.notes) ? result.notes : [];
  notes.innerHTML = "";

  if (result?.best_fit) {
    const bestFit = document.createElement("div");
    bestFit.innerHTML = `<strong>Best fit:</strong> ${escapeHtml(result.best_fit)}`;
    notes.appendChild(bestFit);
  }

  cautionNotes.forEach((item) => {
    const note = document.createElement("div");
    note.textContent = item;
    notes.appendChild(note);
  });

  notes.classList.toggle("hidden", !notes.children.length);
}

function syncSelectedOption() {
  [...replyOptions.querySelectorAll(".reply-option")].forEach((option, index) => {
    option.classList.toggle("selected", index === selectedOptionIndex);
  });
}

function syncActionState() {
  const hasReview = Boolean(currentReview());
  const hasReply = Boolean(replyEditor.value.trim());
  copyButton.disabled = !hasReply;
  postButton.disabled = !hasReview || !hasReply;
}

function currentReview() {
  return reviews.find((review) => review.id === selectedReviewId);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function showError(message) {
  successState.classList.add("hidden");
  errorState.textContent = message;
  errorState.classList.remove("hidden");
}

function showSuccess(message) {
  errorState.classList.add("hidden");
  successState.textContent = message;
  successState.classList.remove("hidden");
}

function clearMessage() {
  errorState.classList.add("hidden");
  successState.classList.add("hidden");
}

function setBusy(button, isBusy, busyText) {
  button.disabled = isBusy;
  button.dataset.label ||= button.textContent.trim();
  button.setAttribute("aria-busy", String(isBusy));
  button.textContent = isBusy ? busyText : button.dataset.label;
}

function formatRating(rating) {
  return rating ? `${rating} star${Number(rating) === 1 ? "" : "s"}` : "No rating";
}

function formatStatus(status) {
  if (status === "posted_demo") return "Demo posted";
  if (status === "posted") return "Posted";
  return "Needs reply";
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
