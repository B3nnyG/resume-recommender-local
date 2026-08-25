require("dotenv").config();

const path = require("path");
const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");
async function extractPdfText(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text.trim();
}

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "\n[warning] ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key before generating recommendations.\n"
  );
}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const PROMPT_GENERATE = (text) => `You are writing a short recommendation for a recruiter submitting this candidate to a client. Based on the resume text below, write exactly 2-3 concise, professional bullet points without sounding like it's AI written, highlighting the candidate's strongest qualifications, relevant experience. Do not invent details not present in the resume. Format each point on its own line, starting with "• ". Return only the bullet points, no preamble, no headers.

Resume text:
"""
${text}
"""`;

const PROMPT_TRANSLATE = (text) => `Translate the following professional recommendation into Simplified Chinese, in a human tone without sounding like it is AI written and register appropriate for a business recruitment submission to a client. Keep person names, company names, and technical terms accurate. Preserve the bullet point formatting exactly. Return only the translated text, no preamble, no quotation marks.

Text:
"""
${text}
"""`;

async function callClaude(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Empty response from Claude");
  return text;
}

// Extract text from an uploaded .docx or .pdf
app.post("/api/extract", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }
    const name = req.file.originalname.toLowerCase();
    let text = "";

    if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      text = result.value.trim();
    } else if (name.endsWith(".pdf")) {
      text = await extractPdfText(req.file.buffer);
    } else {
      return res.status(400).json({ error: "Only .docx and .pdf files are supported." });
    }

    if (!text) {
      return res.status(422).json({
        error:
          "Couldn't find readable text in that file — it may be a scanned image. Try pasting the resume text instead.",
      });
    }

    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't read that file. Try pasting the resume text instead." });
  }
});

// Generate the recommendation sentences
app.post("/api/generate", async (req, res) => {
  try {
    const { resumeText } = req.body || {};
    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ error: "resumeText is required." });
    }
    const recommendation = await callClaude(PROMPT_GENERATE(resumeText));
    res.json({ recommendation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't generate a recommendation. Check your API key and try again." });
  }
});

// Translate the recommendation into Chinese
app.post("/api/translate", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required." });
    }
    const translation = await callClaude(PROMPT_TRANSLATE(text));
    res.json({ translation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Couldn't translate. Check your API key and try again." });
  }
});

app.listen(PORT, () => {
  console.log(`\nResume recommender running at http://localhost:${PORT}\n`);
});

// Catches errors thrown by middleware before a route handler runs —
// multer's file-size limit, and malformed JSON bodies — so the frontend
// always gets JSON back instead of Express's default HTML error page.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "That file is larger than 10MB. Try a smaller file." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed request." });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});
