#!/usr/bin/env python3
"""
Placeholder office layer assets (docs/design.md §11) — flat-cartoon SVGs in the
same style as tools/generate_layer_assets.py (outline #1e2430, gradients,
drop shadows, small label chips so placeholders are honest).

Layout anchors (canvas 1000x1000):
  obg      full-bleed wall (0-680) + floor (680-1000)
  ocity    window band x560-960 y70-360
  oboard   board x70-450 y130-430
  oteam    mid-ground desks y480-700
  odesk    hero desk x330-970 y600-920 (grows with grade)
  omicro   trinket on the hero desk (~x700-790 y540-620)
  colleague figure centered x500 y360-790 (the renderer offsets c1/c2/c3)
  ocoffee  x60-230 y540-830
  omood    full-canvas translucent overlay

Usage: python3 tools/generate_office_assets.py
"""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'packages', 'client', 'public', 'layers')
OUTLINE = '#1e2430'
R = 1000

DEFS = '''<defs>
  <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a6abb5"/><stop offset="1" stop-color="#898e99"/>
  </linearGradient>
  <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5f5f5f"/><stop offset="1" stop-color="#424242"/>
  </linearGradient>
  <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ddeaf7"/><stop offset="1" stop-color="#a9c6e0"/>
  </linearGradient>
  <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b98d60"/><stop offset="1" stop-color="#8a6238"/>
  </linearGradient>
  <linearGradient id="steelGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8b93a3"/><stop offset="1" stop-color="#5d6672"/>
  </linearGradient>
</defs>'''


def svg(body, shadows='', texts=''):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {R} {R}" width="{R}" height="{R}">'
        f'{DEFS}{shadows}'
        f'<g stroke="{OUTLINE}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">{body}</g>'
        f'{texts}</svg>'
    )


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)


def shadow(cx, cy, rx, ry, opacity=0.14):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#000000" opacity="{opacity}" stroke="none"/>'


def label(text, x=500, y=960):
    return (
        f'<g><rect x="{x - 150}" y="{y - 34}" width="300" height="44" rx="12" '
        f'fill="#000000" opacity="0.35" stroke="none"/>'
        f'<text x="{x}" y="{y - 4}" font-family="monospace" font-size="24" '
        f'fill="#ffffff" opacity="0.75" text-anchor="middle">{text}</text></g>'
    )


def empty():
    return svg('', texts='')


