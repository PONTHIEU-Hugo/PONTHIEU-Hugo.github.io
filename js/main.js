"use strict";

/* ------------------------------------------------------------------
   Séparation code / design :
   - ce fichier ne contient AUCUN choix visuel en dur ;
   - les couleurs du triangle se lisent dans le CSS (variables
     --vertex-a, --vertex-b, --vertex-c), avec une valeur de repli ;
   - les réglages des animations au défilement aussi
     (--fx-rise, --fx-scrub, --fx-card-rise, --fx-slide) ;
   - le lien de navigation de la section visible reçoit
     aria-current="true" : à toi de le styler ( nav a[aria-current] ).
------------------------------------------------------------------- */

// Année du pied de page
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

const clamp01 = (x) => Math.min(1, Math.max(0, x));

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

/* ---------------- Projets phares : bande entière cliquable ----------------
   Le vrai lien reste "Voir le projet" (.feature-more a) : c'est lui que lisent
   les lecteurs d'écran et que le clavier atteint. Ce script ajoute seulement
   le clic sur le reste de la bande, pour la souris et le tactile.
   (Le pseudo-élément ::after des cartes ne marche pas ici : les éléments
   animés avec transform deviennent le repère des enfants en position absolute.) */
(function initFeatureClick() {
  for (const feature of document.querySelectorAll(".feature")) {
    const link = feature.querySelector(".feature-more a");
    if (!link) continue;
    feature.classList.add("is-clickable");

    feature.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;            // clic sur le lien lui-même
      if (String(window.getSelection())) return;     // l'utilisateur sélectionne du texte
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        window.open(link.href, "_blank", "noopener");
      } else {
        link.click();
      }
    });

    // Clic molette : ouvrir dans un nouvel onglet, comme sur un vrai lien
    feature.addEventListener("auxclick", (e) => {
      if (e.button !== 1 || e.target.closest("a")) return;
      window.open(link.href, "_blank", "noopener");
    });
  }
})();

/* ---------------- Animations au défilement ----------------
   Un seul moteur pour deux effets :

   1. Projets phares (.feature) — apparition liée au défilement :
      - de "le haut de la bande touche le bas de l'écran" (0)
        à "le centre de la bande est au centre de l'écran" (1) ;
      - le texte suit exactement le défilement ;
      - l'image et le halo suivent avec du retard (réglable avec --fx-scrub) ;
      - le halo démarre un peu après l'image.

   2. Autres projets (.cards) — effet d'assemblage, ligne par ligne :
      - nombre impair de cartes : celle du centre monte, celles de gauche
        glissent depuis la gauche, celles de droite depuis la droite ;
      - nombre pair : moitié gauche depuis la gauche, moitié droite depuis la droite ;
      - les cartes les plus extérieures viennent de plus loin et arrivent
        un peu après, ce qui donne l'impression que la ligne "se referme".

   Tout passe par transform et opacity : pas de recalcul de mise en page.
   La boucle s'arrête d'elle-même quand plus rien ne bouge. */
