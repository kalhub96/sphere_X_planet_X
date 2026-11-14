'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  motion,
  MotionConfig,
  AnimatePresence,
  animate,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from 'framer-motion';
import CelestialSphere from './components/sky/CelestialSphere';

import { Telescope, ArrowRight, Compass, Layers, LineChart, ExternalLink } from 'lucide-react';

/* ---------- data (unchanged from your current page) ---------- */
const FEATURED_SHOWCASES = [
  {
    id: 'planet-x',
    title: 'Planet X & Kuiper Belt Search',
    sector: 'Sedna Recovery Sector',
    ra: 56.452,
    dec: 7.892,
    band: 88,
    wavelength: '4.26 µm',
    badge: 'Methane Ice Signature',
    color: 'var(--accent-cyan)',
    pos: { x: 68, y: 30 },
    description:
      'Search for high-eccentricity trans-Neptunian objects and potential distant planets via characteristic solid-state CH4 surface ice absorption and high annual parallax.',
    metrics: [
      { label: 'Predicted Distance', value: '> 300 AU' },
      { label: 'Diagnostic Band', value: '4.26 µm CO2/CH4' },
      { label: 'Expected Parallax', value: '< 40 mas' },
    ],
    compareUrl: '/compare?obs_a=spherex_qr3_pass1_0042&obs_b=spherex_qr3_pass2_0042&band=88',
  },
  {
    id: 'y-dwarf',
    title: 'Orion Nebula Y-Dwarf Nursery',
    sector: 'M42 Active Star Formation',
    ra: 83.8221,
    dec: -5.3911,
    band: 33,
    wavelength: '1.65 µm',
    badge: 'Sub-Stellar Atmosphere',
    color: 'var(--accent-orange)',
    pos: { x: 32, y: 42 },
    description:
      'Identify ultra-cool brown dwarfs (T < 450 K) embedded in the Orion starburst complex using differential photometry and diagnostic 1.65 µm atmospheric methane windows.',
    metrics: [
      { label: 'Effective Temp', value: '380 - 450 K' },
      { label: 'Molecular Features', value: 'CH4, H2O, NH3' },
      { label: 'Cataloged Passes', value: '48 Epochs' },
    ],
    compareUrl: '/compare?obs_a=spherex_qr3_pass1_0042&obs_b=spherex_qr3_pass2_0042&band=33',
  },
  {
    id: 'nep-survey',
    title: 'North Ecliptic Pole Deep Survey',
    sector: 'Continuous Viewing Zone',
    ra: 270.0,
    dec: 66.56,
    band: 50,
    wavelength: '2.15 µm',
    badge: 'Calibration Benchmark',
    color: 'var(--accent-green)',
    pos: { x: 58, y: 68 },
    description:
      'Deepest survey pointing in the SPHEREx all-sky map with over 100 overlapping passes, serving as the benchmark for cosmic infrared background (CIB) fluctuation studies.',
    metrics: [
      { label: 'Overlapping Passes', value: '> 100 Passes' },
      { label: 'Astrometric Error', value: '< 0.05″ RMS' },
      { label: 'Primary Array', value: 'Array 3 (Ks)' },
    ],
    compareUrl: '/compare?obs_a=spherex_qr3_pass1_0042&obs_b=spherex_qr3_pass2_0042&band=50',
  },
];

const STAT_BADGES = [
  { value: '102', label: 'Spectroscopic Channels', sub: 'Continuous 0.75 – 5.0 µm all-sky photometry.' },
  { value: '6.2″', label: 'Pixel Plate Scale', sub: 'WCS TAN astrometry tuned for faint motion.' },
  { value: '4', label: 'Physical SED Templates', sub: 'Reduced χ² separates brown dwarfs from asteroids.' },
  { value: 'QR3', label: 'NASA IRSA Data Release', sub: 'SIA2 & IBE live pipeline.' },
];

