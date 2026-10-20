"use strict";

/* ------------------------------------------------------------------
   Séparation code / design :
   - ce fichier ne contient AUCUN choix visuel en dur ;
   - les couleurs du triangle se lisent dans le CSS (variables
     --vertex-a, --vertex-b, --vertex-c), avec une valeur de repli ;
   - le lien de navigation de la section visible reçoit
     aria-current="true" : à toi de le styler ( nav a[aria-current] ).
------------------------------------------------------------------- */

// Année du pied de page
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------------- Navigation : section courante ---------------- */
(function initNavHighlight() {
  const links = [...document.querySelectorAll('.site-header nav a[href^="#"]')];
  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);
  if (!sections.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const a of links) {
          if (a.getAttribute("href") === "#" + entry.target.id) {
            a.setAttribute("aria-current", "true");
          } else {
            a.removeAttribute("aria-current");
          }
        }
      }
    },
    // La bande de détection est centrée verticalement dans la fenêtre
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sections.forEach((s) => observer.observe(s));
})();

/* ---------------- Sommaire d'une page projet (À TOI) ---------------- */
(function initToc() {
  const list = document.getElementById("toc");
  if (!list) return; // uniquement sur les pages projet

  // TODO 1 : récupérer les titres  ->  document.querySelectorAll("main h2")
  // TODO 2 : s'assurer que chaque titre a un id ; sinon en fabriquer un
  //          à partir de son texte (minuscules, espaces -> "-", sans accents :
  //          regarde String.prototype.normalize("NFD") et .replace)
  // TODO 3 : pour chaque titre, créer <li><a href="#id">texte</a></li>
  //          et l'ajouter à `list`
  // Pièges : utilise textContent (pas innerHTML) ; deux titres identiques
  //          donneraient le même id -> ajoute un suffixe numérique.
})();

/* ---------------- Triangle rasterisé à la main ---------------- */
(function initTriangle() {
  const canvas = document.getElementById("triangle");
  if (!canvas) return; // le bloc est optionnel

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const image = ctx.createImageData(W, H);
  const px = image.data;

  // "#rrggbb" -> [r, g, b]
  function parseHex(hex, fallback) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const styles = getComputedStyle(canvas);
  const colors = [
    parseHex(styles.getPropertyValue("--vertex-a"), [255, 93, 98]),
    parseHex(styles.getPropertyValue("--vertex-b"), [61, 214, 140]),
    parseHex(styles.getPropertyValue("--vertex-c"), [91, 155, 255]),
  ];

  // Fonction d'arête : signe selon le côté de (a -> b) où se trouve p
  function edge(ax, ay, bx, by, x, y) {
    return (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  }

  function draw(t) {
    px.fill(0); // fond transparent

    const cx = W / 2;
    const cy = H / 2;
    const r = H * 0.4;
    const v = [];
    for (let i = 0; i < 3; i++) {
      const a = t + (i * 2 * Math.PI) / 3 - Math.PI / 2;
      v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }

    const area = edge(v[0][0], v[0][1], v[1][0], v[1][1], v[2][0], v[2][1]);
    if (area === 0) return;

    const minX = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0])));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1])));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5;
        const sy = y + 0.5;
        // Divisées par l'aire : valables quel que soit le sens d'enroulement
        const w0 = edge(v[1][0], v[1][1], v[2][0], v[2][1], sx, sy) / area;
        const w1 = edge(v[2][0], v[2][1], v[0][0], v[0][1], sx, sy) / area;
        const w2 = edge(v[0][0], v[0][1], v[1][0], v[1][1], sx, sy) / area;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;

        const i = (y * W + x) * 4;
        px[i]     = w0 * colors[0][0] + w1 * colors[1][0] + w2 * colors[2][0];
        px[i + 1] = w0 * colors[0][1] + w1 * colors[1][1] + w2 * colors[2][1];
        px[i + 2] = w0 * colors[0][2] + w1 * colors[1][2] + w2 * colors[2][2];
        px[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  // Animation désactivée si le visiteur le demande
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    draw(0.3);
    return;
  }

  // Pause quand le canvas n'est pas visible (économie de batterie)
  let visible = true;
  let running = false;

  function frame(ms) {
    if (!visible) {
      running = false;
      return;
    }
    draw(ms / 1800);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }).observe(canvas);
  }
  start();
})();
