const MAX_FILE_BYTES = 10 * 1024 * 1024; // must match server's multer limit

const pageSub = document.getElementById("page-sub");
const page1 = document.getElementById("page-1");
const page2 = document.getElementById("page-2");
const page3 = document.getElementById("page-3");
const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");

const zone = document.getElementById("zone");
const zoneIcon = document.getElementById("zone-icon");
const zoneText = document.getElementById("zone-text");
const zoneSub = document.getElementById("zone-sub");
const fileInput = document.getElementById("file-input");
const filenameEl = document.getElementById("filename");
const readyNote = document.getElementById("ready-note");
const resetBtn = document.getElementById("reset-btn");

const fallback = document.getElementById("fallback");
const fallbackTitle = document.getElementById("fallback-title");
const fallbackText = document.getElementById("fallback-text");
const fallbackSubmit = document.getElementById("fallback-submit");
const fallbackBtnLabel = document.getElementById("fallback-btn-label");

const errorBanner = document.getElementById("error-banner");
const errorText = document.getElementById("error-text");

const d1 = document.getElementById("d1");
const d2 = document.getElementById("d2");
const d3 = document.getElementById("d3");

const recText = document.getElementById("rec-text");
const copyRecBtn = document.getElementById("copy-rec");

const transText = document.getElementById("trans-text");
const copyTransBtn = document.getElementById("copy-trans");

const PAGE_SUBTEXT = {
  1: "Upload a resume and we'll write the recommendation for you.",
  2: "Review and edit the recommendation before sending it along.",
  3: "Check the Chinese translation, then it's ready to send.",
};

let currentPage = 1;
let busy = false;
let controller = null;
let lastResumeText = ""; // extracted/pasted resume text, kept for retries
let hasRecommendation = false;
let translatedForText = null; // tracks which recommendation text the current translation matches

// ---------- small helpers ----------

function showError(message) {
  errorText.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.hidden = true;
  errorText.textContent = "";
}

function setDots(n, errored) {
  [d1, d2, d3].forEach((el, i) => {
    el.classList.remove("active", "done", "error");
    if (errored && i === n - 1) {
      el.classList.add("error");
    } else if (i < n - 1) {
      el.classList.add("done");
      el.textContent = "\u2713";
    } else if (i === n - 1) {
      el.classList.add("active");
      el.textContent = i + 1;
    } else {
      el.textContent = i + 1;
    }
  });
}

function validateFile(file) {
  if (!file) return { valid: false, error: "No file selected." };
  if (file.size === 0) return { valid: false, error: "That file looks empty. Try a different one." };
  if (file.size > MAX_FILE_BYTES) {
    return { valid: false, error: "That file is larger than 10MB. Try a smaller file." };
  }
  const isDocx = /\.docx$/i.test(file.name);
  const isPdf = /\.pdf$/i.test(file.name);
  if (!isDocx && !isPdf) {
    return { valid: false, error: "Please upload a .docx or .pdf file." };
  }
  return { valid: true };
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function extractText(file, signal) {
  const formData = new FormData();
  formData.append("resume", file);
  const response = await fetch("/api/extract", { method: "POST", body: formData, signal });
  const data = await parseJsonSafe(response);
  if (!response.ok) throw new Error(data.error || "Couldn't read that file.");
  if (!data.text) throw new Error("Couldn't read that file.");
  return data.text;
}

async function generateRecommendation(resumeText, signal) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resumeText }),
    signal,
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) throw new Error(data.error || "Couldn't generate a recommendation.");
  if (!data.recommendation) throw new Error("Couldn't generate a recommendation.");
  return data.recommendation;
}

async function translateApi(text, signal) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  const data = await parseJsonSafe(response);
  if (!response.ok) throw new Error(data.error || "Couldn't translate.");
  if (!data.translation) throw new Error("Couldn't translate.");
  return data.translation;
}

// ---------- page rendering ----------

function renderPage() {
  page1.hidden = currentPage !== 1;
  page2.hidden = currentPage !== 2;
  page3.hidden = currentPage !== 3;
  pageSub.textContent = PAGE_SUBTEXT[currentPage];
  setDots(currentPage);
  updateNav();
}

function updateNav() {
  if (currentPage === 1) {
    backBtn.hidden = true;
    forwardBtn.hidden = false;
    forwardBtn.textContent = "Next";
    forwardBtn.disabled = busy || !hasRecommendation;
  } else if (currentPage === 2) {
    backBtn.hidden = false;
    backBtn.disabled = busy;
    forwardBtn.hidden = false;
    if (!forwardBtn.dataset.loading) forwardBtn.textContent = "Next";
    forwardBtn.disabled = busy;
  } else {
    backBtn.hidden = false;
    backBtn.disabled = busy;
    forwardBtn.hidden = false;
    forwardBtn.textContent = "Start over";
    forwardBtn.disabled = busy;
  }
}

function goToPage(n) {
  currentPage = n;
  renderPage();
}

// ---------- state transitions ----------

function setZoneIdle() {
  zoneIcon.classList.remove("spin");
  zoneIcon.textContent = "\u2191";
  zoneText.textContent = "Drop it here or click to browse";
  zoneSub.hidden = false;
  zone.classList.remove("busy");
}

function setZoneBusy(message) {
  zoneIcon.classList.add("spin");
  zoneIcon.textContent = "\u21bb";
  zoneText.textContent = message;
  zoneSub.hidden = true;
  zone.classList.add("busy");
}

function setBusy(isBusy) {
  busy = isBusy;
  fileInput.disabled = isBusy;
  updateNav();
}

function markRecommendationReady(text) {
  recText.value = text;
  hasRecommendation = true;
  translatedForText = null; // new/changed recommendation invalidates any cached translation
  readyNote.hidden = false;
  resetBtn.hidden = false;
}