# ---------------------------------------------------------------- backgrounds
def office_bg(kind, level):
    tints = {'garage': '#9a8a76', 'product': '#aec6d8', 'corp': '#8e96a3', 'cowork': '#b59a7d'}
    body = f'''
  <rect x="0" y="0" width="1000" height="680" fill="url(#wallGrad)"/>
  <rect x="0" y="0" width="1000" height="680" fill="{tints[kind]}" opacity="0.35"/>
  <rect x="0" y="656" width="1000" height="24" fill="url(#steelGrad)"/>
  <rect x="0" y="680" width="1000" height="320" fill="url(#floorGrad)"/>
  <line x1="0" y1="760" x2="1000" y2="760" stroke="#000000" stroke-width="3" opacity="0.15"/>
  <line x1="0" y1="840" x2="1000" y2="840" stroke="#000000" stroke-width="3" opacity="0.15"/>
  <line x1="0" y1="920" x2="1000" y2="920" stroke="#000000" stroke-width="3" opacity="0.15"/>'''
    if kind == 'garage':
        body += '''
  <line x1="0" y1="200" x2="1000" y2="200" stroke="#000000" stroke-width="2" opacity="0.12"/>
  <line x1="0" y1="400" x2="1000" y2="400" stroke="#000000" stroke-width="2" opacity="0.12"/>
  <rect x="60" y="120" width="150" height="200" rx="6" fill="#c46a5a" opacity="0.8"/>
  <text x="135" y="220" font-family="monospace" font-size="30" fill="#fff" text-anchor="middle" stroke="none">MVP</text>'''
    elif kind == 'product':
        body += '''
  <circle cx="130" cy="140" r="34" fill="#ffe08a"/>
  <rect x="90" y="230" width="80" height="120" rx="6" fill="#7fae7a"/>
  <rect x="70" y="350" width="120" height="26" rx="6" fill="url(#woodGrad)"/>'''
    elif kind == 'corp':
        body += '''
  <line x1="250" y1="0" x2="250" y2="656" stroke="#000000" stroke-width="3" opacity="0.12"/>
  <line x1="500" y1="0" x2="500" y2="656" stroke="#000000" stroke-width="3" opacity="0.12"/>
  <line x1="750" y1="0" x2="750" y2="656" stroke="#000000" stroke-width="3" opacity="0.12"/>
  <circle cx="880" cy="120" r="40" fill="#f2f2f2"/>
  <line x1="880" y1="120" x2="880" y2="90" stroke="#333" stroke-width="5"/>
  <line x1="880" y1="120" x2="902" y2="128" stroke="#333" stroke-width="5"/>'''
    else:  # cowork
        body += '''
  <rect x="60" y="140" width="240" height="18" rx="6" fill="url(#woodGrad)"/>
  <rect x="80" y="90" width="34" height="52" rx="4" fill="#c46a5a"/>
  <rect x="120" y="100" width="34" height="42" rx="4" fill="#5a8ac4"/>
  <rect x="160" y="86" width="34" height="56" rx="4" fill="#7fae7a"/>
  <rect x="60" y="300" width="240" height="18" rx="6" fill="url(#woodGrad)"/>
  <circle cx="150" cy="275" r="24" fill="#7fae7a"/>
  <rect x="140" y="290" width="20" height="12" fill="#8a6238" stroke="none"/>'''
    if level >= 1:
        body += '''
  <ellipse cx="500" cy="860" rx="330" ry="60" fill="#000000" opacity="0.10" stroke="none"/>
  <rect x="180" y="790" width="640" height="130" rx="14" fill="#3d5a80" opacity="0.55"/>
  <circle cx="500" cy="110" r="40" fill="#fff8d8" opacity="0.85" stroke="none"/>'''
    return svg(body, texts=label(f'{kind} · lvl {level}'))


# ---------------------------------------------------------------- city view
def office_city(variant):
    skies = {'spalnik': '#b8c7d8', 'center': '#a9c6e0', 'city': '#8fb3d9', 'neon': '#2b2f4a'}
    sky = skies[variant]
    builds = ''
    if variant == 'spalnik':
        builds = '''
  <rect x="620" y="190" width="90" height="140" fill="#8d99a8"/>
  <rect x="720" y="160" width="110" height="170" fill="#7d8a9c"/>
  <rect x="840" y="210" width="80" height="120" fill="#8d99a8"/>'''
    elif variant == 'center':
        builds = '''
  <rect x="610" y="150" width="70" height="180" fill="#7d8a9c"/>
  <rect x="690" y="110" width="90" height="220" fill="#6d7a8c"/>
  <rect x="790" y="170" width="120" height="160" fill="#7d8a9c"/>
  <circle cx="880" cy="130" r="14" fill="#ffe08a" stroke="none"/>'''
    elif variant == 'city':
        builds = '''
  <rect x="600" y="90" width="60" height="240" fill="#5d6b7d"/>
  <rect x="670" y="130" width="80" height="200" fill="#6d7a8c"/>
  <rect x="760" y="70" width="70" height="260" fill="#525f70"/>
  <rect x="840" y="140" width="70" height="190" fill="#6d7a8c"/>'''
    else:  # neon
        builds = '''
  <rect x="600" y="120" width="70" height="210" fill="#1f2440"/>
  <rect x="680" y="90" width="80" height="240" fill="#232847"/>
  <rect x="770" y="140" width="90" height="190" fill="#1f2440"/>
  <rect x="610" y="150" width="50" height="10" fill="#e879f9" stroke="none"/>
  <rect x="690" y="130" width="60" height="10" fill="#38bdf8" stroke="none"/>
  <rect x="780" y="180" width="70" height="10" fill="#f0abfc" stroke="none"/>
  <circle cx="880" cy="120" r="18" fill="#f5f0dc" stroke="none"/>'''
    body = f'''
  <rect x="560" y="70" width="400" height="290" rx="8" fill="url(#glassGrad)"/>
  <rect x="560" y="70" width="400" height="290" rx="8" fill="{sky}" opacity="0.55"/>
  {builds}
  <line x1="760" y1="70" x2="760" y2="360" stroke="#5d6672" stroke-width="8"/>
  <line x1="560" y1="215" x2="960" y2="215" stroke="#5d6672" stroke-width="8"/>
  <rect x="540" y="360" width="440" height="18" rx="6" fill="url(#woodGrad)"/>'''
    return svg(body, shadows=shadow(760, 386, 200, 10), texts=label(f'view · {variant}', 760, 950))


