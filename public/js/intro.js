(function () {
  var overlay = document.getElementById('intro-overlay');
  var content = document.getElementById('page-content');
  if (!overlay || !content) return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal() {
    overlay.classList.add('intro-hide');
    content.classList.add('content-show');
    setTimeout(function () {
      overlay.style.display = 'none';
    }, 550);
  }

  if (prefersReduced) {
    reveal();
    return;
  }

  // matches the 2s duration set on the .word-* keyframe animations in intro.css,
  // plus a short hold so the finished composition is readable before it clears
  var INTRO_TOTAL_MS = 2000 + 400;
  var introTimer = setTimeout(reveal, INTRO_TOTAL_MS);

  // let people skip the intro by tapping/clicking it
  overlay.addEventListener('click', function () {
    clearTimeout(introTimer);
    reveal();
  });
})();