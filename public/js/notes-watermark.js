// ===== Notes Anti-Piracy Watermark =====
// Include this ONE script, unmodified, on every notes chapter page:
//   <script src="/js/notes-watermark.js"></script>
// No per-page configuration needed (unlike notes-timer.js) — it fetches
// the logged-in student's own name/email/phone and tiles them as a faint,
// rotated background pattern across the visible viewport, so any
// screenshot or shared photo of this page carries a trace of who it came
// from.
//
// HONEST LIMITATION: this is a deterrent, not real DRM. Anyone with
// browser devtools can delete the overlay, or disable JavaScript entirely,
// before taking a screenshot. What this DOES do: raises friction for
// casual/lazy sharing, and makes an accidental leak traceable back to a
// specific student. It will not stop someone determined and technically
// capable.
//
// If the visitor isn't logged in (e.g. viewing a free preview chapter
// with no account), this silently does nothing — there's no identity to
// watermark with, and that's fine.

(function () {
  "use strict";

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildWatermarkTileUrl(lines) {
    const fontSize = 13;
    const lineHeight = fontSize + 8;
    const tileWidth = 340;
    const tileHeight = 170;
    const rotate = -28;

    const textEls = lines.map(function (line, i) {
      return '<text x="12" y="' + (24 + i * lineHeight) + '" font-size="' + fontSize +
        '" font-family="monospace" fill="#000000" fill-opacity="0.105">' + escapeXml(line) + '</text>';
    }).join("");

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + tileWidth + '" height="' + tileHeight + '">' +
      '<g transform="rotate(' + rotate + ' ' + (tileWidth / 2) + ' ' + (tileHeight / 2) + ')">' + textEls + '</g>' +
      '</svg>';

    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function injectWatermark(info) {
    if (document.getElementById("__notes_watermark_overlay")) return; // already present

    const lines = [info.name || "", info.email || "", info.phone || ""].filter(Boolean);
    if (lines.length === 0) return;

    const overlay = document.createElement("div");
    overlay.id = "__notes_watermark_overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none"; // never blocks clicks/selection on the real content
    overlay.style.zIndex = "2147483647";  // sits above all page content
    overlay.style.backgroundRepeat = "repeat";
    overlay.style.backgroundImage = 'url("' + buildWatermarkTileUrl(lines) + '")';

    document.body.appendChild(overlay);

    // Light tamper-resistance: if the overlay node gets removed from the
    // DOM (e.g. via devtools), put it back. A speed bump, not a lock —
    // disabling JavaScript entirely still bypasses this completely.
    const observer = new MutationObserver(function () {
      if (!document.getElementById("__notes_watermark_overlay")) {
        document.body.appendChild(overlay);
      }
    });
    observer.observe(document.body, { childList: true });
  }

  function init() {
    fetch("/api/notes/watermark-info", { credentials: "include" })
      .then(function (res) {
        if (!res.ok) return null; // not logged in, or an error — fail silently, no watermark
        return res.json();
      })
      .then(function (info) {
        if (info) injectWatermark(info);
      })
      .catch(function () {
        // Best-effort — a failed fetch just means no watermark this load.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();