# ---------------------------------------------------------------- boards
def office_board(variant):
    inner = ''
    if variant == 'kanban':
        inner = '''
  <rect x="95" y="170" width="100" height="200" rx="6" fill="#dfe7f2"/>
  <rect x="210" y="170" width="100" height="200" rx="6" fill="#dfe7f2"/>
  <rect x="325" y="170" width="100" height="200" rx="6" fill="#dfe7f2"/>
  <rect x="103" y="185" width="84" height="44" rx="4" fill="#f4d35e" stroke="none"/>
  <rect x="103" y="238" width="84" height="44" rx="4" fill="#ee964b" stroke="none"/>
  <rect x="218" y="185" width="84" height="44" rx="4" fill="#5a8ac4" stroke="none"/>
  <rect x="333" y="185" width="84" height="44" rx="4" fill="#7fae7a" stroke="none"/>'''
    elif variant == 'sprint':
        inner = '''
  <line x1="100" y1="180" x2="100" y2="360" stroke="#5d6672" stroke-width="4"/>
  <line x1="100" y1="360" x2="420" y2="360" stroke="#5d6672" stroke-width="4"/>
  <path d="M100 190 L200 230 L300 250 L420 330" fill="none" stroke="#c45a5a" stroke-width="6"/>
  <path d="M100 190 L420 330" fill="none" stroke="#7fae7a" stroke-width="4" stroke-dasharray="10 8"/>'''
    elif variant == 'arch':
        inner = '''
  <rect x="100" y="180" width="90" height="60" rx="6" fill="#dfe7f2"/>
  <rect x="210" y="180" width="90" height="60" rx="6" fill="#dfe7f2"/>
  <rect x="320" y="180" width="90" height="60" rx="6" fill="#dfe7f2"/>
  <rect x="155" y="280" width="200" height="60" rx="6" fill="#f4d35e"/>
  <line x1="145" y1="240" x2="200" y2="280" stroke="#5d6672" stroke-width="4"/>
  <line x1="365" y1="240" x2="310" y2="280" stroke="#5d6672" stroke-width="4"/>'''
    else:  # motivate
        inner = '''
  <text x="260" y="270" font-family="monospace" font-size="64" font-weight="bold"
    fill="#c45a5a" text-anchor="middle" stroke="none">SHIP IT!</text>
  <text x="260" y="330" font-family="monospace" font-size="28"
    fill="#5d6672" text-anchor="middle" stroke="none">deploy friday 18:00</text>'''
    body = f'''
  <rect x="70" y="130" width="380" height="300" rx="10" fill="#f5f7fa"/>
  <rect x="70" y="130" width="380" height="300" rx="10" fill="none" stroke-width="8"/>
  {inner}'''
    return svg(body, shadows=shadow(260, 446, 180, 10), texts=label(f'board · {variant}', 260, 950))


