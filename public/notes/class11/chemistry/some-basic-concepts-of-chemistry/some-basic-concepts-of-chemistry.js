/**
 * 1. TOPIC DICTIONARY FOR AUTOMATIC INTERNAL CROSS-REFERENCING
 * Key: The exact phrase/keyword to match in note bodies.
 * Value: Target element ID to scroll to when clicked.
 */
const TOPIC_REGISTRY = {
  "Classification of Matter": "#matter-classification",
  "Laws of Chemical Combination": "#laws-of-combination",
  "Mole Concept": "#mole-concept",
  "Avogadro's Number": "#mole-concept",
  "Empirical Formula": "#empirical-formula",
  "Stoichiometry": "#stoichiometry",
  "Limiting Reagent": "#stoichiometry",
  "Concentration Terms": "#concentration-terms",
  "Molarity": "#concentration-terms",
  "Molality": "#concentration-terms",
  "Mole Fraction": "#concentration-terms"
};

/**
 * 2. AUTOMATIC PARSER FOR LATEX-STYLE INTERNAL LINKS
 * Recursively parses DOM text nodes to replace topic mentions with dynamic anchor links.
 */
function generateInternalLinks(container) {
  const sortedTopics = Object.keys(TOPIC_REGISTRY).sort((a, b) => b.length - a.length);
  const regexPattern = new RegExp(`\\b(${sortedTopics.map(escapeRegExp).join('|')})\\b`, 'gi');

  function walkNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parentNode = node.parentNode;
      
      // Skip already linked items, scripts, or MathJax/KaTeX elements
      if (!parentNode || 
          parentNode.tagName === 'A' || 
          parentNode.tagName === 'SCRIPT' || 
          parentNode.tagName === 'STYLE' ||
          parentNode.classList.contains('katex')) {
        return;
      }

      const text = node.nodeValue;
      if (regexPattern.test(text)) {
        regexPattern.lastIndex = 0; // Reset index
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;

        text.replace(regexPattern, (match, p1, offset) => {
          // Append preceding unlinked text
          fragment.appendChild(document.createTextNode(text.substring(lastIdx, offset)));

          // Find case-insensitive matching key
          const matchedKey = sortedTopics.find(k => k.toLowerCase() === match.toLowerCase());
          
          // Create LaTeX style link tag
          const link = document.createElement('a');
          link.className = 'latex-internal-link';
          link.href = TOPIC_REGISTRY[matchedKey];
          link.textContent = match;

          fragment.appendChild(link);
          lastIdx = offset + match.length;
        });

        fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
        parentNode.replaceChild(fragment, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Don't traverse existing hyperlinks or header titles
      if (node.tagName !== 'A' && node.tagName !== 'H1') {
        Array.from(node.childNodes).forEach(walkNodes);
      }
    }
  }

  walkNodes(container);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 3. SECURITY CONTROL IMPLEMENTATION
 */
async function initSecurityMeasures() {
  const watermarkContainer = document.getElementById('watermark-container');

  let userName = "Candidate";
  let userEmail = "";
  let userPhone = "";

  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        const user = data.user;
        userName = user.fullName || user.name || "Candidate";
        userEmail = user.email || "";
        userPhone = user.phone || "";
      }
    }
  } catch (err) {
    console.warn("Could not fetch user watermark details:", err);
  }

  // A. Generate Multi-line User Watermark Tiles
  if (watermarkContainer) {
    watermarkContainer.innerHTML = "";

    const tileHtml = `
      <span class="wm-name">${userName}</span>
      ${userEmail ? `<span class="wm-email">${userEmail}</span>` : ''}
      ${userPhone ? `<span class="wm-phone">${userPhone}</span>` : ''}
    `;

    for (let i = 0; i < 28; i++) {
      const tile = document.createElement('div');
      tile.className = 'watermark-text';
      tile.innerHTML = tileHtml;
      watermarkContainer.appendChild(tile);
    }
  }

  // B. Disable Right-Click Context Menu
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // C. Intercept Shortcuts (Copy, Print, Save, Inspection Tools)
  document.addEventListener('keydown', (e) => {
    if (
      // Ctrl/Cmd + C, P, S, U, A
      ((e.ctrlKey || e.metaKey) && ['c', 'p', 's', 'u', 'a'].includes(e.key.toLowerCase())) ||
      // F12 or DevTools Shortcut
      e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // D. Blur screen when user loses focus (Anti-Screenshot/Snipping)
  window.addEventListener('blur', () => {
    document.body.classList.add('blurred-content');
  });

  window.addEventListener('focus', () => {
    document.body.classList.remove('blurred-content');
  });
}

/**
 * 4. INITIALIZATION ON DOM READY
 */
document.addEventListener('DOMContentLoaded', () => {
  const notesContainer = document.getElementById('notes-content');

  // Step 1: Linkify body text before math engine processes LaTeX
  if (notesContainer) {
    generateInternalLinks(notesContainer);
  }

  // Step 2: Render Math Equations via KaTeX Auto-Render Extension
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false
    });
  }

  // Step 3: Activate Security Enforcement
  initSecurityMeasures();
});