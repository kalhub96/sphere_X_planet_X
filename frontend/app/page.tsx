'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  motion,
  MotionConfig,
  AnimatePresence,
  animate,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import CelestialSphere from './components/sky/CelestialSphere';
import { Telescope, ArrowRight, Compass, Layers, Link2, ExternalLink, Search, Sparkles } from 'lucide-react';
import { parseCoordinateInput } from './lib/astrometry';

/* ---------- config ---------- */
// Update via env var when a new SPHEREx release lands; no code change needed.
const TOKENS = {
  '--st-gold': '#D4AF37',
  '--st-gold-soft': '#E6C65C',
  '--st-ivory': '#F3EEE0',
  '--st-muted': '#9A9DA8',
  '--st-dim': '#6B6E7A',
  '--st-line': 'rgba(212,175,55,0.22)',
  '--st-ok': '#8FBC8F',
} as React.CSSProperties;

const RELEASE = process.env.NEXT_PUBLIC_SPHEREX_RELEASE ?? 'Latest';

/** `fov` is in arcseconds here; the viewer URL takes degrees. */
const blinkUrl = (ra: number, dec: number, fov = 120) =>
  `/compare?ra=${ra}&dec=${dec}&fov=${Number((fov / 3600).toFixed(4))}`;

// Coordinates are approximate J2000: verify against SIMBAD before relying on them.
// Movers: use a larger FOV so the source stays in frame across epochs.
const TARGETS = [
  {
    id: 'wise0855',
    title: 'WISE 0855−0714',
    sector: 'Coldest known brown dwarf',
    ra: 133.7951,
    dec: -7.2451,
    fov: 300,
    badge: 'Fast-moving brown dwarf',
    color: 'var(--st-gold)',
    pos: { x: 68, y: 30 },
    description:
      'A very cold, nearby brown dwarf with a large proper motion. It should visibly shift between SPHEREx epochs, which makes it a good first test for the blink view.',
    metrics: [
      { label: 'Distance', value: '≈ 2.3 pc' },
      { label: 'Proper motion', value: '≈ 8″/yr' },
      { label: 'Type', value: 'Y dwarf' },
    ],
  },
  {
    id: 'barnard',
    title: "Barnard's Star",
    sector: 'Highest proper motion star',
    ra: 269.452,
    dec: 4.693,
    fov: 300,
    badge: 'Nearby red dwarf',
    color: 'var(--st-gold-soft)',
    pos: { x: 32, y: 42 },
    description:
      'The star with the largest known proper motion. Its shift across the sky is large enough to see between scans.',
    metrics: [
      { label: 'Distance', value: '≈ 1.8 pc' },
      { label: 'Proper motion', value: '≈ 10.4″/yr' },
      { label: 'Type', value: 'M dwarf' },
    ],
  },
  {
    id: 'epsindi',
    title: 'Epsilon Indi B',
    sector: 'Brown dwarf pair around a star',
    ra: 330.84,
    dec: -56.786,
    fov: 300,
    badge: 'Brown dwarf binary',
    color: 'var(--st-gold)',
    pos: { x: 58, y: 68 },
    description:
      'A pair of brown dwarfs orbiting the nearby star Epsilon Indi A. The system moves together across the sky.',
    metrics: [
      { label: 'Distance', value: '≈ 3.6 pc' },
      { label: 'Proper motion', value: '≈ 4.7″/yr' },
      { label: 'Type', value: 'T dwarf pair' },
    ],
  },
  {
    id: 'rwaur',
    title: 'RW Aurigae',
    sector: 'Young irregular variable',
    ra: 76.957,
    dec: 30.401,
    fov: 120,
    badge: 'Variable star',
    color: 'var(--st-ok)',
    pos: { x: 22, y: 25 },
    description: 'A young star with irregular brightness changes. Watch for flux variation rather than motion.',
    metrics: [
      { label: 'Signal', value: 'Brightness change' },
      { label: 'Type', value: 'T Tauri star' },
      { label: 'Look for', value: 'Flux dips' },
    ],
  },
  {
    id: 'rdra',
    title: 'R Draconis',
    sector: 'Long-period pulsating variable',
    ra: 248.18,
    dec: 66.75,
    fov: 120,
    badge: 'Variable star',
    color: 'var(--st-gold)',
    pos: { x: 76, y: 62 },
    description: 'A Mira-type variable that swells and fades over months. Compare epochs to see the change.',
    metrics: [
      { label: 'Signal', value: 'Brightness change' },
      { label: 'Type', value: 'Mira variable' },
      { label: 'Look for', value: 'Flux change' },
    ],
  },
];