# ---------------------------------------------------------------- team desks
def office_team(variant):
    if variant == 'row':
        body = '''
  <rect x="100" y="560" width="800" height="26" rx="8" fill="url(#woodGrad)"/>
  <rect x="140" y="586" width="24" height="110" fill="#6d5638"/>
  <rect x="836" y="586" width="24" height="110" fill="#6d5638"/>
  <rect x="200" y="470" width="110" height="80" rx="6" fill="#2b3342"/>
  <rect x="380" y="470" width="110" height="80" rx="6" fill="#2b3342"/>
  <rect x="560" y="470" width="110" height="80" rx="6" fill="#2b3342"/>
  <rect x="245" y="550" width="20" height="12" fill="#3a4356" stroke="none"/>
  <rect x="425" y="550" width="20" height="12" fill="#3a4356" stroke="none"/>
  <rect x="605" y="550" width="20" height="12" fill="#3a4356" stroke="none"/>'''
    elif variant == 'island':
        body = '''
  <rect x="120" y="540" width="340" height="26" rx="8" fill="url(#woodGrad)"/>
  <rect x="540" y="540" width="340" height="26" rx="8" fill="url(#woodGrad)"/>
  <rect x="150" y="566" width="24" height="120" fill="#6d5638"/>
  <rect x="406" y="566" width="24" height="120" fill="#6d5638"/>
  <rect x="570" y="566" width="24" height="120" fill="#6d5638"/>
  <rect x="826" y="566" width="24" height="120" fill="#6d5638"/>
  <rect x="190" y="450" width="110" height="80" rx="6" fill="#2b3342"/>
  <rect x="610" y="450" width="110" height="80" rx="6" fill="#2b3342"/>
  <rect x="730" y="450" width="110" height="80" rx="6" fill="#2b3342"/>'''
    else:  # cubes
        body = '''
  <rect x="120" y="420" width="240" height="240" rx="6" fill="#9aa3b2" opacity="0.85"/>
  <rect x="380" y="420" width="240" height="240" rx="6" fill="#9aa3b2" opacity="0.85"/>
  <rect x="640" y="420" width="240" height="240" rx="6" fill="#9aa3b2" opacity="0.85"/>
  <rect x="160" y="560" width="160" height="20" rx="6" fill="url(#woodGrad)"/>
  <rect x="420" y="560" width="160" height="20" rx="6" fill="url(#woodGrad)"/>
  <rect x="680" y="560" width="160" height="20" rx="6" fill="url(#woodGrad)"/>
  <rect x="200" y="480" width="80" height="66" rx="6" fill="#2b3342"/>
  <rect x="460" y="480" width="80" height="66" rx="6" fill="#2b3342"/>
  <rect x="720" y="480" width="80" height="66" rx="6" fill="#2b3342"/>'''
    return svg(body, shadows=shadow(500, 700, 380, 14), texts=label(f'team · {variant}'))


