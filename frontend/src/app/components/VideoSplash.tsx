"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/** sessionStorage flag so the intro plays once per login, not on every refresh. */
const SEEN_KEY = "cortex_intro_shown";
/** The animation in /public/cortex-video runs for 46s, then we auto-dismiss. */
const VIDEO_DURATION_MS = 46_000;

/**
 * Full-screen product video shown right after the user logs in.
 * Plays the self-contained Cortex animation (served from /cortex-video) in an
 * iframe, with a Skip button (and Esc) to dismiss early.
 */
export default function VideoSplash() {
  const { user, token, loading } = useAuth();
  const isAuthed = !!(user || token);
  const [show, setShow] = useState(false);

  // Decide whether to show once auth has resolved.
  useEffect(() => {
    if (loading || !isAuthed) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* sessionStorage unavailable — just show it */
    }
    if (seen) return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(true);
  }, [loading, isAuthed]);

  // Auto-dismiss when the video finishes, and allow Esc to skip.
  useEffect(() => {
    if (!show) return;
    const timer = window.setTimeout(() => setShow(false), VIDEO_DURATION_MS);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a]">
      <iframe
        src="/cortex-video/index.html"
        title="Cortex product video"
        className="h-full w-full flex-1 border-0"
        allow="autoplay"
      />

      <button
        onClick={() => setShow(false)}
        title="Skip intro (Esc)"
        className="absolute top-5 right-5 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
      >
        Skip intro
        <X size={14} />
      </button>
    </div>
  );
}
