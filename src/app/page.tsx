"use client";

import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Home,
  List,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Settings,
  UploadCloud,
} from "lucide-react";
import { nanoid } from "nanoid";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

type DocumentMeta = {
  title: string;
  byline: string;
  sentences: number;
  filename?: string;
  truncated?: boolean;
};

type PdfTextItem = {
  str?: string;
};

const DOUBLE_TAP_WINDOW = 320;
const MAX_SENTENCES = 2200;
const DEFAULT_EXCERPT = `Reasoning Language Models: A Blueprint examines how we build agents that think.

Progress in reasoning requires quiet focus. Reading everything at once is overwhelming, so ChapterPal only reveals one sentence at a time. Pause, inspect, question, and only then move forward.

Double-tap the right edge to reveal new sentences. Double-tap the left edge when you want to rewind and reconsider. Ask Grok 4.1 anything along the way and tap outside the Q&A to fall back into the main text.`;

const NAV_ITEMS = [
  { icon: Home, label: "Library" },
  { icon: List, label: "Outline" },
  { icon: Settings, label: "Controls" },
  { icon: HelpCircle, label: "Help" },
] as const;

const splitIntoSentences = (raw: string) => {
  return (
    raw
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? []
  );
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${
    units[exponent]
  }`;
};

async function extractTextFromPdf(file: File) {
  const pdfjsLib = await import("pdfjs-dist");
  const { getDocument, GlobalWorkerOptions, version } = pdfjsLib;

  if (
    typeof window !== "undefined" &&
    GlobalWorkerOptions &&
    !GlobalWorkerOptions.workerSrc
  ) {
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${
      version || "5.4.394"
    }/pdf.worker.min.js`;
  }

  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;

  let aggregated = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        if (typeof item === "string") return item;
        const candidate = item as PdfTextItem;
        return candidate.str ?? "";
      })
      .join(" ");
    aggregated += pageText + "\n\n";
  }

  return aggregated;
}

async function extractText(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }
  return file.text();
}

