import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Smooth Scroll (Lenis) ---
let lenis: Lenis | null = null;
if (!prefersReduced) {
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (target instanceof HTMLElement) {
        e.preventDefault();
        lenis!.scrollTo(target, { offset: -80 });
      }
    });
  });
}

// --- Reveal on Scroll (bleibt kompatibel zu V3-Sektionen) ---
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
);
document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));

// --- Number Counter ---
document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
  const target = parseFloat(el.dataset.count ?? '0');
  const suffix = el.dataset.countSuffix ?? '';
  const prefix = el.dataset.countPrefix ?? '';
  const decimals = parseInt(el.dataset.countDecimals ?? '0', 10);
  const duration = parseFloat(el.dataset.countDuration ?? '1.8');
  const obj = { val: 0 };

  ScrollTrigger.create({
    trigger: el,
    start: 'top 88%',
    once: true,
    onEnter: () => {
      gsap.to(obj, {
        val: target,
        duration: prefersReduced ? 0.1 : duration,
        ease: 'power2.out',
        onUpdate: () => {
          const v = decimals > 0 ? obj.val.toFixed(decimals) : Math.round(obj.val).toString();
          el.textContent = `${prefix}${v}${suffix}`;
        },
      });
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// PREMIUM-MOVES (Signature Library)
// ═══════════════════════════════════════════════════════════════

// --- SM-01: Split-Text Reveal (Words + Letters) ---
// Markup: <h1 data-split="words" data-split-stagger="0.06">...</h1>
// Rekursiver DOM-Walker: splittet Text-Nodes an Whitespace in Wort-Spans,
// erhält dabei Strukturelemente (<em>, <br/>, <strong>, …) und deren Styling.
function wrapWord(token: string): HTMLSpanElement {
  const wrap = document.createElement('span');
  wrap.className = 'split-word';
  wrap.style.display = 'inline-block';
  wrap.style.overflow = 'hidden';
  wrap.style.verticalAlign = 'top';
  const inner = document.createElement('span');
  inner.className = 'split-word-inner';
  inner.style.display = 'inline-block';
  inner.style.willChange = 'transform, opacity';
  inner.textContent = token;
  wrap.appendChild(inner);
  return wrap;
}

function processSplitNode(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) {
    const frag = document.createDocumentFragment();
    const tokens = (node.textContent ?? '').split(/(\s+)/);
    for (const token of tokens) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        frag.appendChild(document.createTextNode(token));
      } else {
        frag.appendChild(wrapWord(token));
      }
    }
    return frag;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const clone = el.cloneNode(false) as Element;
    for (const child of Array.from(el.childNodes)) {
      clone.appendChild(processSplitNode(child));
    }
    return clone;
  }
  return node.cloneNode(true);
}

function splitTextIntoWords(el: HTMLElement) {
  el.setAttribute('aria-label', (el.textContent ?? '').replace(/\s+/g, ' ').trim());
  const children = Array.from(el.childNodes);
  el.innerHTML = '';
  for (const child of children) {
    el.appendChild(processSplitNode(child));
  }
  return el.querySelectorAll('.split-word-inner');
}

document.querySelectorAll<HTMLElement>('[data-split="words"]').forEach((el) => {
  const inners = splitTextIntoWords(el);
  if (prefersReduced) return;
  const stagger = parseFloat(el.dataset.splitStagger ?? '0.06');
  const delay = parseFloat(el.dataset.splitDelay ?? '0.1');
  const trigger = el.dataset.splitTrigger ?? 'self';

  gsap.set(inners, { yPercent: 110, opacity: 0 });

  if (trigger === 'load') {
    gsap.to(inners, {
      yPercent: 0,
      opacity: 1,
      duration: 1.1,
      ease: 'power3.out',
      stagger,
      delay,
    });
  } else {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(inners, {
          yPercent: 0,
          opacity: 1,
          duration: 1.1,
          ease: 'power3.out',
          stagger,
          delay,
        });
      },
    });
  }
});