# ---------------------------------------------------------------- hero desk
def office_desk(level):
    if level == 0:
        body = '''
  <rect x="330" y="700" width="300" height="24" rx="8" fill="url(#woodGrad)"/>
  <rect x="350" y="724" width="22" height="150" fill="#6d5638"/>
  <rect x="588" y="724" width="22" height="150" fill="#6d5638"/>
  <rect x="400" y="620" width="130" height="72" rx="6" fill="#2b3342"/>
  <rect x="700" y="640" width="150" height="180" rx="8" fill="#c9ced6"/>
  <rect x="720" y="600" width="110" height="44" rx="6" fill="#aab2c0"/>
  <rect x="735" y="700" width="80" height="60" rx="4" fill="#8b93a3"/>
  <circle cx="480" cy="800" r="46" fill="#7a5c3e"/>
  <rect x="470" y="840" width="20" height="60" fill="#5d4630"/>'''
    elif level == 1:
        body = '''
  <rect x="330" y="690" width="420" height="26" rx="8" fill="url(#woodGrad)"/>
  <rect x="350" y="716" width="22" height="160" fill="#6d5638"/>
  <rect x="708" y="716" width="22" height="160" fill="#6d5638"/>
  <rect x="420" y="600" width="150" height="82" rx="6" fill="#2b3342"/>
  <rect x="590" y="640" width="110" height="50" rx="6" fill="#3a4356"/>
  <rect x="770" y="660" width="130" height="200" rx="8" fill="#7fae7a" opacity="0.7"/>'''
    elif level == 2:
        body = '''
  <rect x="330" y="680" width="520" height="26" rx="8" fill="url(#woodGrad)"/>
  <rect x="350" y="706" width="22" height="170" fill="#6d5638"/>
  <rect x="808" y="706" width="22" height="170" fill="#6d5638"/>
  <rect x="400" y="590" width="150" height="82" rx="6" fill="#2b3342"/>
  <rect x="565" y="590" width="150" height="82" rx="6" fill="#2b3342"/>
  <rect x="760" y="600" width="60" height="80" rx="6" fill="#8a5c3e"/>
  <circle cx="790" cy="580" r="34" fill="#7fae7a"/>'''
    elif level == 3:
        body = '''
  <rect x="300" y="670" width="620" height="28" rx="8" fill="url(#woodGrad)"/>
  <rect x="320" y="698" width="24" height="180" fill="#6d5638"/>
  <rect x="876" y="698" width="24" height="180" fill="#6d5638"/>
  <rect x="370" y="570" width="170" height="92" rx="6" fill="#2b3342"/>
  <rect x="555" y="570" width="170" height="92" rx="6" fill="#2b3342"/>
  <rect x="745" y="600" width="120" height="62" rx="6" fill="#3a4356"/>
  <rect x="300" y="730" width="180" height="140" rx="8" fill="#5d6672"/>'''
    else:
        body = '''
  <rect x="260" y="420" width="700" height="460" rx="10" fill="url(#glassGrad)" opacity="0.35"/>
  <line x1="610" y1="420" x2="610" y2="880" stroke="#8b93a3" stroke-width="6"/>
  <rect x="330" y="680" width="560" height="28" rx="8" fill="#4a3b2c"/>
  <rect x="350" y="708" width="24" height="170" fill="#3a2f24"/>
  <rect x="846" y="708" width="24" height="170" fill="#3a2f24"/>
  <rect x="420" y="580" width="180" height="92" rx="6" fill="#1f2532"/>
  <rect x="620" y="580" width="180" height="92" rx="6" fill="#1f2532"/>
  <rect x="880" y="470" width="50" height="380" rx="8" fill="#6d7a8c"/>'''
    names = ['stool by printer', 'corner desk', 'desk by window', 'senior battlestation', 'glass cabinet']
    return svg(body, shadows=shadow(610, 890, 300, 14), texts=label(f'my desk · {names[level]}', 610, 950))


# ---------------------------------------------------------------- desk micro
def office_micro(variant):
    parts = {
        'none': '',
        'photo': '<rect x="700" y="540" width="70" height="70" rx="6" fill="#dfe7f2"/><circle cx="735" cy="568" r="14" fill="#8b93a3" stroke="none"/><rect x="712" y="586" width="46" height="16" rx="6" fill="#8b93a3" stroke="none"/>',
        'figure': '<circle cx="735" cy="560" r="20" fill="#e879f9"/><rect x="715" y="578" width="40" height="34" rx="8" fill="#a21caf" stroke="none"/>',
        'mug': '<rect x="705" y="556" width="44" height="56" rx="8" fill="#c45a5a"/><rect x="749" y="566" width="18" height="30" rx="8" fill="none"/>',
        'cactus': '<rect x="710" y="580" width="50" height="32" rx="6" fill="#8a5c3e"/><rect x="726" y="536" width="18" height="48" rx="9" fill="#4e8a4e" stroke="none"/><circle cx="735" cy="536" r="7" fill="#e879f9" stroke="none"/>',
        'award': '<rect x="715" y="536" width="40" height="44" rx="6" fill="#f4d35e"/><rect x="705" y="580" width="60" height="32" rx="4" fill="#6d5638"/><circle cx="735" cy="556" r="10" fill="#fff" stroke="none"/>',
        'duck': '<ellipse cx="735" cy="592" rx="30" ry="20" fill="#f4d35e"/><circle cx="752" cy="572" r="14" fill="#f4d35e"/><circle cx="756" cy="570" r="3" fill="#222" stroke="none"/><path d="M764 574 l14 4 -14 4 Z" fill="#ee964b" stroke="none"/>',
    }
    return svg(parts[variant], texts=label(f'micro · {variant}', 735, 950) if variant != 'none' else '')


