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
import { Telescope, ArrowRight, Layers, ExternalLink, Search, Sparkles } from 'lucide-react';
import { parseCoordinateInput } from './lib/astrometry';

/* ---------- config ---------- */
// Update via env var when a new SPHEREx release lands; no code change needed.
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
    color: 'var(--accent-cyan)',
    pos: { x: 68, y: 30 },
    description:
      'A very cold, nearby brown dwarf with a large proper motion. It visibly shifts between SPHEREx epochs, best revealed in Band/Detector 6 (4.42–5.00 µm).',
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
    color: 'var(--accent-orange)',
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
    color: 'var(--accent-gold)',
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
    color: 'var(--accent-green)',
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
    color: 'var(--accent-cyan)',
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
  { value: '6', label: 'Detector Arrays', sub: 'Each array covers its own wavelength range (D1–D6).' },
  { value: '6 mo', label: 'Full-Sky Cadence', sub: 'The whole sky is mapped every six months.' },
  { value: '6.2″', label: 'Pixel Scale', sub: 'Angular size of one SPHEREx pixel.' },
];

const CAPABILITIES = [
  {
    n: '01',
    title: 'Multi-Epoch Video & Blink',
    desc: 'Step through images of one patch over time to spot objects that move or change brightness.',
    href: blinkUrl(133.7951, -7.2451, 300),
    cta: 'Open Viewer',
    Icon: Layers,
  },
  {
    n: '02',
    title: 'Image Subtraction & Dipoles',
    desc: 'Instant pixel difference mapping revealing clean positive/negative dipole signatures of moving objects.',
    href: '/compare?mode=difference',
    cta: 'Explore Differences',
    Icon: Sparkles,
  },
  {
    n: '03',
    title: 'Detector Coaddition (D1–D6)',
    desc: 'Separately coadd across SPHEREx detector arrays to boost signal-to-noise on faint infrared targets.',
    href: '/compare?array=D6',
    cta: 'View Coadds',
    Icon: Telescope,
  },
];

const MANIFESTO =
  'Compare images of the same patch taken at different times. Anything that moves or changes brightness stands out.';

