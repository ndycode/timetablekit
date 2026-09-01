"use client";

import { ArrowUpRightIcon } from "./icons";
import { useEffect, useMemo, useRef, useState } from "react";

type DemoMessage = {
  role: "assistant" | "user";
  text: string;
};

type DemoLog = {
  code: string;
  detail: string;
  label: string;
  tone: "accent" | "danger" | "muted" | "success";
};

const DEMO_MESSAGES: DemoMessage[] = [
  { role: "user", text: "Can you read my schedule?" },
  {
    role: "assistant",
    text: "Yes. Paste sample text or choose a file. It stays in this browser.",
  },
  { role: "user", text: "Show time conflicts before I download." },
  {
    role: "assistant",
    text: "They stay visible until you fix them. The app never hides them.",
  },
  { role: "user", text: "Make a calendar file." },
  {
    role: "assistant",
    text: "Review the events, then download JSON, CSV, or ICS.",
  },
];

const DEMO_LOGS: DemoLog[] = [
  {
    code: "source.text",
    detail: "this browser · no network call",
    label: "Input read",
    tone: "accent",
  },
  {
    code: "events[6]",
    detail: "92% match · Asia/Manila",
    label: "Rows read",
    tone: "success",
  },
  {
    code: "conflicts[3]",
    detail: "please review · nothing hidden",
    label: "Conflicts found",
    tone: "danger",
  },
  {
    code: "events.updated",
    detail: "your changes are shown",
    label: "View updated",
    tone: "muted",
  },
  {
    code: "calendar.ics",
    detail: "time zone kept · works in UTC",
    label: "Calendar file made",
    tone: "accent",
  },
  {
    code: "export.ready",
    detail: "download starts here",
    label: "Download ready",
    tone: "success",
  },
];

const DEMO_STAGES = [
  "Paste a schedule to start",
  "Reading sample rows",
  "Checking dates, times, and clashes",
  "Waiting for your changes",
  "Keeping your time zone",
  "Ready to download your events",
];

const DEMO_INTERVAL_MS = 2_100;
const TYPE_SPEED_MS = 30;
const MAX_VISIBLE_MESSAGES = 4;
const MAX_VISIBLE_LOGS = 4;

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function TimetableDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stage, setStage] = useState(0);
  const [typedText, setTypedText] = useState(DEMO_STAGES[0]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setIsActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        setIsActive(true);
        observer.disconnect();
      },
      { threshold: 0.2 },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setStage(DEMO_STAGES.length - 1);
      setIsPaused(true);
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (!isActive || reducedMotion || isPaused) return;

    const timer = window.setInterval(() => {
      setStage((currentStage) => (currentStage + 1) % DEMO_STAGES.length);
    }, DEMO_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isActive, isPaused, reducedMotion]);

  useEffect(() => {
    const target = DEMO_STAGES[stage] ?? "";

    if (reducedMotion || !isActive) {
      setTypedText(target);
      return;
    }

    let characterIndex = 0;
    setTypedText("");
    const timer = window.setInterval(() => {
      characterIndex += 1;
      setTypedText(target.slice(0, characterIndex));
      if (characterIndex >= target.length) window.clearInterval(timer);
    }, TYPE_SPEED_MS);

    return () => window.clearInterval(timer);
  }, [isActive, reducedMotion, stage]);

  const visibleMessages = useMemo(() => {
    const end = stage + 1;
    const start = Math.max(0, end - MAX_VISIBLE_MESSAGES);

    return DEMO_MESSAGES.slice(start, end).map((message, index) => ({
      message,
      index: start + index,
    }));
  }, [stage]);
  const visibleLogs = useMemo(() => {
    const end = stage + 1;
    const start = Math.max(0, end - MAX_VISIBLE_LOGS);

    return DEMO_LOGS.slice(start, end).map((log, index) => ({
      index: start + index,
      log,
    }));
  }, [stage]);
  const progress = `${String(stage + 1).padStart(2, "0")}/${String(DEMO_STAGES.length).padStart(2, "0")}`;

  return (
    <div
      ref={rootRef}
      className="timetable-demo"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-stage={stage}
    >
      <p className="sr-only">
        This example shows a sample schedule being read in this browser. It
        finds conflicts, lets you make changes, and creates a calendar file.
      </p>
      <div className="demo-toolbar">
        <span className="demo-toolbar-label">LOCAL STEPS · {progress}</span>
        <button
          type="button"
          className="demo-toggle"
          aria-pressed={isPaused}
          aria-label={
            isPaused ? "Play schedule example" : "Pause schedule example"
          }
          onClick={() => setIsPaused((paused) => !paused)}
        >
          <span aria-hidden="true">{isPaused ? "▶" : "Ⅱ"}</span>
          {isPaused ? "Play" : "Pause"}
        </button>
      </div>

      <div className="demo-layout">
        <div className="demo-browser-window">
          <div className="demo-browser-chrome">
            <div className="demo-window-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="demo-address">127.0.0.1:4173/demo</div>
          </div>
          <div className="demo-browser-titlebar">
            <span className="demo-status-pill">HERE</span>
            <span>TimetableKit demo</span>
          </div>
          <div className="demo-browser-body">
            <aside
              className="demo-plan-sidebar"
              aria-label="Ways to add a schedule"
            >
              <div className="demo-plan-card is-current">
                <div>
                  <strong>Read here</strong>
                  <span>Text and CSV</span>
                </div>
                <span className="demo-plan-state">Used now</span>
              </div>
              <div className="demo-plan-card">
                <div>
                  <strong>Read files</strong>
                  <span>Images and PDF</span>
                </div>
                <span className="demo-plan-state">Runs here</span>
              </div>
              <div className="demo-sidebar-footnote">
                <span className="demo-sidebar-dot" aria-hidden="true" />
                No account or API key
              </div>
            </aside>

            <section
              className="demo-chat-panel"
              aria-label="TimetableKit local schedule reader"
            >
              <div className="demo-chat-header">
                <span>Schedule helper</span>
                <span className="demo-chat-state">sample schedule</span>
              </div>
              <div className="demo-chat-messages">
                {visibleMessages.map(({ index, message }) => (
                  <div
                    className={`demo-message demo-message-${message.role}`}
                    key={`${index}-${message.role}`}
                  >
                    <span>{message.text}</span>
                  </div>
                ))}
              </div>
              <div className="demo-chat-input" aria-hidden="true">
                <span>{typedText}</span>
                <span className="demo-caret" />
                <span className="demo-chat-count">{progress}</span>
                <ArrowUpRightIcon className="demo-send" />
              </div>
            </section>
          </div>
        </div>

        <section className="demo-backend-panel" aria-label="What happened">
          <div className="demo-backend-header">
            <span>WHAT HAPPENED</span>
            <span className="demo-backend-state">stays here</span>
          </div>
          <div className="demo-log-stack">
            {visibleLogs.map(({ index, log }) => (
              <div
                className={`demo-log demo-log-${log.tone}`}
                key={`${index}-${log.code}`}
              >
                <div className="demo-log-header">
                  <span className="demo-log-symbol" aria-hidden="true">
                    {log.tone === "danger"
                      ? "!"
                      : log.tone === "success"
                        ? "✓"
                        : "·"}
                  </span>
                  <strong>{log.label}</strong>
                </div>
                <code>{log.code}</code>
                <span className="demo-log-detail">{log.detail}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