const CAPABILITIES = [
  {
    n: '01',
    title: '3D Celestial Explorer',
    desc: 'WebGL sky sphere with equatorial and ecliptic maps and per-band filtering.',
    href: '/explore',
    cta: 'Launch',
    Icon: Compass,
  },
  {
    n: '02',
    title: 'Blink Comparator Engine',
    desc: 'Differential pixel subtraction that isolates flux variation, transients and parallax motion.',
    href: '/compare',
    cta: 'Open',
    Icon: Layers,
  },
  {
    n: '03',
    title: 'Photometry & SED Fitting',
    desc: 'Template fitting that minimizes χ² across all 102 channels against atmosphere models.',
    href: '/explore', // no dedicated SED route in the repo yet; change when you add one
    cta: 'Fit',
    Icon: LineChart,
  },
];

const MARQUEE_ITEMS = ['102 Bands', '0.75–5.0 µm', 'NASA IRSA', 'Multi-Epoch', 'SPHEREx QR3', 'Blink Comparator'];

const MANIFESTO =
  'Subtracting consecutive scans removes background light and exposes high-proper-motion transients with calibrated photometric confidence.';

const GRAD = 'bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-gold)] to-[var(--accent-orange)] bg-clip-text text-transparent';
const PANEL = 'glass-panel border border-[var(--border-subtle)] backdrop-blur-md';
const LABEL = 'font-mono text-xs uppercase tracking-[0.08em]';

const EASE = [0.22, 1, 0.36, 1] as const;

/* =====================================================================
   Animation helpers
   ===================================================================== */

/** Fade + rise when scrolled into view */
function Reveal({
  children,
  delay = 0,
  y = 40,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word mask reveal (text slides up from behind a clip) */
function SplitWords({
  text,
  wordClass = '',
  delay = 0,
}: {
  text: string;
  wordClass?: string;
  delay?: number;
}) {
  const words = text.split(' ');
  return (
    <motion.span
      aria-label={text}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: delay } } }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em] mr-[0.25em]"
        >
          <motion.span
            className={`inline-block ${wordClass}`}
            variants={{
              hidden: { y: '115%', rotate: 4 },
              show: { y: 0, rotate: 0, transition: { duration: 0.9, ease: EASE } },
            }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Paragraph whose words light up as you scroll through it */
function ScrollFillText({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const words = text.split(' ');
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <FillWord key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
          {w}
        </FillWord>
      ))}
    </p>
  );
}

function FillWord({
  children,
  progress,
  range,
}: {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block mr-[0.28em]">
      {children}
    </motion.span>
  );
}

/** Number that counts up when it enters the viewport */
function CountUp({ value, className = '' }: { value: string; className?: string }) {
  const match = value.match(/^(\d+(?:\.\d+)?)(.*)$/);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(0);
  const target = match ? parseFloat(match[1]) : 0;
  const decimals = match ? (match[1].split('.')[1]?.length ?? 0) : 0;

  useEffect(() => {
    if (!inView || !match) return;
    const controls = animate(0, target, { duration: 1.8, ease: EASE, onUpdate: setN });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return (
    <div ref={ref} className={className}>
      {match ? `${n.toFixed(decimals)}${match[2]}` : value}
    </div>
  );
}

/** Label with a line that draws itself */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className={`text-[var(--accent-cyan)] ${LABEL}`}>{children}</span>
      <motion.span
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE }}
        className="h-px w-24 origin-left bg-gradient-to-r from-[var(--accent-cyan)] to-transparent"
      />
    </div>
  );
}

/** Element that gently pulls toward the cursor */
function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 220, damping: 16 });
  const y = useSpring(0, { stiffness: 220, damping: 16 });
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className="inline-block"
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

const wrap = (min: number, max: number, v: number) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
};

