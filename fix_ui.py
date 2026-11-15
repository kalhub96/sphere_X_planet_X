#!/usr/bin/env python3
"""UI fixes: explore header overlap on phones, wrong resolving power R, 'Live' label. Run from repo root. Idempotent. Does not commit."""
import pathlib
R = pathlib.Path("."); done = []
def edit(path, pairs, skip_if=None):
    p = R / path
    if not p.exists(): print("MISSING", path); return
    s = p.read_text(); n = s
    if skip_if and skip_if in s: return
    for a, b in pairs:
        n = n.replace(a, b)
    if n != s: p.write_text(n); done.append(path)

edit("frontend/app/explore/page.tsx", [
    ('<span>Home</span>', '<span className="hidden sm:inline">Home</span>'),
    ('<div className="flex items-center gap-4">\n          <Link\n            href="/"', '<div className="flex items-center gap-2 sm:gap-4">\n          <Link\n            href="/"'),
    ('<h1 className="st-serif text-2xl font-normal', '<h1 className="st-serif text-lg sm:text-2xl whitespace-nowrap font-normal'),
    ('NASA IRSA SPHEREx QR3 Live Archive', 'NASA IRSA SPHEREx QR3 Archive'),
    ('            Blink Comparator\n', '            <span><span className="hidden sm:inline">Blink </span>Comparator</span>\n'),
    ('<div className="flex items-center gap-3">\n          <div className="hidden sm:inline-flex', '<div className="flex items-center gap-2 sm:gap-3">\n          <div className="hidden sm:inline-flex'),
])
edit("frontend/app/components/sky/WavelengthSlider.tsx", [
    ("  // Spectral resolving power R: ranges from ~41 at 0.75 µm to ~135 at 4.5 µm\n  const resolvingPowerR = Math.round(41 + (currentWavelength - 0.75) * 22);",
     "  // Resolving power per detector array (arXiv:2602.09139 Table 1): D1-D3 41, D4 35, D5 110, D6 125\n  const resolvingPowerR = [41, 41, 41, 35, 110, 125][Math.min(5, Math.floor((selectedBand - 1) / 17))];"),
])

edit("frontend/app/page.tsx", [
    ("import { useRouter } from 'next/navigation';\n",
     "import { useRouter } from 'next/navigation';\nimport { parseRA, parseDec } from './lib/astrometry';\nimport { FOV_PRESETS } from './config/benchmarks';\n\n"
     "// /compare takes degrees and only the preset FOVs; the landing form works in arcseconds.\n"
     "const nearestFov = (arcsec: number) =>\n  FOV_PRESETS.reduce((a, b) => (Math.abs(b - arcsec / 3600) < Math.abs(a - arcsec / 3600) ? b : a));\n"),
    ("const blinkUrl = (ra: number, dec: number, fov = 120) => `/compare?ra=${ra}&dec=${dec}&fov=${fov}`;",
     "const blinkUrl = (ra: number, dec: number, fov = 120) => `/compare?ra=${ra}&dec=${dec}&fov=${nearestFov(fov)}`;"),
    ("  const [ra, setRa] = useState('');\n  const [dec, setDec] = useState('');\n  const [fov, setFov] = useState('120');\n",
     "  const [ra, setRa] = useState('08:55:10.831');\n  const [dec, setDec] = useState('-07:14:42.53');\n  const [fov, setFov] = useState('120');\n  const [err, setErr] = useState('');\n"),
    ("        const q = new URLSearchParams({ ra: ra.trim(), dec: dec.trim(), fov });\n        router.push(`/compare?${q.toString()}`);",
     "        const r = parseRA(ra);\n        const d = parseDec(dec);\n        if (r === null || d === null) {\n          setErr('Could not read those coordinates. Try 08:55:10.831 / -07:14:42.53 or decimal degrees.');\n          return;\n        }\n        setErr('');\n        router.push(`/compare?ra=${r.toFixed(6)}&dec=${d.toFixed(6)}&fov=${nearestFov(Number(fov))}`);"),
    ('      <button\n        type="submit"\n        className="self-end',
     '      {err && <p className="sm:col-span-4 text-xs font-mono text-[var(--st-bad)]">{err}</p>}\n      <button\n        type="submit"\n        className="self-end'),
], skip_if="nearestFov")
print("changed:", *done, sep="\n  ")
