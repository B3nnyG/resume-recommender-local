# Resume recommender (local test server)

Upload a `.docx` or `.pdf` resume and it automatically generates 2-3 client-ready
recommendation sentences, with a one-click button to translate them into
Simplified Chinese.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Add your Anthropic API key:
   ```
   cp .env.example .env
   ```
   Then open `.env` and paste your key into `ANTHROPIC_API_KEY`.
   Get a key at https://console.anthropic.com if you don't have one.

3. Start the server:
   ```
   npm start
   ```

4. Open http://localhost:3000 in your browser.

## How it works

- Uploading a file sends it to `/api/extract`, which pulls the text out
  server-side (`mammoth` for .docx, `pdfjs-dist` for .pdf).
- That text is immediately sent to `/api/generate`, which calls Claude to
  write the recommendation — no extra clicks needed.
- If a file can't be read automatically (e.g. a scanned PDF with no text
  layer), a paste box appears so you can supply the text manually instead.
- "Translate to Chinese" calls `/api/translate` on the (possibly edited)
  recommendation text.

Your API key stays on the server — the browser never sees it, unlike the
in-chat artifact version which called the API directly from the browser.

## Notes

- Default model is `claude-sonnet-5`. Change `ANTHROPIC_MODEL` in `.env` to
  switch (e.g. to `claude-haiku-4-5-20251001` for a cheaper/faster option).
- Uploaded files are processed in memory and never written to disk.
- This is a minimal test harness, not a production build — no auth, rate
  limiting, or persistence.