// --- SM-07: Marquee Infinite ---
// Markup: <div data-marquee data-marquee-speed="40"><div class="marquee-track">...items...</div></div>
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((el) => {
  const track = el.querySelector<HTMLElement>('.marquee-track');
  if (!track) return;
  const speed = parseFloat(el.dataset.marqueeSpeed ?? '40'); // px/s
  const direction = el.dataset.marqueeDirection === 'right' ? 1 : -1;

  // Duplicate content for seamless loop
  track.innerHTML += track.innerHTML;

  let x = 0;
  let last = performance.now();
  let paused = false;

  el.addEventListener('mouseenter', () => {
    if (el.dataset.marqueePause === 'true') paused = true;
  });
  el.addEventListener('mouseleave', () => {
    paused = false;
    last = performance.now();
  });

  function step(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    if (!paused && !prefersReduced) {
      x += direction * speed * dt;
      const half = track!.scrollWidth / 2;
      if (x <= -half) x += half;
      if (x >= 0 && direction > 0) x -= half;
      track!.style.transform = `translateX(${x}px)`;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

// --- SM-03: Pin-Section Scroll-Story ---
// Markup: <section data-pin data-pin-length="3"> mit Kindern .pin-step
document.querySelectorAll<HTMLElement>('[data-pin]').forEach((section) => {
  const steps = section.querySelectorAll<HTMLElement>('.pin-step');
  if (!steps.length) return;
  const scrollLen = parseFloat(section.dataset.pinLength ?? '3'); // vh multiples

  // Hide all except first
  gsap.set(steps, { opacity: 0, y: 30 });
  gsap.set(steps[0], { opacity: 1, y: 0 });

  if (prefersReduced) {
    gsap.set(steps, { opacity: 1, y: 0 });
    return;
  }

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: `+=${scrollLen * 100}%`,
    pin: true,
    scrub: 0.6,
    snap: {
      snapTo: 1 / (steps.length - 1),
      duration: 0.3,
      ease: 'power2.inOut',
    },
    onUpdate: (self) => {
      const progress = self.progress;
      const idx = Math.round(progress * (steps.length - 1));
      steps.forEach((step, i) => {
        const active = i === idx;
        gsap.to(step, {
          opacity: active ? 1 : 0,
          y: active ? 0 : 30,
          duration: 0.4,
          ease: 'power2.out',
          overwrite: true,
        });
      });
      const progressBar = section.querySelector<HTMLElement>('[data-pin-progress]');
      if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
      const progressNum = section.querySelector<HTMLElement>('[data-pin-number]');
      if (progressNum) {
        progressNum.textContent = String(idx + 1).padStart(2, '0');
      }
    },
  });
});

// --- SM-08: Horizontal Scroll (Pin + translateX) ---
// Markup: <section data-hscroll><div class="hscroll-track">...tiles...</div></section>
document.querySelectorAll<HTMLElement>('[data-hscroll]').forEach((section) => {
  const track = section.querySelector<HTMLElement>('.hscroll-track');
  if (!track) return;
  if (prefersReduced || window.matchMedia('(max-width: 768px)').matches) return;

  const getDistance = () => track.scrollWidth - window.innerWidth;

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${getDistance()}`,
    pin: true,
    scrub: 0.8,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      track.style.transform = `translateX(${-self.progress * getDistance()}px)`;
    },
  });
});

// --- SM-05: Magnetic Cursor for Buttons ---
// Markup: <a data-magnetic>...</a>
document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
  if (prefersReduced) return;
  const strength = parseFloat(el.dataset.magneticStrength ?? '0.35');
  let rx = 0, ry = 0, tx = 0, ty = 0;
  let raf = 0;

  const onMove = (e: MouseEvent) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    tx = x * strength;
    ty = y * strength;
    if (!raf) loop();
  };
  const onLeave = () => {
    tx = 0;
    ty = 0;
    if (!raf) loop();
  };
  function loop() {
    rx += (tx - rx) * 0.18;
    ry += (ty - ry) * 0.18;
    el.style.transform = `translate3d(${rx.toFixed(2)}px, ${ry.toFixed(2)}px, 0)`;
    if (Math.abs(tx - rx) > 0.1 || Math.abs(ty - ry) > 0.1) {
      raf = requestAnimationFrame(loop);
    } else {
      el.style.transform = '';
      raf = 0;
    }
  }

  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);
});

// --- SM-10: Hover-Video Tiles ---
// Markup: <div data-hover-video><img .../><video src="..." muted loop playsinline></video></div>
document.querySelectorAll<HTMLElement>('[data-hover-video]').forEach((tile) => {
  const video = tile.querySelector<HTMLVideoElement>('video');
  if (!video) return;
  tile.addEventListener('mouseenter', () => {
    video.currentTime = 0;
    void video.play().catch(() => {});
    tile.classList.add('is-hover');
  });
  tile.addEventListener('mouseleave', () => {
    video.pause();
    tile.classList.remove('is-hover');
  });
});

// --- SM-14: Scroll-Progress Bar (page top) ---
const scrollProgress = document.querySelector<HTMLElement>('[data-scroll-progress]');
if (scrollProgress && !prefersReduced) {
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      scrollProgress.style.transform = `scaleX(${self.progress})`;
    },
  });
}

// --- Hero Scroll-Scrub Video (SM-02) ---
// Markup: <video data-scrub-video>...</video> within container [data-scrub-trigger]
document.querySelectorAll<HTMLVideoElement>('[data-scrub-video]').forEach((video) => {
  if (prefersReduced) return;
  const trigger = video.closest<HTMLElement>('[data-scrub-trigger]') ?? video.parentElement;
  if (!trigger) return;

  video.pause();
  video.addEventListener('loadedmetadata', () => {
    const duration = video.duration;
    ScrollTrigger.create({
      trigger,
      start: 'top top',
      end: () => `+=${window.innerHeight * 1.2}`,
      scrub: 0.6,
      onUpdate: (self) => {
        video.currentTime = duration * self.progress;
      },
    });
  });
});

// Refresh once everything is initialized (fonts, images)
window.addEventListener('load', () => {
  ScrollTrigger.refresh();
});

export {};
