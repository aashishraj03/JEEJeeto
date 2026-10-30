// ===== Guarded Cross-Chapter Topic Links =====
// Include this ONE script, unmodified, on every notes chapter page:
//   <script src="/js/notes-topic-links.js"></script>
//
// TWO KINDS of topic links exist on a notes page:
//
// 1. SAME-PAGE jump (e.g. clicking "Sector" in this chapter's own table of
//    contents to scroll down to the Projectile Motion section further down THIS page):
//    just use a plain anchor link, nothing special needed —
//      <a href="#projectile-motion">Projectile Motion</a>
//    with a matching <h2 id="projectile-motion">Projectile Motion</h2> elsewhere on the page.
//    This works natively via the browser; this script does nothing to it,
//    and doesn't need to — the student is already viewing this (already
//    unlocked) page.
//
// 2. CROSS-CHAPTER link (this chapter's notes mention a concept that's
//    actually explained in a DIFFERENT chapter's notes page) — mark it
//    like this instead:
//      <a href="#" data-cross-chapter="c11-phy-03"
//         data-target="/notes/class11/physics/other-chapter/other-chapter.html#some-topic">
//        Some Other Topic
//      </a>
//    Before navigating anywhere, this checks /api/notes/access/:chapterKey
//    (the same endpoint that already gates other parts of the site). If the
//    student doesn't have access to THAT chapter, navigation is blocked and
//    a small "locked, unlock to view" message appears next to the link
//    instead — the target page never opens.

(function () {
  "use strict";

  function showLockedMessage(link) {
    let msg = link.nextElementSibling;
    if (!msg || !msg.classList || !msg.classList.contains("cross-chapter-locked-msg")) {
      msg = document.createElement("span");
      msg.className = "cross-chapter-locked-msg";
      link.insertAdjacentElement("afterend", msg);
    }
    msg.innerHTML = ' <a href="/subscription.html">🔒 Locked — unlock this chapter to view</a>';
  }

  function handleClick(e) {
    const link = e.currentTarget;
    const chapterKey = link.dataset.crossChapter;
    const target = link.dataset.target;
    if (!chapterKey || !target) return; // not a guarded link — let default behavior happen

    e.preventDefault();

    fetch("/api/notes/access/" + encodeURIComponent(chapterKey), { credentials: "include" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.hasAccess) {
          window.location.href = target;
        } else if (data && data.requiresAuth) {
          window.location.href = "/login.html?redirect=" + encodeURIComponent(target);
        } else {
          showLockedMessage(link);
        }
      })
      .catch(function () {
        showLockedMessage(link);
      });
  }

  document.querySelectorAll("a[data-cross-chapter]").forEach(function (link) {
    link.addEventListener("click", handleClick);
  });
})();