# ---------------------------------------------------------------- colleagues
def office_colleague(variant):
    if variant == 'none':
        return empty()
    cfg = {
        'lead': ('#3d5a80', '#2b3f5c', 'M440 470 h120 v150 h-120 Z', 'suit'),
        'mentor': ('#5a6e4e', '#42523a', 'M440 470 h120 v150 h-120 Z', 'hoodie'),
        'toxic': ('#8a4e4e', '#633838', 'M440 470 h120 v150 h-120 Z', 'grumpy'),
        'hr': ('#7a5a8a', '#5c4468', 'M445 470 h110 v160 h-110 Z', 'dress'),
        'junior': ('#4e8a8a', '#386464', 'M445 470 h110 v150 h-110 Z', 'cap'),
    }[variant]
    shirt, shade, torso, extra = cfg
    extras = {
        'suit': '<rect x="492" y="470" width="16" height="70" fill="#c45a5a" stroke="none"/>',
        'hoodie': '<circle cx="500" cy="400" r="46" fill="none"/><rect x="462" y="430" width="76" height="26" rx="12" fill="#42523a" stroke="none"/>',
        'grumpy': '<line x1="480" y1="410" x2="520" y2="420" stroke="#222" stroke-width="5"/><line x1="470" y1="520" x2="530" y2="520" stroke="#222" stroke-width="10"/>',
        'dress': '<circle cx="500" cy="398" r="40" fill="none"/><rect x="470" y="620" width="60" height="20" rx="8" fill="#5c4468" stroke="none"/>',
        'cap': '<rect x="458" y="368" width="84" height="22" rx="10" fill="#ee964b"/><rect x="530" y="380" width="36" height="12" rx="6" fill="#ee964b" stroke="none"/>',
    }
    body = f'''
  <ellipse cx="500" cy="770" rx="70" ry="16" fill="#000000" opacity="0.15" stroke="none"/>
  <rect x="472" y="620" width="24" height="140" fill="#3a4356"/>
  <rect x="504" y="620" width="24" height="140" fill="#3a4356"/>
  <path d="{torso}" fill="{shirt}"/>
  <rect x="440" y="470" width="120" height="150" fill="{shade}" opacity="0.25" stroke="none"/>
  <circle cx="500" cy="410" r="44" fill="#b9b0a4"/>
  <circle cx="486" cy="406" r="5" fill="#222" stroke="none"/>
  <circle cx="514" cy="406" r="5" fill="#222" stroke="none"/>
  <path d="M488 428 Q500 436 512 428" fill="none" stroke="#222" stroke-width="4"/>
  {extras[extra]}'''
    return svg(body, texts=label(variant, 500, 950))


# ---------------------------------------------------------------- coffee
def office_coffee(variant):
    if variant == 'cooler':
        body = '''
  <rect x="90" y="640" width="110" height="180" rx="10" fill="#dfe7f2"/>
  <rect x="105" y="560" width="80" height="90" rx="14" fill="url(#glassGrad)"/>
  <rect x="120" y="700" width="50" height="40" rx="6" fill="#8b93a3"/>
  <circle cx="145" cy="690" r="8" fill="#c45a5a" stroke="none"/>
  <circle cx="145" cy="720" r="8" fill="#5a8ac4" stroke="none"/>'''
    elif variant == 'machine':
        body = '''
  <rect x="80" y="600" width="130" height="220" rx="12" fill="#3a4356"/>
  <rect x="100" y="630" width="90" height="60" rx="6" fill="#1f2532"/>
  <circle cx="145" cy="660" r="12" fill="#7fae7a" stroke="none"/>
  <rect x="115" y="720" width="60" height="44" rx="6" fill="#c9ced6"/>
  <rect x="60" y="820" width="170" height="20" rx="8" fill="url(#woodGrad)"/>'''
    else:  # juice friday
        body = '''
  <rect x="80" y="580" width="130" height="240" rx="12" fill="#ee964b"/>
  <rect x="95" y="600" width="100" height="120" rx="8" fill="url(#glassGrad)"/>
  <rect x="105" y="640" width="80" height="70" rx="6" fill="#f4a53e" stroke="none"/>
  <text x="145" y="780" font-family="monospace" font-size="30" fill="#fff" text-anchor="middle" stroke="none">FRI</text>'''
    return svg(body, shadows=shadow(145, 836, 90, 10), texts=label(f'coffee · {variant}', 145, 950))