function resetResultsUi() {
  recText.value = "";
  transText.value = "";
  fallback.hidden = true;
  fallbackText.value = "";
  readyNote.hidden = true;
  hasRecommendation = false;
  translatedForText = null;
}

function resetFlow() {
  if (controller) controller.abort();
  clearError();
  fileInput.value = "";
  filenameEl.hidden = true;
  filenameEl.textContent = "";
  resetBtn.hidden = true;
  lastResumeText = "";
  resetResultsUi();
  setZoneIdle();
  setBusy(false);
  goToPage(1);
}

// ---------- main flow: page 1, upload ----------

async function handleFile(file) {
  if (busy) return;

  const validation = validateFile(file);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  clearError();
  resetResultsUi();
  filenameEl.hidden = false;
  filenameEl.textContent = "\uD83D\uDCC4 " + file.name;
  resetBtn.hidden = false;

  controller = new AbortController();
  setBusy(true);

  let stage = "reading";
  try {
    setZoneBusy("Reading your resume...");
    const text = await extractText(file, controller.signal);
    lastResumeText = text;

    stage = "generating";
    setZoneBusy("Writing your recommendation...");
    setDots(2);
    const recommendation = await generateRecommendation(text, controller.signal);

    setZoneIdle();
    markRecommendationReady(recommendation);
    setDots(1); // still on page 1 — user advances deliberately via Next
  } catch (err) {
    if (err.name === "AbortError") return;
    setZoneIdle();
    showError(err.message || "Something went wrong.");
    setDots(stage === "reading" ? 1 : 2, true);

    if (stage === "reading") {
      fallbackTitle.textContent = "Paste the resume text instead";
      fallbackBtnLabel.textContent = "Generate recommendation";
      fallback.hidden = false;
    } else {
      fallbackTitle.textContent = "Generation failed — try again?";
      fallbackText.value = lastResumeText;
      fallbackBtnLabel.textContent = "Retry";
      fallback.hidden = false;
    }
  } finally {
    setBusy(false);
    controller = null;
  }
}

zone.addEventListener("click", () => {
  if (!busy) fileInput.click();
});
zone.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && !busy) {
    e.preventDefault();
    fileInput.click();
  }
});
zone.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!busy) zone.classList.add("drag");
});
zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
zone.addEventListener("drop", (e) => {
  e.preventDefault();
  zone.classList.remove("drag");
  if (busy) return;
  const files = e.dataTransfer && e.dataTransfer.files;
  if (files && files.length > 0) {
    if (files.length > 1) showError("Only the first file will be used.");
    handleFile(files[0]);
  }
});
fileInput.addEventListener("change", (e) => handleFile(e.target.files && e.target.files[0]));

resetBtn.addEventListener("click", resetFlow);

fallbackSubmit.addEventListener("click", async () => {
  const text = fallbackText.value.trim();
  if (!text) {
    showError("Paste some resume text first.");
    return;
  }
  clearError();
  fallbackSubmit.disabled = true;
  fallbackBtnLabel.textContent = "Generating...";
  controller = new AbortController();
  setBusy(true);
  try {
    const recommendation = await generateRecommendation(text, controller.signal);
    lastResumeText = text;
    fallback.hidden = true;
    markRecommendationReady(recommendation);
    setDots(1);
  } catch (err) {
    if (err.name === "AbortError") return;
    showError(err.message || "Couldn't generate a recommendation.");
    setDots(2, true);
  } finally {
    fallbackSubmit.disabled = false;
    fallbackBtnLabel.textContent = "Generate recommendation";
    setBusy(false);
    controller = null;
  }
});

// ---------- navigation: back / forward ----------

backBtn.addEventListener("click", () => {
  if (busy) return;
  if (currentPage === 2) goToPage(1);
  else if (currentPage === 3) goToPage(2);
});

forwardBtn.addEventListener("click", async () => {
  if (busy) return;

  if (currentPage === 1) {
    if (!hasRecommendation) return;
    goToPage(2);
    return;
  }

  if (currentPage === 3) {
    resetFlow();
    return;
  }

  // currentPage === 2: go to page 3, translating first if needed
  const currentRec = recText.value.trim();
  if (!currentRec) {
    showError("There's no recommendation text to translate.");
    return;
  }

  if (translatedForText === currentRec) {
    // Already translated this exact text — no need to call the API again.
    goToPage(3);
    return;
  }

  clearError();
  setBusy(true);
  forwardBtn.dataset.loading = "1";
  forwardBtn.textContent = "Translating...";
  const localController = new AbortController();
  try {
    const translation = await translateApi(currentRec, localController.signal);
    transText.value = translation;
    translatedForText = currentRec;
    goToPage(3);
  } catch (err) {
    if (err.name !== "AbortError") {
      showError(err.message || "Couldn't translate. Try again.");
      setDots(3, true);
    }
  } finally {
    delete forwardBtn.dataset.loading;
    setBusy(false);
  }
});

function wireCopy(button, textarea) {
  button.addEventListener("click", async () => {
    if (!textarea.value.trim()) return;
    try {
      await navigator.clipboard.writeText(textarea.value);
      const original = button.textContent;
      button.textContent = "Copied!";
      button.disabled = true;
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 1400);
    } catch {
      showError("Couldn't copy automatically — select the text and copy it manually.");
    }
  });
}
wireCopy(copyRecBtn, recText);
wireCopy(copyTransBtn, transText);

// Warn before leaving mid-request so an in-flight generation/translation isn't silently lost.
window.addEventListener("beforeunload", (e) => {
  if (busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// Initial paint
renderPage();