export default function Home() {
  const [documentMeta, setDocumentMeta] = useState<DocumentMeta>({
    title: "Reasoning Language Models: A Blueprint",
    byline: "Maciej Besta · Julia Barth · Eric Schreiber · Ales Kubicek · more",
    sentences: splitIntoSentences(DEFAULT_EXCERPT).length,
  });

  const [sentences, setSentences] = useState(() =>
    splitIntoSentences(DEFAULT_EXCERPT),
  );
  const [revealed, setRevealed] = useState(1);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [conversation, setConversation] = useState<Message[]>([]);
  const touchTracker = useRef<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const revealedSentences = useMemo(
    () => sentences.slice(0, revealed),
    [sentences, revealed],
  );

  const progress =
    sentences.length === 0 ? 0 : Math.round((revealed / sentences.length) * 100);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, chatOpen]);

  const handleReveal = () =>
    setRevealed((prev) => (prev >= sentences.length ? prev : prev + 1));

  const handleUnreveal = () =>
    setRevealed((prev) => (prev > 1 ? prev - 1 : prev));

  const handleTouch = (side: "left" | "right") => () => {
    const now = Date.now();
    const lastTap = touchTracker.current[side];
    if (now - lastTap < DOUBLE_TAP_WINDOW) {
      if (side === "right") {
        handleReveal();
      } else {
        handleUnreveal();
      }
    }
    touchTracker.current[side] = now;
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsParsing(true);
    try {
      const rawText = await extractText(file);
      const clean = rawText.replace(/\s+/g, " ").trim();
      const nextSentences = splitIntoSentences(clean).slice(0, MAX_SENTENCES);

      if (!nextSentences.length) {
        throw new Error("I couldn't find readable sentences in that file.");
      }

      setSentences(nextSentences);
      setRevealed(1);
      setDocumentMeta({
        title: file.name.replace(/\.[^.]+$/, "") || "Untitled document",
        byline: `${formatBytes(file.size)} · ${file.type || "Unknown type"}`,
        sentences: nextSentences.length,
        filename: file.name,
        truncated: nextSentences.length >= MAX_SENTENCES,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected error while parsing that file.";
      setUploadError(message);
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  };

  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) return;

    const trimmed = question.trim();
    const userMessage: Message = {
      id: nanoid(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    setConversation((prev) => [...prev, userMessage]);
    setQuestion("");
    setChatOpen(true);
    setIsAsking(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          context: revealedSentences.join(" "),
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || "Grok declined to answer.");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: nanoid(),
        role: "assistant",
        content:
          data.answer ||
          data.message ||
          "Grok 4.1 responded, but the payload was empty.",
        timestamp: Date.now(),
      };
      setConversation((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setConversation((prev) => [
        ...prev,
        {
          id: nanoid(),
          role: "assistant",
          content: `I couldn't reach Grok 4.1. ${
            error instanceof Error ? error.message : "Unknown error."
          }`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const closeChat = () => setChatOpen(false);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pb-40 pt-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/5 bg-gradient-to-br from-[#111] to-[#050505] px-6 py-5 shadow-2xl shadow-black/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5">
                <Home className="size-5 text-white/80" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-white/60">
                  ChapterPal
                </p>
                <h1 className="text-2xl font-semibold text-white">
                  Conversational Reader
                </h1>
              </div>
            </div>

            <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/70">
              {NAV_ITEMS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  aria-label={label}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-white/60">
            <span className="rounded-full border border-white/10 px-3 py-1">
              Double-tap to reveal
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              Ask Grok 4.1 anywhere
            </span>
          </div>
        </header>

        <section className="rounded-3xl border border-white/5 bg-[#0f0f0f] p-6 shadow-2xl shadow-black/40 md:p-8">
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-[0.4em] text-white/50">
              {documentMeta.filename ? "Loaded document" : "Live preview"}
            </p>
            <h2 className="text-3xl font-semibold text-white">
              {documentMeta.title}
            </h2>
            <p className="text-white/70">{documentMeta.byline}</p>
            {documentMeta.truncated && (
              <p className="text-sm text-amber-200">
                Preview capped at {MAX_SENTENCES.toLocaleString()} sentences for
                faster on-device reading.
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-col gap-4 text-sm text-white/70 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2">
                <BookOpenCheck className="size-4 text-emerald-300" />
                <span>{documentMeta.sentences} sentences ready</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2">
                <MessageCircle className="size-4 text-sky-300" />
                <span>Questions route to Grok 4.1</span>
              </div>
            </div>
              <label className="group relative flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm font-medium transition hover:border-white/40 hover:bg-white/10">
              <input
                type="file"
                  accept=".pdf,.txt,.md,.markdown"
                className="absolute inset-0 z-10 cursor-pointer opacity-0"
                onChange={handleFileChange}
                disabled={isParsing}
              />
              <UploadCloud className="size-4 text-white/80 transition group-hover:text-white" />
              {isParsing ? "Parsing your document…" : "Upload a book or paper"}
            </label>
          </div>
          {uploadError && (
            <p className="mt-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {uploadError}
            </p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-[#111418] to-[#050505] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 text-sm text-white/60">
              <span>Progress · {revealed} / {sentences.length || 1} sentences</span>
              <span>{progress}% complete</span>
            </div>
            <div className="h-1 w-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-300 to-sky-400 transition-all"
                style={{ width: `${progress}%` }}
                aria-hidden
              />
            </div>
            <div className="relative px-6 pb-24 pt-8 text-lg leading-relaxed text-white/90 sm:text-xl">
              {revealedSentences.map((sentence, idx) => (
                <p key={`${sentence}-${idx}`} className="mb-4 last:mb-0">
                  {sentence}
                </p>
              ))}

              {sentences.length === 0 && (
                <p className="text-white/50">
                  Drop a PDF, markdown, or text file to start reading with intention.
                </p>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050505] to-transparent" />

              <button
                className="absolute inset-y-6 left-0 w-1/2 cursor-pointer rounded-3xl border border-transparent text-left text-transparent outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                onDoubleClick={(event) => {
                  event.preventDefault();
                  handleUnreveal();
                }}
                onTouchEnd={handleTouch("left")}
                aria-label="Double-tap to unreveal previous sentence"
              >
                <span className="sr-only">Double-tap left side to go back.</span>
              </button>

              <button
                className="absolute inset-y-6 right-0 w-1/2 cursor-pointer rounded-3xl border border-transparent text-left text-transparent outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                onDoubleClick={(event) => {
                  event.preventDefault();
                  handleReveal();
                }}
                onTouchEnd={handleTouch("right")}
                aria-label="Double-tap to reveal the next sentence"
              >
                <span className="sr-only">Double-tap right side to go forward.</span>
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-6 text-xs font-semibold uppercase tracking-widest text-white/60">
              <div className="flex items-center gap-2">
                <ChevronLeft className="size-3.5" />
                Double-tap to rewind
              </div>
              <div className="flex items-center gap-2">
                Double-tap to reveal
                <ChevronRight className="size-3.5" />
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4 rounded-3xl border border-white/5 bg-[#0a0a0a] p-5 text-sm text-white/70">
            <div className="space-y-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.5em] text-white/45">
                Gestures
              </p>
              <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-white">
                <Plus className="size-4 text-emerald-300" />
                Double-tap right to reveal the next sentence.
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2 text-white">
                <Minus className="size-4 text-rose-300" />
                Double-tap left to hide the previous sentence.
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.5em] text-white/45">
                Q&A Flow
              </p>
              <ul className="mt-3 space-y-2 text-white/80">
                <li>Type a question anytime—no need to pause.</li>
                <li>Answers stream from Grok 4.1.</li>
                <li>Tap outside the Q&A overlay to resume reading.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.5em] text-white/45">
                Pace Controls
              </p>
              <p className="mt-2 text-white/80">
                Stay with the current idea until it sticks. Ask clarifying questions before revealing the next sentence and keep your cognitive load light.
              </p>
            </div>
          </aside>
        </section>
      </div>

      <form
        onSubmit={handleAsk}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#050505]/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
            <span>Ask Grok 4.1 anything</span>
            {isAsking && <span className="text-emerald-300">Thinking…</span>}
          </div>
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Where does this argument go next?"
              className="flex-1 resize-none bg-transparent outline-none placeholder:text-white/40"
              rows={2}
            />
            <button
              type="submit"
              disabled={isAsking || !question.trim()}
              className="flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:bg-white/30"
            >
              <Send className="size-4" />
              Send
            </button>
          </div>
        </div>
      </form>

      {chatOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
          onClick={closeChat}
        >
          <div
            className="absolute inset-x-4 bottom-24 mx-auto max-h-[60vh] max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0b] p-6 text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.5em] text-white/60">
              <span>Q&A Thread</span>
              <button
                type="button"
                onClick={closeChat}
                className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold tracking-[0.4em] uppercase"
              >
                Close
              </button>
            </div>
            <div className="h-72 overflow-y-auto pr-2 text-sm">
              {conversation.length === 0 && (
                <p className="text-white/60">
                  Ask a question to start a thread. Tap outside to fall back into the main text.
                </p>
              )}
              {conversation.map((message) => (
                <div
                  key={message.id}
                  className={`mb-3 flex flex-col gap-1 rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-white/10 text-white"
                      : "bg-emerald-500/10 text-emerald-100"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-[0.6em] text-white/60">
                    {message.role === "user" ? "You" : "Grok 4.1"}
                  </span>
                  <p>{message.content}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