(function initScrollReveal() {
  const features = [...document.querySelectorAll(".feature")];
  const cardLists = [...document.querySelectorAll(".cards")];
  if (!features.length && !cardLists.length) return;

  // Courbe d'atténuation : rapide au début, douce à la fin
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  // Timeline de l'image des projets phares :
  // l'image monte pendant 1, le halo démarre à 0.75 et dure 0.5 -> total 1.25
  const MEDIA_END = 1;
  const FLARE_START = 0.75;
  const FLARE_DURATION = 0.5;
  const TIMELINE = FLARE_START + FLARE_DURATION;

  // Cartes : chaque rang vers l'extérieur démarre un peu plus tard
  const CARD_STAGGER = 0.15;

  // Réglages lus dans le CSS (valeurs de repli si absents)
  const fx = { rise: 300, scrub: 1, cardRise: 120, slide: 140 };

  function readSettings() {
    const styles = getComputedStyle(document.documentElement);
    const px = (name, fallback) => {
      const v = parseFloat(styles.getPropertyValue(name));
      return Number.isFinite(v) ? v : fallback;
    };
    fx.rise = px("--fx-rise", 300);
    fx.scrub = Math.max(0, px("--fx-scrub", 1));
    fx.cardRise = px("--fx-card-rise", 120);
    fx.slide = px("--fx-slide", 140);
  }

  // Écrit transform/opacity, ou les retire quand l'élément est à sa place
  function place(node, progress, dx, dy, fade) {
    if (!node) return;
    const rest = 1 - progress;
    const x = dx * rest;
    const y = dy * rest;
    node.style.transform =
      Math.abs(x) > 0.1 || Math.abs(y) > 0.1
        ? `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        : "";
    node.style.opacity = fade && progress < 0.999 ? progress.toFixed(3) : "";
  }

  // 0 quand le haut touche le bas de l'écran, 1 quand le centre atteint
  // la hauteur "endRatio" de l'écran (0.5 = milieu)
  function progressFrom(top, height, viewH, endRatio) {
    const start = viewH;
    const end = viewH * endRatio - height / 2;
    return clamp01((start - top) / (start - end));
  }

  /* ----- Pistes animées ----- */
  let tracks = [];

  function featureTrack(el) {
    const body = el.querySelector(".feature-body");
    const visual = el.querySelector(".feature-visual");
    const flare = el.querySelector(".feature-flare");
    return {
      nodes: [body, visual, flare],
      target: 0,
      lagged: 0,
      measure(viewH) {
        const r = el.getBoundingClientRect(); // la bande elle-même n'est jamais déplacée
        return progressFrom(r.top, r.height, viewH, 0.5);
      },
      render() {
        // Texte : suit exactement le défilement
        place(body, easeOut(this.target), 0, fx.rise, true);
        // Image et halo : suivent la progression retardée
        const t = this.lagged * TIMELINE;
        place(visual, easeOut(clamp01(t / MEDIA_END)), 0, fx.rise, false);
        place(flare, easeOut(clamp01((t - FLARE_START) / FLARE_DURATION)), 0, fx.rise, true);
      },
    };
  }

  // Regroupe les cartes par ligne (même offsetTop, non affecté par transform)
  function cardRows(list) {
    const rows = [];
    for (const card of list.children) {
      const top = card.offsetTop;
      const row = rows.find((r) => Math.abs(r.top - top) < 2);
      if (row) row.cards.push(card);
      else rows.push({ top, cards: [card] });
    }
    return rows;
  }

  function rowTrack(cards) {
    // Position de chaque carte par rapport au centre de la ligne :
    // impair -> ... -2 -1 0 +1 +2 ...   pair -> ... -1.5 -0.5 +0.5 +1.5 ...
    const n = cards.length;
    const parts = cards.map((card, i) => {
      const rel = i - (n - 1) / 2;
      const side = Math.sign(rel);              // -1 gauche, 0 centre, +1 droite
      const rank = Math.ceil(Math.abs(rel));    // 1 = voisin du centre, 2 = plus loin...
      return { card, side, rank };
    });
    const maxRank = Math.max(0, ...parts.map((p) => p.rank));
    const first = cards[0];

    return {
      nodes: cards,
      target: 0,
      lagged: 0,
      measure(viewH) {
        // offsetTop est relatif au document : on le ramène à l'écran
        const top = first.offsetTop - window.scrollY;
        const height = Math.max(...cards.map((c) => c.offsetHeight));
        return progressFrom(top, height, viewH, 0.65);
      },
      render() {
        // Les cartes suivent la progression retardée, comme les images des projets phares
        const span = 1 + CARD_STAGGER * maxRank;
        for (const { card, side, rank } of parts) {
          const local = clamp01(this.lagged * span - CARD_STAGGER * rank);
          const p = easeOut(local);
          if (side === 0) place(card, p, 0, fx.cardRise, true);   // centre : monte
          else place(card, p, side * fx.slide * rank, 0, true);    // côtés : glissent
        }
      },
    };
  }

  function buildTracks() {
    for (const t of tracks) for (const n of t.nodes) if (n) n.style.transform = n.style.opacity = "";
    tracks = features.map(featureTrack);
    for (const list of cardLists) {
      for (const row of cardRows(list)) tracks.push(rowTrack(row.cards));
    }
  }

  /* ----- Boucle d'animation ----- */
  let rafId = 0;
  let lastTime = 0;
  let enabled = false;

  function frame(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000); // en s, borné après une pause
    lastTime = now;

    const viewH = window.innerHeight;
    // Lissage exponentiel : rattrape ~95 % de l'écart en "scrub" secondes
    const k = fx.scrub > 0 ? 1 - Math.exp((-3 * dt) / fx.scrub) : 1;
    let moving = false;

    for (const t of tracks) {
      t.target = t.measure(viewH);
      t.lagged += (t.target - t.lagged) * k;
      if (Math.abs(t.target - t.lagged) < 0.0005) t.lagged = t.target;
      else moving = true;
      t.render();
    }

    rafId = moving ? requestAnimationFrame(frame) : 0;
  }

  function wake() {
    if (!enabled || rafId) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  // Place tout immédiatement, sans animation (au chargement, après un redimensionnement)
  function snap() {
    const viewH = window.innerHeight;
    for (const t of tracks) {
      t.target = t.lagged = t.measure(viewH);
      t.render();
    }
  }

  function enable() {
    enabled = true;
    readSettings();
    buildTracks();
    snap();
  }

  function disable() {
    enabled = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
    for (const t of tracks) for (const n of t.nodes) if (n) n.style.transform = n.style.opacity = "";
  }

  window.addEventListener("scroll", wake, { passive: true });

  // Au redimensionnement, le nombre de colonnes peut changer : on recalcule les lignes
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    if (!enabled) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      readSettings();
      buildTracks();
      snap();
    }, 150);
  });

  // Animation désactivée si le visiteur le demande (et réactivée s'il change d'avis)
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduceMotion.addEventListener("change", () => (reduceMotion.matches ? disable() : enable()));
  if (!reduceMotion.matches) enable();
})();

/* ---------------- Sommaire d'une page projet ----------------
   Remplit <ol id="toc"> avec un lien vers chaque <h2> de la page.
   Rien à écrire à la main : ajoute ou renomme un <h2>, le sommaire suit.
   Chaque titre reçoit un id fabriqué à partir de son texte
   ("Difficultés rencontrées" -> "difficultes-rencontrees") s'il n'en a pas déjà un. */
(function initToc() {
  const list = document.getElementById("toc");
  if (!list) return; // uniquement sur les pages projet

  const headings = [...document.querySelectorAll("main h2")];
  if (!headings.length) {
    // Pas de titre : on retire le bloc "Sur cette page" plutôt que d'afficher une liste vide
    const toc = list.closest(".toc");
    if (toc) toc.remove();
    return;
  }

  // "Difficultés rencontrées !" -> "difficultes-rencontrees"
  function slugify(text) {
    const slug = text
      .toLowerCase()
      .normalize("NFD")                 // sépare les lettres de leurs accents (é -> e + ´)
      .replace(/[\u0300-\u036f]/g, "") // retire les accents
      .replace(/[^a-z0-9]+/g, "-")      // tout le reste devient des tirets
      .replace(/^-+|-+$/g, "");         // pas de tiret au début ni à la fin
    return slug || "section";
  }

  // Les id déjà présents dans la page, pour ne jamais créer de doublon
  const used = new Set([...document.querySelectorAll("[id]")].map((el) => el.id));

  for (const heading of headings) {
    if (!heading.id) {
      const base = slugify(heading.textContent);
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`; // deux titres identiques -> "-2", "-3"...
      heading.id = id;
      used.add(id);
    }

    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#" + heading.id;
    link.textContent = heading.textContent.trim(); // textContent : jamais de HTML injecté
    item.appendChild(link);
    list.appendChild(item);
  }
})();