/** Infinite marquee that speeds up, skews and reverses with scroll velocity */
function VelocityMarquee({ items, baseSpeed = -4 }: { items: string[]; baseSpeed?: number }) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 5], { clamp: false });
  const skewX = useTransform(smooth, [-2000, 0, 2000], [-8, 0, 8], { clamp: true });
  const x = useTransform(baseX, (v) => `${wrap(-50, 0, v)}%`);
  const dir = useRef(1);

  useAnimationFrame((_, delta) => {
    let move = dir.current * baseSpeed * (delta / 1000);
    if (factor.get() < 0) dir.current = -1;
    else if (factor.get() > 0) dir.current = 1;
    move += dir.current * move * factor.get();
    baseX.set(baseX.get() + move);
  });

  const row = (k: string) => (
    <div key={k} className="flex shrink-0 items-center" aria-hidden={k === 'b'}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center">
          <span
            className="px-8 text-5xl sm:text-7xl font-extrabold uppercase tracking-tight text-transparent [-webkit-text-stroke:1px_rgba(240,244,255,0.45)]"
          >
            {t}
          </span>
          <span className="text-[var(--accent-gold)] text-3xl">✦</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="overflow-hidden border-y border-[var(--border-subtle)] py-6 bg-[rgba(6,8,16,0.4)] backdrop-blur-sm">
      <motion.div style={{ skewX }}>
        <motion.div style={{ x }} className="flex w-max whitespace-nowrap">
          {row('a')}
          {row('b')}
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Soft glow that trails the cursor (desktop only) */
function CursorGlow() {
  const x = useMotionValue(-600);
  const y = useMotionValue(-600);
  const sx = useSpring(x, { stiffness: 110, damping: 20 });
  const sy = useSpring(y, { stiffness: 110, damping: 20 });
  useEffect(() => {
    const move = (e: MouseEvent) => {
      x.set(e.clientX - 200);
      y.set(e.clientY - 200);
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [x, y]);
  return (
    <motion.div
      aria-hidden="true"
      style={{ x: sx, y: sy }}
      className="pointer-events-none fixed left-0 top-0 z-[5] hidden h-[400px] w-[400px] rounded-full md:block bg-[radial-gradient(circle,rgba(0,229,255,0.10),transparent_65%)]"
    />
  );
}

export default function HomePage() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [navHidden, setNavHidden] = useState(false);

  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  /* nav hides on scroll down, returns on scroll up */
  useMotionValueEvent(scrollY, 'change', (latest) => {
    const prev = scrollY.getPrevious() ?? 0;
    setNavHidden(latest > prev && latest > 120);
  });

  /* background sphere slowly zooms as the page scrolls */
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.28]);

  /* hero parallax */
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroP } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(heroP, [0, 1], [0, 160]);
  const heroOpacity = useTransform(heroP, [0, 0.75], [1, 0]);
  const heroScale = useTransform(heroP, [0, 1], [1, 0.93]);

  /* pinned targets section */
  const targetsRef = useRef<HTMLElement>(null);
  const activeRef = useRef(0);
  const lastStep = useRef(0);
  const [locked, setLocked] = useState(false);
  const { scrollYProgress: targetsP } = useScroll({ target: targetsRef, offset: ['start start', 'end end'] });
  const n = FEATURED_SHOWCASES.length;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
  const el = targetsRef.current;
  if (!el || !isDesktop) return;

  const onWheel = (e: WheelEvent) => {
    // only lock once the section is roughly centered on screen
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (Math.abs(r.top + r.height / 2 - vh / 2) > vh * 0.35) return;

    const dir = e.deltaY > 0 ? 1 : -1;
    const cur = activeRef.current;
    const now = performance.now();
    const swallow = now - lastStep.current < 800; // absorbs trackpad inertia
    const atEdge = (dir === 1 && cur === n - 1) || (dir === -1 && cur === 0);

    if (atEdge && !swallow) return; // let the page scroll on
    e.preventDefault();
    if (swallow || Math.abs(e.deltaY) < 4) return;

    lastStep.current = now;
    setActive(cur + dir);
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  return () => el.removeEventListener('wheel', onWheel);
}, [isDesktop, n]);

  /* autoplay only on mobile / tablet (desktop is scroll-driven) */
  useEffect(() => {
    if (!auto || isDesktop) return;
    const t = setInterval(() => setActive((i) => (i + 1) % n), 5000);
    return () => clearInterval(t);
  }, [auto, isDesktop, n]);

  const selectTarget = (i: number) => {
    if (isDesktop && targetsRef.current) {
      const el = targetsRef.current;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const range = el.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + range * ((i + 0.5) / n), behavior: 'smooth' });
    } else {
      setActive(i);
      setAuto(false);
    }
  };

  const target = FEATURED_SHOWCASES[active];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen w-screen overflow-x-hidden bg-[#060810] text-[#F0F4FF] font-sans">
        {/* scroll progress */}
        <motion.div
          style={{ scaleX: progress }}
          className="fixed top-0 left-0 right-0 h-[3px] origin-left z-50 bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-gold)] to-[var(--accent-orange)]"
        />

        {/* ===== BACKGROUND: planets + orbits (now zooms with scroll) ===== */}
        <motion.div style={{ scale: bgScale }} className="fixed inset-0 z-0 pointer-events-auto opacity-70">
          <CelestialSphere className="w-full h-full" />
        </motion.div>
        <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(6,8,16,0.2)_0%,rgba(6,8,16,0.7)_65%,#060810_100%)]" />
        <CursorGlow />

        {/* ===== NAV (auto-hide) ===== */}
        <motion.header
          animate={{ y: navHidden ? '-100%' : '0%' }}
          transition={{ duration: 0.4, ease: EASE }}
          className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[rgba(6,8,16,0.72)] backdrop-blur-md"
        >
          <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[rgba(0,229,255,0.15)] text-[var(--accent-cyan)] flex items-center justify-center border border-[rgba(0,229,255,0.3)] shadow-[0_0_12px_rgba(0,229,255,0.3)]">
                <Telescope className="w-5 h-5" />
              </span>
              <span className="text-lg font-extrabold tracking-tight">SkyTrace</span>
            </Link>

            <nav className={`hidden md:flex items-center gap-8 text-[var(--text-secondary)] ${LABEL}`}>
              <a href="#evidence" className="hover:text-[var(--accent-cyan)] transition-colors">Evidence</a>
              <a href="#targets" className="hover:text-[var(--accent-cyan)] transition-colors">Targets</a>
              <a href="#capabilities" className="hover:text-[var(--accent-cyan)] transition-colors">Capabilities</a>
            </nav>

            <Link
              href="/explore"
              className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-[#060810] text-sm font-bold hover:shadow-[0_0_16px_rgba(0,229,255,0.5)] transition-all flex items-center gap-1.5"
            >
              Launch Explorer <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.header>

        <main className="relative z-10">
          {/* ===== HERO ===== */}
          <section ref={heroRef} className="relative min-h-[92vh] flex items-center">
            <motion.div
              style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
              className="max-w-6xl mx-auto px-5 pt-20 pb-24 text-center"
            >
              <motion.span
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE }}
                className={`inline-block px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(13,18,32,0.7)] backdrop-blur-md text-[var(--text-secondary)] ${LABEL}`}
              >
                Planet X and SPHEREx — Multi-Epoch Astronomical Transient Engine
              </motion.span>

              <h1 className="mt-6 mb-6 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.06]">
                <SplitWords text="Explore the Sky." delay={0.15} />
                <br />
                <SplitWords text="Compare the Evidence." wordClass={GRAD} delay={0.45} />
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}
                className="max-w-2xl mx-auto text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed mb-8"
              >
                Investigate real multi-epoch infrared observations from NASA IRSA across 102 spectroscopic bands. Find
                moving asteroids, ultra-cool brown dwarfs and candidate trans-Neptunian objects through differential
                photometry.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 1.05 }}
                className="flex flex-wrap items-center justify-center gap-4"
              >
                <Magnetic>
                  <Link
                    href="/explore"
                    className="px-6 py-3.5 rounded-xl bg-[var(--accent-cyan)] text-[#060810] font-bold text-sm hover:shadow-[0_0_24px_rgba(0,229,255,0.6)] transition-all flex items-center gap-2"
                  >
                    <Compass className="w-4 h-4" /> Launch 3D Celestial Explorer
                  </Link>
                </Magnetic>
                <Magnetic>
                  <Link
                    href="/compare"
                    className={`px-6 py-3.5 rounded-xl text-sm font-semibold flex items-center gap-2 bg-[rgba(13,18,32,0.85)] hover:border-[var(--border-hover)] ${PANEL}`}
                  >
                    <Layers className="w-4 h-4 text-[var(--accent-orange)]" /> Open Blink Comparator Engine
                  </Link>
                </Magnetic>
              </motion.div>

              <motion.ul
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.3 }}
                className={`mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[var(--text-secondary)] ${LABEL}`}
              >
                <li><b className="text-[var(--text-primary)]">NASA IRSA</b> data</li>
                <li><b className="text-[var(--text-primary)]">102</b> bands</li>
                <li><b className="text-[var(--text-primary)]">0.75–5.0 µm</b></li>
                <li><b className="text-[var(--text-primary)]">Multi-epoch</b> differencing</li>
              </motion.ul>
            </motion.div>

            {/* scroll hint */}
            <motion.div
              style={{ opacity: heroOpacity }}
              aria-hidden="true"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
            >
                <motion.i
                  className="absolute left-1/2 top-2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--accent-cyan)]"
                  animate={{ y: [0, 16, 0], opacity: [1, 0.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                />
            </motion.div>
          </section>

       

          {/* ===== EVIDENCE + STAT STRIP ===== */}
          <section id="evidence" className="max-w-6xl mx-auto px-5 py-28 scroll-mt-20">
            <h2 className="mt-4 mb-8 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              <SplitWords text="Read the sky the way it was recorded:" />{' '}
              <SplitWords text="twice, and honestly." wordClass={GRAD} delay={0.3} />
            </h2>

            <ScrollFillText
              text={MANIFESTO}
              className="max-w-4xl text-2xl sm:text-4xl font-semibold leading-snug tracking-tight text-[var(--text-primary)]"
            />

            <div className={`mt-14 grid grid-cols-2 lg:grid-cols-4 ${PANEL} overflow-hidden`}>
              {STAT_BADGES.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.8, ease: EASE, delay: i * 0.12 }}
                  className={`p-6 border-[var(--border-subtle)] ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b lg:border-b-0' : ''} ${i < 3 ? 'lg:border-r' : 'lg:border-r-0'}`}
                >
                  <CountUp value={s.value} className={`text-4xl font-extrabold font-mono ${GRAD}`} />
                  <div className={`mt-3 mb-1 text-[var(--accent-cyan)] ${LABEL}`}>{s.label}</div>
                  <p className="text-sm text-[var(--text-secondary)] leading-snug">{s.sub}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ===== TARGET STACK + RADAR (pinned, scroll-driven on desktop) ===== */}
          <section id="targets"
            ref={targetsRef}
            onMouseEnter={() => setLocked(true)}
            onMouseLeave={() => setLocked(false)}
            className="relative scroll-mt-20 min-h-screen flex flex-col justify-center py-1">
            <div className="lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col lg:justify-center lg:pt-20">
              <div className="w-full max-w-6xl mx-auto px-5 py-16 lg:py-0">
                <h2 className="mt-4 mb-4 text-3xl sm:text-4xl font-extrabold tracking-tight">
                  <SplitWords text="Candidates under investigation" />
                </h2>

                {/* scroll progress through the pinned section */}
                <div className="hidden lg:flex items-center gap-4 mb-6">
                  <span className={`text-[var(--text-secondary)] ${LABEL}`}>
                    {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
                  </span>
                  <div className="h-px flex-1 bg-[var(--border-subtle)]">
                    <motion.div
                      initial={false}
                      animate={{ scaleX: (active + 1) / n }}
                      transition={{ duration: 0.5, ease: EASE }}
                      className="h-px origin-left bg-[var(--accent-cyan)]"
                    />
                  </div>
                  <span className={`${LABEL} ${locked ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-secondary)]'}`}>
                    {locked ? 'Scroll to switch · move mouse away to continue' : 'Hover & scroll'}
                  </span>
                </div>

                <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 mt-6 lg:mt-0">
                  <div role="tablist" className="flex flex-col gap-3">
                    {FEATURED_SHOWCASES.map((s, i) => (
                      <motion.button
                        key={s.id}
                        role="tab"
                        aria-selected={i === active}
                        onClick={() => selectTarget(i)}
                        initial={{ opacity: 0, x: -40 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: '-60px' }}
                        transition={{ duration: 0.7, ease: EASE, delay: i * 0.1 }}
                        className={`text-left p-5 rounded-2xl border backdrop-blur-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-gold)] ${
                          i === active
                            ? 'border-[var(--accent-cyan)] bg-[rgba(13,18,32,0.9)] shadow-[inset_0_0_0_1px_var(--accent-cyan)]'
                            : 'border-[var(--border-subtle)] bg-[rgba(13,18,32,0.7)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-bold" style={{ color: s.color }}>{s.badge}</span>
                          <span className="font-mono text-xs text-[var(--text-secondary)]">Band {s.band} · {s.wavelength}</span>
                        </div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">{s.title}</h3>
                        <div className="font-mono text-xs text-[var(--accent-gold)]">
                          {s.sector} ({s.ra.toFixed(1)}°, {s.dec >= 0 ? '+' : ''}{s.dec.toFixed(1)}°)
                        </div>
                        <AnimatePresence initial={false}>
                          {i === active && (
                            <motion.p
                              key="desc"
                              initial={{ height: 0, opacity: 0, marginTop: 0 }}
                              animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                              exit={{ height: 0, opacity: 0, marginTop: 0 }}
                              transition={{ duration: 0.45, ease: EASE }}
                              className="text-sm leading-relaxed overflow-hidden"
                            >
                              {s.description}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    ))}
                  </div>

                  <motion.div
                    initial={{ opacity: 0, x: 40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
                    className={`p-6 flex flex-col gap-5 ${PANEL}`}
                  >
                    <div
                      aria-hidden="true"
                      className="relative aspect-[1.6] lg:aspect-[2] rounded-xl overflow-hidden bg-[radial-gradient(circle,rgba(0,229,255,0.08),transparent_70%)]"
                    >
                      {[30, 55, 80].map((w) => (
                        <i
                          key={w}
                          className="absolute left-1/2 top-1/2 rounded-full border border-[rgba(0,229,255,0.28)] -translate-x-1/2 -translate-y-1/2 aspect-square"
                          style={{ width: `${w}%` }}
                        />
                      ))}
                      <motion.span
                        className="absolute left-1/2 top-1/2 h-[2px] w-1/2 origin-left bg-gradient-to-r from-[var(--accent-cyan)] to-transparent"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
                      />
                      <span
                        className="absolute w-4 h-4 rounded-full border-2 transition-all duration-700"
                        style={{
                          left: `${target.pos.x}%`,
                          top: `${target.pos.y}%`,
                          borderColor: target.color,
                          boxShadow: `0 0 14px ${target.color}`,
                        }}
                      />
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={target.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="grid grid-cols-3 gap-3"
                      >
                        {target.metrics.map((m) => (
                          <div key={m.label} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.35)]">
                            <div className="font-mono text-xs text-[var(--text-secondary)] mb-1">{m.label}</div>
                            <div className="text-sm font-bold">{m.value}</div>
                          </div>
                        ))}
                      </motion.div>
                    </AnimatePresence>

                    <Link
                      href={target.compareUrl}
                      className="py-3 rounded-xl bg-[var(--accent-cyan)] text-[#060810] text-sm font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,229,255,0.5)] transition-all"
                    >
                      Launch Investigation <ArrowRight className="w-4 h-4" />
                    </Link>
                  </motion.div>
                </div>
              </div>
            </div>
          </section>

          {/* ===== CAPABILITIES ===== */}
          <section id="capabilities" className="max-w-6xl mx-auto px-5 py-28 scroll-mt-20">
            <h2 className="mt-4 mb-9 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              <SplitWords text="Instruments built for" />{' '}
              <SplitWords text="subtle motion and raw flux." wordClass={GRAD} delay={0.25} />
            </h2>

            <div className="space-y-3">
              {CAPABILITIES.map(({ n: num, title, desc, href, cta, Icon }, i) => (
                <motion.div
                  key={num}
                  initial={{ opacity: 0, x: -70 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.8, ease: EASE, delay: i * 0.12 }}
                >
                  <Link
                    href={href}
                    className={`group grid md:grid-cols-[56px_1fr_1.3fr_auto] gap-2 md:gap-6 items-center p-6 hover:border-[var(--accent-cyan)] transition-colors ${PANEL}`}
                  >
                    <span className={`text-[var(--accent-cyan)] ${LABEL}`}>{num}</span>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon className="w-5 h-5 text-[var(--accent-orange)] transition-transform duration-500 group-hover:rotate-12 group-hover:scale-125" /> {title}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
                    <span className={`text-[var(--accent-cyan)] ${LABEL} transition-transform duration-300 group-hover:translate-x-2`}>
                      {cta} →
                    </span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ===== FINAL CTA ===== */}
          <section className="max-w-4xl mx-auto px-5 pt-8 pb-28">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 60 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 1, ease: EASE }}
              className={`relative overflow-hidden p-10 sm:p-14 text-center ${PANEL}`}
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -top-1/2 left-1/2 h-[120%] w-[80%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,229,255,0.14),transparent_65%)]"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
              />
              <h2 className="relative text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
                <SplitWords text="Begin the" />
                <SplitWords text="infrared search." wordClass={GRAD} delay={0.2} />
              </h2>
              <Reveal delay={0.3} className="relative">
                <p className="max-w-xl mx-auto text-[var(--text-secondary)] mb-8">
                  Work with calibrated multi-epoch stacks, flag anomalous candidates and export tables as FITS or VOTable.
                </p>
              </Reveal>
              <Reveal delay={0.45} className="relative">
                <div className="flex flex-wrap justify-center gap-4">
                  <Magnetic>
                    <Link
                      href="/explore"
                      className="inline-block px-6 py-3.5 rounded-xl bg-[var(--accent-cyan)] text-[#060810] font-bold text-sm hover:shadow-[0_0_24px_rgba(0,229,255,0.6)] transition-all"
                    >
                      Launch 3D Celestial Explorer
                    </Link>
                  </Magnetic>
                  <Magnetic>
                    <a
                      href="#evidence"
                      className="inline-block px-6 py-3.5 rounded-xl border border-[var(--border-subtle)] bg-[rgba(13,18,32,0.85)] text-sm font-semibold hover:border-[var(--border-hover)] transition-all"
                    >
                      Pipeline Methodology
                    </a>
                  </Magnetic>
                </div>
              </Reveal>
            </motion.div>
          </section>
        </main>

        {/* ===== FOOTER ===== */}
        <footer className="relative z-20 px-6 py-6 border-t border-[var(--border-subtle)] bg-[rgba(6,8,16,0.85)] text-sm text-[var(--text-secondary)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>
            SkyTrace Discovery Engine • NASA Space Apps Challenge 2026 •{' '}
            <span className="text-[var(--accent-cyan)]">SPHEREx QR3 Data Release</span>
          </span>
          <span className="flex items-center gap-5">
            <Link href="/explore" className="hover:text-white transition-colors">3D Explorer</Link>
            <Link href="/compare" className="hover:text-white transition-colors">Blink Viewer</Link>
            <a
              href="https://irsa.ipac.caltech.edu"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors inline-flex items-center gap-1"
            >
              NASA IRSA <ExternalLink className="w-3 h-3" />
            </a>
          </span>
        </footer>
      </div>
    </MotionConfig>
  );
}