#!/usr/bin/env python3
"""Apply the SkyTrace gold/ivory theme to a frontend/ directory (idempotent). Usage: gold_theme.py <frontend_dir>"""
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
app = root / "app"
changed = []

def rw(path, fn):
    s = path.read_text()
    n = fn(s)
    if n != s:
        path.write_text(n)
        changed.append(str(path.relative_to(root)))

# ---- 1. globals.css: remap root tokens, add st-* tokens and utilities
CSS_VARS = {
    "--bg-primary": "#0a0b0f", "--bg-secondary": "#121318",
    "--bg-card": "rgba(18, 19, 24, 0.7)", "--bg-glass": "rgba(18, 19, 24, 0.85)",
    "--border-subtle": "rgba(212, 175, 55, 0.22)", "--border-hover": "rgba(212, 175, 55, 0.45)",
    "--border-active": "rgba(212, 175, 55, 0.7)",
    "--text-primary": "#F3EEE0", "--text-secondary": "#9A9DA8", "--text-muted": "#6B6E7A",
    "--accent-cyan": "#D4AF37", "--accent-orange": "#C8793A", "--accent-gold": "#E6C65C",
    "--accent-purple": "#9B7EBD", "--accent-green": "#8FBC8F", "--danger": "#E0715F",
}
ST_BLOCK = """
/* SkyTrace gold theme tokens */
:root {
  --st-gold: #D4AF37;
  --st-gold-soft: #E6C65C;
  --st-ivory: #F3EEE0;
  --st-muted: #9A9DA8;
  --st-dim: #6B6E7A;
  --st-line: rgba(212, 175, 55, 0.22);
  --st-ok: #8FBC8F;
  --st-bad: #E0715F;
  --font-serif: 'Cormorant Garamond', Georgia, serif;
}
.st-serif { font-family: var(--font-serif); font-weight: 400; }
.st-mono { font-family: var(--font-mono); }
.st-panel { background: rgba(255,255,255,0.02); border: 1px solid var(--st-line); border-radius: 4px; }
"""

def css(s):
    for k, v in CSS_VARS.items():
        s = re.sub(rf"({re.escape(k)}\s*:\s*)[^;]+;", rf"\g<1>{v};", s, count=1)
    s = re.sub(r"(\.glass-panel\s*\{[^}]*?border-radius:\s*)\d+px", r"\g<1>4px", s)
    s = s.replace("rgba(0, 229, 255, 0.3)", "rgba(212, 175, 55, 0.45)")
    if "SkyTrace gold theme tokens" not in s:
        s = s.rstrip() + "\n" + ST_BLOCK
    return s

# ---- 2. tailwind palette
TW = {"#060810": "#0a0b0f", "#0D1220": "#121318", "#00E5FF": "#D4AF37", "#FF6B35": "#C8793A",
      "#FFD166": "#E6C65C", "#06D6A0": "#8FBC8F", "#9D4EDD": "#9B7EBD", "#EF476F": "#E0715F"}
def tw(s):
    for a, b in TW.items():
        s = s.replace(a, b)
    return s.replace("rgba(255, 255, 255, 0.08)", "rgba(212, 175, 55, 0.22)")

# ---- 3. hard-coded colours in components/pages
HEX = {"#060810": "#0a0b0f", "#0D1220": "#121318", "#00E5FF": "#D4AF37", "#FF6B35": "#C8793A",
       "#FFD166": "#E6C65C", "#06D6A0": "#8FBC8F", "#EF476F": "#E0715F", "#F0F4FF": "#F3EEE0",
       "#8892B0": "#9A9DA8", "#9aa4bf": "#9A9DA8", "#4A5568": "#6B6E7A"}
RGB = {(0, 229, 255): "212,175,55", (255, 107, 53): "200,121,58", (255, 209, 102): "230,198,92",
       (6, 214, 160): "143,188,143", (239, 71, 111): "224,113,95", (6, 8, 16): "10,11,15",
       (13, 18, 32): "18,19,24"}

def tsx(s):
    for a, b in HEX.items():
        s = re.sub(re.escape(a), b, s, flags=re.I)
    def rep(m):
        key = tuple(int(m.group(i)) for i in (1, 2, 3))
        return f"rgba({RGB[key]}," if key in RGB else m.group(0)
    s = re.sub(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,", rep, s)
    s = re.sub(r"\brounded-(lg|xl|2xl)\b", "rounded-sm", s)
    # page titles: serif, light
    s = re.sub(r'(<h1 className=")text-base font-bold tracking-tight', r"\1st-serif text-2xl font-normal tracking-tight leading-none", s)
    return s

# ---- 4. layout: make sure the serif font is loaded
def layout(s):
    if "Cormorant" not in s:
        s = s.replace("family=Inter:", "family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Inter:", 1)
    return s

if (app / "globals.css").exists():
    rw(app / "globals.css", css)
if (root / "tailwind.config.js").exists():
    rw(root / "tailwind.config.js", tw)
if (app / "layout.tsx").exists():
    rw(app / "layout.tsx", layout)
for p in sorted(app.rglob("*.tsx")):
    if p.name == "layout.tsx":
        continue
    rw(p, tsx)

print("changed:", *changed, sep="\n  ")
