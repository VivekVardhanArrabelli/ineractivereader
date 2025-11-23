# ChapterPal — Conversational Reader

An interactive reading environment inspired by chapterpal.com. Upload research papers or books, reveal them one sentence at a time, and ask Grok 4.1 clarifying questions without losing your place.

## Features
- **Progressive disclosure:** Only the beginning of the text is visible. Double-tap the right edge (or double-click) to reveal one more sentence, double-tap the left edge to rewind.
- **Multi-format uploads:** Drop `.pdf`, `.txt`, `.md`, or `.markdown` files. PDFs are parsed in-browser via `pdfjs-dist`, and previews are capped at 2,200 sentences for responsiveness.
- **Inline Q&A:** A floating composer routes every question to Grok 4.1 through a Next.js API route. Answers open in an overlay; tapping outside closes it so you can keep revealing the main text.
- **Mobile-first UI:** Dark glass aesthetic, HUD badges, and gesture hints that mirror the ChapterPal experience shown in the reference screenshot.

## Getting started
```bash
npm install
npm run dev
# visit http://localhost:3000
```

## Connect to Grok 4.1
Create `.env.local` with your xAI key so questions are forwarded to Grok:
```bash
echo "GROK_API_KEY=sk-your-xai-key" > .env.local
```

If the key is missing, the `/api/ask` route responds with a friendly placeholder so you can still demo the UI locally.

## How to use the reader
1. Click **Upload a book or paper** and select a supported file.
2. Reveal the document slowly: double-tap / double-click the right half of the reading pane for the next sentence, double-tap the left half to unreveal.
3. Type any question in the bottom composer—even while paused mid-sentence. Answers appear in a Q&A overlay; tap anywhere outside to return to the main text.

## Key files
- `src/app/page.tsx` — Reader UI, gesture logic, file parsing, and Q&A overlay.
- `src/app/api/ask/route.ts` — Serverless proxy that forwards prompts to the Grok 4.1 `chat/completions` endpoint.
- `src/app/globals.css` — Tailwind (v4) globals that implement the dark chrome look.

Enjoy the calmer reading flow!
