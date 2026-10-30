// ===== Notes Active Reading Timer =====
// Include this ONE script on every chapter's notes page — don't write
// per-chapter tracking code. It reads which chapter it's on from its own
// <script> tag's data-chapter attribute:
//
//   <script src="js/notes-timer.js" data-chapter="c11-phy-02"></script>
//
// IMPORTANT: don't add `async` or `defer` to that tag — this script relies
// on document.currentScript to find its own data-chapter value, which only
// works reliably for a plain, synchronously-executed <script> tag. Place it
// near the end of <body>, after your chapter content, same as any other
// non-deferred script.
//
// Only counts time while the tab is actually visible AND the window has
// focus — switching tabs, minimizing, or clicking into another app pauses
// the count immediately and resumes the instant the student comes back.
// Nothing is sent while logged out (silently skipped — doesn't block or
// affect the reading experience either way).

(function () {
  "use strict";

  const scriptTag = document.currentScript || document.querySelector('script[data-chapter]');
  const chapterKey = scriptTag && scriptTag.dataset ? scriptTag.dataset.chapter : null;

  if (!chapterKey) {
    console.warn('notes-timer.js: no data-chapter attribute found on this page\'s script tag — reading time will not be tracked here.');
    return;
  }

  const FLUSH_THRESHOLD_SECONDS = 20; // sync to the server every 20s of genuinely active reading
  const MAX_SECONDS_PER_SYNC = 60;    // sanity clamp matching the server's own clamp

  let activeSecondsSinceLastFlush = 0;

  function isPageActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  function tick() {
    if (isPageActive()) {
      activeSecondsSinceLastFlush++;
      if (activeSecondsSinceLastFlush >= FLUSH_THRESHOLD_SECONDS) {
        flush(false);
      }
    }
  }

  function flush(useBeacon) {
    if (activeSecondsSinceLastFlush <= 0) return;

    const seconds = Math.min(activeSecondsSinceLastFlush, MAX_SECONDS_PER_SYNC);
    activeSecondsSinceLastFlush = 0;

    const payload = JSON.stringify({ chapterKey: chapterKey, seconds: seconds });

    if (useBeacon && navigator.sendBeacon) {
      // sendBeacon survives page unload, unlike a normal fetch which can be
      // cancelled mid-flight when the tab closes. Blob + explicit content
      // type so the server's express.json() parses it as JSON correctly.
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/notes/track-time", blob);
    } else {
      fetch("/api/notes/track-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: payload,
        keepalive: true
      }).catch(function () {
        // Best-effort telemetry — a dropped sync just means a little less
        // time recorded; the next successful sync isn't affected by it.
      });
    }
  }

  setInterval(tick, 1000);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", function () {
    flush(true);
  });
})();