/* ---------------- Galerie d'une page projet ----------------
   - Les miniatures sont des liens : sans JavaScript, elles ouvrent l'image ou la vidéo.
     Avec JavaScript, elles s'affichent dans le grand lecteur.
   - Vidéo YouTube : on affiche d'abord l'image d'aperçu (data-poster) avec un bouton lecture ;
     le lecteur YouTube (youtube-nocookie.com) n'est chargé qu'au clic.
     Aucune requête vers Google tant que le visiteur ne lance pas la vidéo.
   - Clavier : flèches gauche/droite dans la galerie, Entrée sur une miniature.
   - Changer de média arrête la vidéo en cours (le lecteur est retiré). */
(function initGallery() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  for (const gallery of document.querySelectorAll(".gallery")) {
    const viewer = gallery.querySelector(".gallery-viewer");
    const thumbs = [...gallery.querySelectorAll(".gallery-thumb")];
    if (!viewer || !thumbs.length) continue;

    if (thumbs.length < 2) gallery.classList.add("is-single");
    let current = -1;

    function youtubePlayer(id, title) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
      iframe.title = title || "Vidéo du projet";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      return iframe;
    }

    function render(thumb) {
      const label = thumb.dataset.label || "";
      const id = thumb.dataset.youtube;

      if (id) {
        // Aperçu cliquable : l'image d'aperçu + un bouton lecture
        const play = document.createElement("button");
        play.type = "button";
        play.className = "gallery-play";
        play.setAttribute("aria-label", label ? `Lire la vidéo : ${label}` : "Lire la vidéo");
        const poster = document.createElement("img");
        poster.src = thumb.dataset.poster || thumb.querySelector("img")?.src || "";
        poster.alt = "";
        play.append(poster);
        play.addEventListener("click", () => {
          const player = youtubePlayer(id, label);
          viewer.replaceChildren(player);
          player.focus();
        });
        viewer.replaceChildren(play);
      } else {
        const img = document.createElement("img");
        img.src = thumb.href;
        img.alt = label;
        img.decoding = "async";
        viewer.replaceChildren(img);
      }
    }

    // Précharge l'image suivante pour que le passage soit instantané
    function preload(index) {
      const thumb = thumbs[index];
      if (thumb && !thumb.dataset.youtube) new Image().src = thumb.href;
    }

    function select(index, { focus = false, scroll = true } = {}) {
      index = (index + thumbs.length) % thumbs.length; // boucle aux extrémités
      thumbs.forEach((t, k) => {
        if (k === index) t.setAttribute("aria-current", "true");
        else t.removeAttribute("aria-current");
      });
      if (index !== current) render(thumbs[index]);
      current = index;

      const thumb = thumbs[index];
      if (scroll) {
        thumb.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: reduceMotion.matches ? "auto" : "smooth",
        });
      }
      if (focus) thumb.focus({ preventScroll: true });
      preload((index + 1) % thumbs.length);
    }

    thumbs.forEach((thumb, index) => {
      thumb.addEventListener("click", (e) => {
        // Ctrl/Cmd/Maj + clic : comportement normal d'un lien (nouvel onglet)
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        select(index);
      });
    });

    gallery.querySelector(".gallery-prev")?.addEventListener("click", () => select(current - 1));
    gallery.querySelector(".gallery-next")?.addEventListener("click", () => select(current + 1));

    // Flèches du clavier, sauf quand le lecteur YouTube a le focus (il gère ses propres touches)
    gallery.addEventListener("keydown", (e) => {
      if (e.target.tagName === "IFRAME") return;
      // Si le focus est sur une miniature, on part d'elle ; sinon du média affiché
      const focused = thumbs.indexOf(e.target);
      const from = focused >= 0 ? focused : current;
      if (e.key === "ArrowRight") { e.preventDefault(); select(from + 1, { focus: true }); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); select(from - 1, { focus: true }); }
    });

    select(0, { scroll: false }); // pas de défilement de la page au chargement
  }
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

/* ---------------- Page projet en cours d'écriture (WIP) ----------------
   <body data-wip> masque le contenu, en CSS pur (voir WIP dans style.css) :
   aucun flash du contenu, même si ce script charge tard.
   Ça s'applique partout, en ligne comme en local.
   Pour relire ton contenu pendant que tu écris, ajoute ?preview à l'adresse
   EN LOCAL (ex. http://127.0.0.1:5500/Projects/Chessy/?preview) :
   le contenu réapparaît avec un bandeau de rappel. En ligne, ?preview est ignoré. */
(function initWip() {
  const body = document.body;
  if (!body.hasAttribute("data-wip")) return;

  const localHosts = ["localhost", "127.0.0.1", "[::1]", ""];
  const isLocal = location.protocol === "file:" || localHosts.includes(location.hostname);
  const wantsPreview = new URLSearchParams(location.search).has("preview");
  if (!isLocal || !wantsPreview) return;

  body.removeAttribute("data-wip");
  body.setAttribute("data-wip-preview", "");
})();
