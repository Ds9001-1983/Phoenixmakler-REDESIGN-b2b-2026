import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Respect reduced motion
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Smooth Scroll (Lenis) ---
if (!prefersReduced) {
  const lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Anchor links: smooth scroll
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (target instanceof HTMLElement) {
        e.preventDefault();
        lenis.scrollTo(target, { offset: -80 });
      }
    });
  });
}

// --- Reveal on Scroll (CSS-basiert, robust) ---
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

// --- Number Counter (Zahlen-Animation im Scroll) ---
document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
  const target = parseFloat(el.dataset.count ?? '0');
  const suffix = el.dataset.countSuffix ?? '';
  const prefix = el.dataset.countPrefix ?? '';
  const duration = parseFloat(el.dataset.countDuration ?? '2');
  const obj = { val: 0 };

  ScrollTrigger.create({
    trigger: el,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      gsap.to(obj, {
        val: target,
        duration: prefersReduced ? 0.1 : duration,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = `${prefix}${Math.round(obj.val)}${suffix}`;
        },
      });
    },
  });
});

// --- Image Parallax (auf [data-parallax]) ---
if (!prefersReduced) {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    const intensity = parseFloat(el.dataset.parallax ?? '0.15');
    gsap.to(el, {
      yPercent: intensity * 100,
      ease: 'none',
      scrollTrigger: {
        trigger: el.closest('[data-parallax-wrapper]') ?? el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });
}

// --- Headline Split Reveal (wort-für-wort) ---
if (!prefersReduced) {
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const text = el.textContent ?? '';
    el.innerHTML = text
      .split(' ')
      .map((word) =>
        `<span class="word-wrap" style="display:inline-block;overflow:hidden;padding-bottom:0.06em"><span class="word" style="display:inline-block;transform:translateY(105%);will-change:transform">${word}&nbsp;</span></span>`
      )
      .join('');

    gsap.to(el.querySelectorAll<HTMLElement>('.word'), {
      y: 0,
      duration: 1.0,
      ease: 'expo.out',
      stagger: 0.06,
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true,
      },
    });
  });
}