const STAT_BADGES = [
  { value: '102', label: 'Spectral Bands', sub: 'Near-infrared, 0.75 – 5.0 µm.' },
  { value: '6', label: 'Detector Arrays', sub: 'Each array covers its own wavelength range.' },
  { value: '6 mo', label: 'Full-Sky Cadence', sub: 'The whole sky is mapped every six months.' },
  { value: '6.2″', label: 'Pixel Scale', sub: 'Angular size of one SPHEREx pixel.' },
];

const CAPABILITIES = [
  {
    n: '01',
    title: '3D Celestial Explorer',
    desc: 'Browse the sky on an interactive sphere and pick a patch to inspect.',
    href: '/explore',
    cta: 'Launch',
    Icon: Compass,
  },
  {
    n: '02',
    title: 'Blink Viewer',
    desc: 'Step through images of one patch over time to spot objects that move or change brightness.',
    href: blinkUrl(133.7951, -7.2451, 300),
    cta: 'Open',
    Icon: Layers,
  },
  {
    n: '03',
    title: 'Shareable URLs',
    desc: 'Every view is set by RA, Dec and field of view in the URL, so it can be linked or embedded.',
    href: blinkUrl(269.452, 4.693, 300),
    cta: 'Try',
    Icon: Link2,
  },
];

const MANIFESTO =
  'Compare images of the same patch taken at different times. Anything that moves or changes brightness stands out.';

const GRAD = 'italic text-[var(--st-gold)]';
const PANEL = 'st-panel backdrop-blur-md';
const LABEL = 'font-mono text-xs uppercase tracking-[0.08em]';
const INPUT =
  'w-full px-3 py-3 rounded-sm bg-[rgba(18,19,24,0.85)] border border-[var(--st-line)] text-sm text-[#F3EEE0] placeholder:text-[var(--st-muted)] focus:outline-none focus:border-[var(--st-gold)]';

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---------- animation helpers ---------- */
function Reveal({ children, delay = 0, y = 40, className = '' }: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
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

function SplitWords({ text, wordClass = '', delay = 0 }: { text: string; wordClass?: string; delay?: number }) {
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
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em] mr-[0.25em]">
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

function FillWord({ children, progress, range }: { children: React.ReactNode; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block mr-[0.28em]">
      {children}
    </motion.span>
  );
}

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
      className="pointer-events-none fixed left-0 top-0 z-[5] hidden h-[400px] w-[400px] rounded-full md:block bg-[radial-gradient(circle,rgba(212,175,55,0.10),transparent_65%)]"
    />
  );
}

/* ---------- coordinate form ---------- */
function CoordForm() {
  const router = useRouter();
  const [ra, setRa] = useState('');
  const [dec, setDec] = useState('');
  const [fov, setFov] = useState('120');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseCoordinateInput(`${ra.trim()}, ${dec.trim()}`);
        if (!parsed) {
          setError('Could not read those coordinates. Use degrees (133.795, -7.245) or hh:mm:ss / dd:mm:ss.');
          return;
        }
        setError(null);
        const q = new URLSearchParams({
          ra: parsed.ra.toFixed(6),
          dec: parsed.dec.toFixed(6),
          fov: String(Number((Number(fov) / 3600).toFixed(4))),
        });
        router.push(`/compare?${q.toString()}`);
      }}
      className={`mx-auto mt-8 max-w-3xl p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] text-left bg-[rgba(18,19,24,0.85)] ${PANEL} rounded-sm`}
    >
      <label className="block">
        <span className={`block mb-1 text-[var(--st-muted)] ${LABEL}`}>RA (deg or hh:mm:ss)</span>
        <input value={ra} onChange={(e) => setRa(e.target.value)} required name="ra" placeholder="08:55:10.831" className={INPUT} />
      </label>
      <label className="block">
        <span className={`block mb-1 text-[var(--st-muted)] ${LABEL}`}>Dec (deg or dd:mm:ss)</span>
        <input value={dec} onChange={(e) => setDec(e.target.value)} required name="dec" placeholder="-07:14:42.53" className={INPUT} />
      </label>
      <label className="block">
        <span className={`block mb-1 text-[var(--st-muted)] ${LABEL}`}>Field of view</span>
        <select value={fov} onChange={(e) => setFov(e.target.value)} name="fov" className={INPUT}>
          <option value="60">1′</option>
          <option value="120">2′</option>
          <option value="300">5′</option>
          <option value="600">10′</option>
        </select>
      </label>
      <button
        type="submit"
        className="self-end px-5 py-3 rounded-sm bg-[var(--st-gold)] text-[#0a0b0f] text-xs font-mono font-semibold uppercase tracking-[0.12em] hover:shadow-[0_0_16px_rgba(212,175,55,0.5)] transition-all flex items-center justify-center gap-2"
      >
        <Search className="w-4 h-4" /> Blink
      </button>
      {error && <p className="sm:col-span-4 text-xs text-[var(--danger)]">{error}</p>}
    </form>
  );
}

