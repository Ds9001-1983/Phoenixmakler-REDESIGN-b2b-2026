import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Smooth Scroll (Lenis) ---
if (!prefersReduced) {
  const lenis = new Lenis({
    duration: 1.05,
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

// --- Reveal on Scroll ---
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

// --- Number Counter (Scroll-triggered) ---
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