const GRAD = 'bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-gold)] to-[var(--accent-orange)] bg-clip-text text-transparent';
const PANEL = 'glass-panel border border-[var(--border-subtle)] backdrop-blur-md';
const LABEL = 'font-mono text-xs uppercase tracking-[0.08em]';
const INPUT =
  'w-full px-3 py-3 rounded-lg bg-[rgba(13,18,32,0.85)] border border-[var(--border-subtle)] text-sm text-[#F0F4FF] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-cyan)]';

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
      className="pointer-events-none fixed left-0 top-0 z-[5] hidden h-[400px] w-[400px] rounded-full md:block bg-[radial-gradient(circle,rgba(0,229,255,0.10),transparent_65%)]"
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
      className={`mx-auto mt-8 max-w-3xl p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] text-left bg-[rgba(13,18,32,0.85)] ${PANEL} rounded-2xl`}
    >
      <label className="block">
        <span className={`block mb-1 text-[var(--text-secondary)] ${LABEL}`}>RA (deg or hh:mm:ss)</span>
        <input value={ra} onChange={(e) => setRa(e.target.value)} required name="ra" placeholder="08:55:10.831" className={INPUT} />
      </label>
      <label className="block">
        <span className={`block mb-1 text-[var(--text-secondary)] ${LABEL}`}>Dec (deg or dd:mm:ss)</span>
        <input value={dec} onChange={(e) => setDec(e.target.value)} required name="dec" placeholder="-07:14:42.53" className={INPUT} />
      </label>
      <label className="block">
        <span className={`block mb-1 text-[var(--text-secondary)] ${LABEL}`}>Field of view</span>
        <select value={fov} onChange={(e) => setFov(e.target.value)} name="fov" className={INPUT}>
          <option value="60">1′</option>
          <option value="120">2′</option>
          <option value="300">5′</option>
          <option value="600">10′</option>
        </select>
      </label>
      <button
        type="submit"
        className="self-end px-5 py-3 rounded-lg bg-[var(--accent-cyan)] text-[#060810] text-sm font-bold hover:shadow-[0_0_16px_rgba(0,229,255,0.5)] transition-all flex items-center justify-center gap-2"
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
      <div className="relative min-h-screen w-screen overflow-x-hidden bg-[#060810] text-[#F0F4FF] font-sans">
        <motion.div
          style={{ scaleX: progress }}
          className="fixed top-0 left-0 right-0 h-[3px] origin-left z-50 bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-gold)] to-[var(--accent-orange)]"
        />

        {/* High-performance cosmic background */}
        <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-950 via-[#060810] to-[#030408]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(0,229,255,0.08),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_60%,rgba(255,107,53,0.05),transparent_50%)]" />
        </div>
        <CursorGlow />

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
              <a href="#how" className="hover:text-[var(--accent-cyan)] transition-colors">How it works</a>
              <a href="#targets" className="hover:text-[var(--accent-cyan)] transition-colors">Try a target</a>
              <a href="#capabilities" className="hover:text-[var(--accent-cyan)] transition-colors">Tools</a>
            </nav>

            <Link
              href="/compare"
              className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-[#060810] text-sm font-bold hover:shadow-[0_0_16px_rgba(0,229,255,0.5)] transition-all flex items-center gap-1.5"
            >
              Start Investigating <ArrowRight className="w-4 h-4" />
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
                className={`inline-block px-4 py-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(13,18,32,0.7)] backdrop-blur-md text-[var(--text-secondary)] ${LABEL}`}
              >
                NASA SPHEREx · {RELEASE} release
              </motion.span>

              <h1 className="mt-6 mb-6 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.06]">
                <SplitWords text="Watch the sky change." delay={0.15} />
                <br />
                <SplitWords text="Spot what moves." wordClass={GRAD} delay={0.5} />
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.9 }}
                className="max-w-2xl mx-auto text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed"
              >
                Enter a position on the sky and see SPHEREx images of that patch played like a short video.
                Moving asteroids, comets, stars and brown dwarfs show up as points that shift between frames.
              </motion.p>

              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: 1.05 }}>
                <CoordForm />
                <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                  <Magnetic>
                    <Link
                      href="/compare"
                      className="px-6 py-3.5 rounded-xl bg-[var(--accent-cyan)] text-[#060810] font-bold text-sm hover:shadow-[0_0_24px_rgba(0,229,255,0.6)] transition-all flex items-center gap-2"
                    >
                      <Layers className="w-4 h-4" /> Open Investigation Viewer
                    </Link>
                  </Magnetic>
                  <Magnetic>
                    <a
                      href="#targets"
                      className={`px-6 py-3.5 rounded-xl text-sm font-semibold flex items-center gap-2 bg-[rgba(13,18,32,0.85)] hover:border-[var(--border-hover)] ${PANEL}`}
                    >
                      <Sparkles className="w-4 h-4 text-[var(--accent-orange)]" /> Try an example
                    </a>
                  </Magnetic>
                </div>
              </motion.div>
            </motion.div>
          </section>

          {/* HOW IT WORKS + STATS */}
          <section id="how" className="max-w-6xl mx-auto px-5 py-28 scroll-mt-20">
            <Reveal>
              <div className={`text-[var(--accent-cyan)] mb-3 ${LABEL}`}>How it works</div>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">
                Turn astronomical data into motion you can see.
              </h2>
            </Reveal>

            <ScrollFillText
              text={MANIFESTO}
              className="text-xl sm:text-3xl font-medium leading-relaxed text-[var(--text-primary)] my-12"
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-16">
              {STAT_BADGES.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.7, ease: EASE, delay: i * 0.1 }}
                  className={`p-6 rounded-2xl ${PANEL}`}
                >
                  <CountUp value={s.value} className={`text-3xl sm:text-4xl font-extrabold mb-1 ${GRAD}`} />
                  <div className="text-sm font-bold text-[var(--text-primary)] mb-1">{s.label}</div>
                  <p className="text-sm text-[var(--text-secondary)] leading-snug">{s.sub}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* TARGETS */}
          <section id="targets" className="scroll-mt-20 py-20">
            <div className="w-full max-w-6xl mx-auto px-5">
              <h2 className="mt-4 mb-2 text-3xl sm:text-4xl font-extrabold tracking-tight">
                <SplitWords text="Try a known target" />
              </h2>
              <p className="mb-8 text-[var(--text-secondary)] max-w-2xl">
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
                      className={`text-left p-5 rounded-2xl border backdrop-blur-md transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-gold)] ${
                        i === active
                          ? 'border-[var(--accent-cyan)] bg-[rgba(13,18,32,0.9)] shadow-[inset_0_0_0_1px_var(--accent-cyan)]'
                          : 'border-[var(--border-subtle)] bg-[rgba(13,18,32,0.7)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="font-mono text-xs font-bold mb-1" style={{ color: s.color }}>{s.badge}</div>
                      <h3 className="text-lg font-bold text-[var(--text-primary)]">{s.title}</h3>
                      <div className="font-mono text-xs text-[var(--accent-gold)]">
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
                        <div key={m.label} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.35)]">
                          <div className="font-mono text-xs text-[var(--text-secondary)] mb-1">{m.label}</div>
                          <div className="text-sm font-bold">{m.value}</div>
                        </div>
                      ))}
                    </motion.div>
                  </AnimatePresence>

                  <Link
                    href={blinkUrl(target.ra, target.dec, target.fov)}
                    className="py-3 rounded-xl bg-[var(--accent-cyan)] text-[#060810] text-sm font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,229,255,0.5)] transition-all"
                  >
                    Open in blink viewer <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </section>

          {/* TOOLS */}
          <section id="capabilities" className="max-w-6xl mx-auto px-5 py-28 scroll-mt-20">
            <h2 className="mt-4 mb-9 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
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
                    className={`group grid md:grid-cols-[56px_1fr_1.3fr_auto] gap-2 md:gap-6 items-center p-6 hover:border-[var(--accent-cyan)] transition-colors ${PANEL}`}
                  >
                    <span className={`text-[var(--accent-cyan)] ${LABEL}`}>{num}</span>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Icon className="w-5 h-5 text-[var(--accent-orange)] transition-transform duration-500 group-hover:rotate-12 group-hover:scale-125" /> {title}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
                    <span className={`text-[var(--accent-cyan)] ${LABEL} transition-transform duration-300 group-hover:translate-x-2`}>{cta} →</span>
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
                className="pointer-events-none absolute -top-1/2 left-1/2 h-[120%] w-[80%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,229,255,0.14),transparent_65%)]"
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 7, ease: 'easeInOut' }}
              />
              <h2 className="relative text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
                <SplitWords text="Start looking." wordClass={GRAD} />
              </h2>
              <Reveal delay={0.3} className="relative">
                <p className="max-w-xl mx-auto text-[var(--text-secondary)] mb-8">
                  Pick any patch of sky and see how it changes. New discoveries need many eyes.
                </p>
              </Reveal>
              <Reveal delay={0.45} className="relative">
                <div className="flex flex-wrap justify-center gap-4">
                  <Magnetic>
                    <Link
                      href="/compare"
                      className="inline-block px-6 py-3.5 rounded-xl bg-[var(--accent-cyan)] text-[#060810] font-bold text-sm hover:shadow-[0_0_24px_rgba(0,229,255,0.6)] transition-all"
                    >
                      Start Investigating
                    </Link>
                  </Magnetic>
                  <Magnetic>
                    <a
                      href="#how"
                      className="inline-block px-6 py-3.5 rounded-xl border border-[var(--border-subtle)] bg-[rgba(13,18,32,0.85)] text-sm font-semibold hover:border-[var(--border-hover)] transition-all"
                    >
                      How it works
                    </a>
                  </Magnetic>
                </div>
              </Reveal>
            </motion.div>
          </section>
        </main>

        <footer className="relative z-20 px-6 py-6 border-t border-[var(--border-subtle)] bg-[rgba(6,8,16,0.85)] text-sm text-[var(--text-secondary)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>
            SkyTrace · NASA Space Apps Challenge 2026 · <span className="text-[var(--accent-cyan)]">SPHEREx {RELEASE} release</span>
          </span>
          <span className="flex items-center gap-5">
            <Link href="/compare" className="hover:text-white transition-colors">Compare Viewer</Link>
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