/* ---------- page ---------- */
export default function HomePage() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [navHidden, setNavHidden] = useState(false);
  const n = TARGETS.length;

  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  useMotionValueEvent(scrollY, 'change', (latest) => {
    const prev = scrollY.getPrevious() ?? 0;
    setNavHidden(latest > prev && latest > 120);
  });

  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.28]);

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroP } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(heroP, [0, 1], [0, 160]);
  const heroOpacity = useTransform(heroP, [0, 0.75], [1, 0]);
  const heroScale = useTransform(heroP, [0, 1], [1, 0.93]);

  // autoplay until the user picks a target
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setActive((i) => (i + 1) % n), 6000);
    return () => clearInterval(t);
  }, [auto, n]);

  const selectTarget = (i: number) => {
    setActive(i);
    setAuto(false);
  };

  const target = TARGETS[active];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen w-screen overflow-x-hidden bg-[#0a0b0f] text-[#F3EEE0] font-sans" style={TOKENS}>
        <style>{`.st-panel{background:rgba(255,255,255,0.02);border:1px solid var(--st-line);border-radius:4px}.st-serif{font-family:Cormorant Garamond,Georgia,serif}`}</style>
        <motion.div
          style={{ scaleX: progress }}
          className="fixed top-0 left-0 right-0 h-[3px] origin-left z-50 bg-gradient-to-r from-[var(--st-gold)] via-[var(--st-gold)] to-[var(--st-gold-soft)]"
        />

        <motion.div style={{ scale: bgScale }} className="fixed inset-0 z-0 pointer-events-auto opacity-70">
          <CelestialSphere className="w-full h-full" />
        </motion.div>
        <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(10,11,15,0.2)_0%,rgba(10,11,15,0.7)_65%,#0a0b0f_100%)]" />
        <CursorGlow />

        <motion.header
          animate={{ y: navHidden ? '-100%' : '0%' }}
          transition={{ duration: 0.4, ease: EASE }}
          className="sticky top-0 z-40 border-b border-[var(--st-line)] bg-[rgba(10,11,15,0.72)] backdrop-blur-md"
        >
          <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-sm bg-[rgba(212,175,55,0.15)] text-[var(--st-gold)] flex items-center justify-center border border-[rgba(212,175,55,0.3)] shadow-[0_0_12px_rgba(212,175,55,0.3)]">
                <Telescope className="w-5 h-5" />
              </span>
              <span className="st-serif text-2xl leading-none">Sky<span className="italic text-[var(--st-gold)]">Trace</span></span>
            </Link>

            <nav className={`hidden md:flex items-center gap-8 text-[var(--st-muted)] ${LABEL}`}>
              <a href="#how" className="hover:text-[var(--st-gold)] transition-colors">How it works</a>
              <a href="#targets" className="hover:text-[var(--st-gold)] transition-colors">Try a target</a>
              <a href="#capabilities" className="hover:text-[var(--st-gold)] transition-colors">Tools</a>
            </nav>

            <Link
              href="/explore"
              className="px-4 py-2 rounded-sm bg-[var(--st-gold)] text-[#0a0b0f] text-xs font-mono font-semibold uppercase tracking-[0.12em] hover:shadow-[0_0_16px_rgba(212,175,55,0.5)] transition-all flex items-center gap-1.5"
            >
              Launch Explorer <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.header>

        <main className="relative z-10">
          {/* HERO */}
          <section ref={heroRef} className="relative min-h-[92vh] flex items-center">
            <motion.div
              style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
              className="max-w-6xl mx-auto px-5 pt-20 pb-24 text-center w-full"
            >
              <motion.span
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: EASE }}
                className={`inline-block px-4 py-2 rounded-full border border-[var(--st-line)] bg-[rgba(18,19,24,0.7)] backdrop-blur-md text-[var(--st-muted)] ${LABEL}`}
              >
                NASA SPHEREx · {RELEASE} release
              </motion.span>

              <h1 className="mt-6 mb-6 text-4xl sm:text-6xl lg:text-7xl st-serif font-normal tracking-tight leading-[1.06]">
                <SplitWords text="Watch the sky change." delay={0.15} />
                <br />
                <SplitWords text="Spot what moves." wordClass={GRAD} delay={0.5} />
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}
                className="max-w-2xl mx-auto text-base sm:text-lg text-[var(--st-muted)] leading-relaxed"
              >
                Enter a position on the sky and see SPHEREx images of that patch played like a short video.
                Moving asteroids, comets, stars and brown dwarfs show up as points that shift between frames.
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 1.05 }}>
                <CoordForm />
                <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                  <Magnetic>
                    <Link
                      href="/explore"
                      className="px-6 py-3.5 rounded-sm bg-[var(--st-gold)] text-[#0a0b0f] font-semibold text-sm hover:shadow-[0_0_24px_rgba(212,175,55,0.6)] transition-all flex items-center gap-2"
                    >
                      <Compass className="w-4 h-4" /> Browse the sky
                    </Link>
                  </Magnetic>
                  <Magnetic>
                    <a
                      href="#targets"
                      className={`px-6 py-3.5 rounded-sm text-sm font-semibold flex items-center gap-2 bg-[rgba(18,19,24,0.85)] hover:border-[var(--st-gold)] ${PANEL}`}
                    >
                      <Layers className="w-4 h-4 text-[var(--st-gold-soft)]" /> Try an example
                    </a>
                  </Magnetic>
                </div>
              </motion.div>
            </motion.div>
          </section>

          {/* HOW IT WORKS + STATS */}
          <section id="how" className="max-w-6xl mx-auto px-5 py-28 scroll-mt-20">
            <h2 className="mt-4 mb-8 text-3xl sm:text-4xl st-serif font-normal tracking-tight leading-tight">
              <SplitWords text="Find discoveries by" />{' '}
              <SplitWords text="comparing images over time." wordClass={GRAD} delay={0.3} />
            </h2>

            <ScrollFillText text={MANIFESTO} className="max-w-4xl text-2xl sm:text-4xl font-semibold leading-snug tracking-tight text-[var(--st-ivory)]" />

            <div className={`mt-14 grid grid-cols-2 lg:grid-cols-4 ${PANEL} overflow-hidden`}>
              {STAT_BADGES.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.8, ease: EASE, delay: i * 0.12 }}
                  className={`p-6 border-[var(--st-line)] ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b lg:border-b-0' : ''} ${i < 3 ? 'lg:border-r' : 'lg:border-r-0'}`}
                >
                  <CountUp value={s.value} className={`text-4xl font-extrabold font-mono ${GRAD}`} />
                  <div className={`mt-3 mb-1 text-[var(--st-gold)] ${LABEL}`}>{s.label}</div>
                  <p className="text-sm text-[var(--st-muted)] leading-snug">{s.sub}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* TARGETS */}
          <section id="targets" className="scroll-mt-20 py-20">
            <div className="w-full max-w-6xl mx-auto px-5">
              <h2 className="mt-4 mb-2 text-3xl sm:text-4xl st-serif font-normal tracking-tight">
                <SplitWords text="Try a known target" />
              </h2>
              <p className="mb-8 text-[var(--st-muted)] max-w-2xl">
                Five objects that show motion or brightness change. Pick one and open it in the blink viewer.
              </p>

              <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
                <div role="tablist" aria-label="Example targets" className="flex flex-col gap-3">
                  {TARGETS.map((s, i) => (
                    <motion.button
                      key={s.id}
                      role="tab"
                      aria-selected={i === active}
                      onClick={() => selectTarget(i)}
                      initial={{ opacity: 0, x: -40 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: '-60px' }}
                      transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
                      className={`text-left p-5 rounded-sm border backdrop-blur-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-gold)] ${
                        i === active
                          ? 'border-[var(--st-gold)] bg-[rgba(18,19,24,0.9)] shadow-[inset_0_0_0_1px_var(--st-gold)]'
                          : 'border-[var(--st-line)] bg-[rgba(18,19,24,0.7)] text-[var(--st-muted)] hover:border-[var(--st-gold)]'
                      }`}
                    >
                      <div className="font-mono text-xs font-semibold mb-1" style={{ color: s.color }}>{s.badge}</div>
                      <h3 className="text-lg font-semibold text-[var(--st-ivory)]">{s.title}</h3>
                      <div className="font-mono text-xs text-[var(--st-gold)]">
                        {s.sector} ({s.ra.toFixed(2)}°, {s.dec >= 0 ? '+' : ''}{s.dec.toFixed(2)}°)
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
                    className="relative aspect-[1.6] lg:aspect-[2] rounded-sm overflow-hidden bg-[radial-gradient(circle,rgba(212,175,55,0.08),transparent_70%)]"
                  >
                    {[30, 55, 80].map((w) => (
                      <i
                        key={w}
                        className="absolute left-1/2 top-1/2 rounded-full border border-[rgba(212,175,55,0.28)] -translate-x-1/2 -translate-y-1/2 aspect-square"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                    <motion.span
                      className="absolute left-1/2 top-1/2 h-[2px] w-1/2 origin-left bg-gradient-to-r from-[var(--st-gold)] to-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
                    />
                    <span
                      className="absolute w-4 h-4 rounded-full border-2 transition-all duration-700"
                      style={{ left: `${target.pos.x}%`, top: `${target.pos.y}%`, borderColor: target.color, boxShadow: `0 0 14px ${target.color}` }}
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
                        <div key={m.label} className="p-3 rounded-sm border border-[var(--st-line)] bg-[rgba(0,0,0,0.35)]">
                          <div className="font-mono text-xs text-[var(--st-muted)] mb-1">{m.label}</div>
                          <div className="text-sm font-semibold">{m.value}</div>
                        </div>
                      ))}
                    </motion.div>
                  </AnimatePresence>

                  <Link
                    href={blinkUrl(target.ra, target.dec, target.fov)}
                    className="py-3 rounded-sm bg-[var(--st-gold)] text-[#0a0b0f] text-xs font-mono font-semibold uppercase tracking-[0.12em] flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] transition-all"
                  >
                    Open in blink viewer <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </section>

          {/* TOOLS */}
          <section id="capabilities" className="max-w-6xl mx-auto px-5 py-28 scroll-mt-20">
            <h2 className="mt-4 mb-9 text-3xl sm:text-4xl st-serif font-normal tracking-tight leading-tight">
              <SplitWords text="Simple tools for" />{' '}
              <SplitWords text="spotting motion." wordClass={GRAD} delay={0.25} />
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
                    className={`group grid md:grid-cols-[56px_1fr_1.3fr_auto] gap-2 md:gap-6 items-center p-6 hover:border-[var(--st-gold)] transition-colors ${PANEL}`}
                  >
                    <span className={`text-[var(--st-gold)] ${LABEL}`}>{num}</span>
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <Icon className="w-5 h-5 text-[var(--st-gold-soft)] transition-transform duration-500 group-hover:rotate-12 group-hover:scale-125" /> {title}
                    </h3>
                    <p className="text-sm text-[var(--st-muted)]">{desc}</p>
                    <span className={`text-[var(--st-gold)] ${LABEL} transition-transform duration-300 group-hover:translate-x-2`}>{cta} →</span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>

          {/* FINAL CTA */}
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
                className="pointer-events-none absolute -top-1/2 left-1/2 h-[120%] w-[80%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.14),transparent_65%)]"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
              />
              <h2 className="relative text-3xl sm:text-5xl st-serif font-normal tracking-tight mb-4">
                <SplitWords text="Start looking." wordClass={GRAD} />
              </h2>
              <Reveal delay={0.3} className="relative">
                <p className="max-w-xl mx-auto text-[var(--st-muted)] mb-8">
                  Pick any patch of sky and see how it changes. New discoveries need many eyes.
                </p>
              </Reveal>
              <Reveal delay={0.45} className="relative">
                <div className="flex flex-wrap justify-center gap-4">
                  <Magnetic>
                    <Link
                      href="/explore"
                      className="inline-block px-6 py-3.5 rounded-sm bg-[var(--st-gold)] text-[#0a0b0f] font-semibold text-sm hover:shadow-[0_0_24px_rgba(212,175,55,0.6)] transition-all"
                    >
                      Launch 3D Explorer
                    </Link>
                  </Magnetic>
                  <Magnetic>
                    <a
                      href="#how"
                      className="inline-block px-6 py-3.5 rounded-sm border border-[var(--st-line)] bg-[rgba(18,19,24,0.85)] text-sm font-semibold hover:border-[var(--st-gold)] transition-all"
                    >
                      How it works
                    </a>
                  </Magnetic>
                </div>
              </Reveal>
            </motion.div>
          </section>
        </main>

        <footer className="relative z-20 px-6 py-6 border-t border-[var(--st-line)] bg-[rgba(10,11,15,0.85)] text-sm text-[var(--st-muted)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>
            SkyTrace · NASA Space Apps Challenge 2026 · <span className="text-[var(--st-gold)]">SPHEREx {RELEASE} release</span>
          </span>
          <span className="flex items-center gap-5">
            <Link href="/explore" className="hover:text-white transition-colors">3D Explorer</Link>
            <Link href="/compare" className="hover:text-white transition-colors">Blink Viewer</Link>
            <a
              href="https://irsa.ipac.caltech.edu/Missions/spherex.html"
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