# ---------------------------------------------------------------- mood
def office_mood(variant):
    if variant == 'none':
        return empty()
    if variant == 'deadline':
        return svg(
            '<rect x="0" y="0" width="1000" height="1000" fill="#c42b2b" opacity="0.10" stroke="none"/>'
            '<rect x="0" y="0" width="1000" height="90" fill="#c42b2b" opacity="0.55" stroke="none"/>'
            '<text x="500" y="62" font-family="monospace" font-size="44" font-weight="bold" '
            'fill="#fff" text-anchor="middle" stroke="none">DEADLINE</text>',
            texts='')
    if variant == 'friday':
        dots = ''.join(
            f'<circle cx="{70 + (i * 173) % 860}" cy="{80 + (i * 137) % 840}" r="12" '
            f'fill="{["#e879f9", "#38bdf8", "#f4d35e", "#7fae7a"][i % 4]}" stroke="none"/>'
            for i in range(20))
        return svg(dots, texts='')
    if variant == 'night':
        return svg(
            '<rect x="0" y="0" width="1000" height="1000" fill="#0d1530" opacity="0.45" stroke="none"/>'
            '<circle cx="860" cy="150" r="46" fill="#f5f0dc" stroke="none"/>'
            '<rect x="470" y="590" width="150" height="82" rx="6" fill="#bfe3ff" opacity="0.8" stroke="none"/>',
            texts='')
    # retro
    return svg(
        '<rect x="0" y="0" width="1000" height="1000" fill="#f4d35e" opacity="0.10" stroke="none"/>'
        '<rect x="330" y="120" width="340" height="90" rx="16" fill="#fff" opacity="0.85" stroke="none"/>'
        '<text x="500" y="178" font-family="monospace" font-size="36" '
        'fill="#5d6672" text-anchor="middle" stroke="none">RETRO ☕</text>',
        texts='')


def main():
    kinds = [('garage', 'garage'), ('product', 'product'), ('corp', 'corp'), ('cowork', 'cowork')]
    for kind, _ in kinds:
        for lvl in (0, 1):
            write(f'office/obg/obg_{kind}_{lvl}.svg', office_bg(kind, lvl))
    for v in ['spalnik', 'center', 'city', 'neon']:
        write(f'office/ocity/ocity_{v}.svg', office_city(v))
    for v in ['kanban', 'sprint', 'arch', 'motivate']:
        write(f'office/oboard/oboard_{v}.svg', office_board(v))
    for v in ['row', 'island', 'cubes']:
        write(f'office/oteam/oteam_{v}.svg', office_team(v))
    for lvl in range(5):
        write(f'office/odesk/odesk_{lvl}.svg', office_desk(lvl))
    for v in ['none', 'photo', 'figure', 'mug', 'cactus', 'award', 'duck']:
        write(f'office/omicro/omicro_{v}.svg', office_micro(v))
    for v in ['none', 'lead', 'mentor', 'toxic', 'hr', 'junior']:
        write(f'office/colleague/{v}.svg', office_colleague(v))
    for v in ['cooler', 'machine', 'juice']:
        write(f'office/ocoffee/ocoffee_{v}.svg', office_coffee(v))
    for v in ['none', 'deadline', 'friday', 'night', 'retro']:
        write(f'office/omood/omood_{v}.svg', office_mood(v))
    print(f'✓ generated office assets into {OUT}/office')


if __name__ == '__main__':
    main()
