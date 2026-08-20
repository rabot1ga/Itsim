#!/usr/bin/env python3
"""
Placeholder layer asset generator (DESIGN.md section 2/4) — v2.

Generates flat-cartoon SVG layers for the avatar and the room into
packages/client/public/layers/. The pipeline mirrors a generative NFT
collection: one file per layer, fixed canvas, stacking z-order,
grayscale bases + CSS tinting.

v2 style upgrades:
- consistent dark outline (cartoon look) around all shapes
- gradients (wall/floor/wood/glass/skin/hair)
- soft drop shadows under furniture, pets and the avatar
- more variants: 11 new layers (2 hair, 1 top, 1 accessory,
  1 window, 2 decor, 1 setup, 2 atmosphere, 2 pets)

The artist replaces files in place (same names/convention,
see public/layers/CREDITS.md). Usage: python3 tools/generate_layer_assets.py
"""
import math
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'packages', 'client', 'public', 'layers')

OUTLINE = '#1e2430'

DEFS = '''<defs>
  <linearGradient id="skinGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#969696"/><stop offset="1" stop-color="#767676"/>
  </linearGradient>
  <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5c5c5c"/><stop offset="1" stop-color="#3c3c3c"/>
  </linearGradient>
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


def svg(w, h, body, shadows='', texts=''):
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
        '{defs}{shadows}'
        '<g stroke="{o}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">{body}</g>'
        '{texts}'
        '</svg>'
    ).format(w=w, h=h, defs=DEFS, shadows=shadows, body=body, texts=texts, o=OUTLINE)


def write(rel, content):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)


def shadow(cx, cy, rx, ry, opacity=0.14):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#000000" opacity="{opacity}" stroke="none"/>'


# ---------------------------------------------------------------- avatar 500x500
# Anchor points: head center (250,160) r=70, torso 175..325 x 235..470,
# feet baseline y=470. Grayscale layers: body/hair/beard (tintable).
A = 500

SKIN = 'url(#skinGrad)'
SKIN_SHADE = '#6a6a6a'
HAIR = 'url(#hairGrad)'
HAIR_SHADE = '#333333'


def avatar_body():
    body = f'''
  <!-- neck -->
  <rect x="227" y="215" width="46" height="45" fill="{SKIN_SHADE}" rx="10"/>
  <!-- head -->
  <circle cx="250" cy="160" r="70" fill="{SKIN}"/>
  <!-- ears -->
  <circle cx="180" cy="162" r="14" fill="{SKIN}"/>
  <circle cx="320" cy="162" r="14" fill="{SKIN}"/>
  <!-- brows -->
  <path d="M204 132 Q220 126 236 132" stroke="#4a4f58" stroke-width="7" fill="none"/>
  <path d="M264 132 Q280 126 296 132" stroke="#4a4f58" stroke-width="7" fill="none"/>
  <!-- nose -->
  <path d="M246 176 Q250 182 254 176" stroke="#5a5f68" stroke-width="5" fill="none"/>
  <!-- smile -->
  <path d="M232 194 Q250 204 268 194" stroke="#5a5f68" stroke-width="5" fill="none"/>
  <!-- torso -->
  <rect x="165" y="252" width="170" height="218" rx="42" fill="{SKIN}"/>
  <!-- arms -->
  <rect x="120" y="262" width="52" height="190" rx="26" fill="{SKIN_SHADE}"/>
  <rect x="328" y="262" width="52" height="190" rx="26" fill="{SKIN_SHADE}"/>
  <!-- hands -->
  <circle cx="146" cy="460" r="20" fill="{SKIN}"/>
  <circle cx="354" cy="460" r="20" fill="{SKIN}"/>'''
    return svg(A, A, body)


def avatar_eyes(variant):
    common = ''
    if variant == 'eye_normal':
        common = '''
  <ellipse cx="220" cy="160" rx="14" ry="16" fill="#ffffff"/>
  <ellipse cx="280" cy="160" rx="14" ry="16" fill="#ffffff"/>
  <circle cx="222" cy="162" r="6" fill="#20242a" stroke="none"/>
  <circle cx="278" cy="162" r="6" fill="#20242a" stroke="none"/>
  <circle cx="224" cy="159" r="2" fill="#ffffff" stroke="none"/>
  <circle cx="280" cy="159" r="2" fill="#ffffff" stroke="none"/>'''
    elif variant == 'eye_tired':
        common = '''
  <ellipse cx="220" cy="160" rx="14" ry="12" fill="#ffffff"/>
  <ellipse cx="280" cy="160" rx="14" ry="12" fill="#ffffff"/>
  <circle cx="222" cy="162" r="5" fill="#20242a" stroke="none"/>
  <circle cx="278" cy="162" r="5" fill="#20242a" stroke="none"/>
  <rect x="204" y="150" width="32" height="8" rx="4" fill="#8a8a8a"/>
  <rect x="264" y="150" width="32" height="8" rx="4" fill="#8a8a8a"/>'''
    elif variant == 'eye_closed':
        common = '''
  <path d="M206 162 Q220 150 234 162" stroke="#20242a" stroke-width="5" fill="none"/>
  <path d="M266 162 Q280 150 294 162" stroke="#20242a" stroke-width="5" fill="none"/>'''
    elif variant == 'eye_vr':
        common = '''
  <rect x="196" y="146" width="108" height="34" rx="12" fill="#20242a"/>
  <circle cx="228" cy="163" r="8" fill="#19d3ff" stroke="none"/>
  <circle cx="272" cy="163" r="8" fill="#19d3ff" stroke="none"/>'''
    elif variant == 'eye_red':
        common = '''
  <ellipse cx="220" cy="160" rx="14" ry="16" fill="#ffffff"/>
  <ellipse cx="280" cy="160" rx="14" ry="16" fill="#ffffff"/>
  <circle cx="222" cy="162" r="6" fill="#c0392b" stroke="none"/>
  <circle cx="278" cy="162" r="6" fill="#c0392b" stroke="none"/>
  <path d="M206 154 L234 154 M266 154 L294 154" stroke="#c0392b" stroke-width="3"/>'''
    elif variant == 'eye_legendary':
        common = '''
  <circle cx="250" cy="160" r="52" fill="#ffd166" opacity="0.18" stroke="none"/>
  <ellipse cx="220" cy="160" rx="14" ry="16" fill="#fff7e0"/>
  <ellipse cx="280" cy="160" rx="14" ry="16" fill="#fff7e0"/>
  <circle cx="222" cy="162" r="6" fill="#ffb703" stroke="none"/>
  <circle cx="278" cy="162" r="6" fill="#ffb703" stroke="none"/>
  <circle cx="222" cy="162" r="11" fill="#ffb703" opacity="0.35" stroke="none"/>
  <circle cx="278" cy="162" r="11" fill="#ffb703" opacity="0.35" stroke="none"/>'''
    return svg(A, A, common)


def avatar_hair(variant):
    h = ''
    if variant == 'hair_buzzcut':
        h = f'''
  <path d="M180 148 Q185 92 250 88 Q315 92 320 148 Q300 122 250 120 Q200 122 180 148 Z" fill="{HAIR}"/>'''
    elif variant == 'hair_short':
        h = f'''
  <path d="M178 152 Q182 82 250 78 Q318 82 322 152 Q300 112 250 110 Q200 112 178 152 Z" fill="{HAIR}"/>
  <path d="M178 152 Q200 118 250 116 Q300 118 322 152 L322 148 Q300 108 250 106 Q200 108 178 148 Z" fill="{HAIR_SHADE}" opacity="0.6"/>'''
    elif variant == 'hair_messy':
        h = f'''
  <path d="M178 150 Q175 100 210 92 Q200 70 240 74 Q235 60 260 78 Q290 62 300 92 Q330 100 322 150 Q300 118 250 116 Q200 118 178 150 Z" fill="{HAIR}"/>'''
    elif variant == 'hair_long':
        h = f'''
  <path d="M178 152 Q182 82 250 78 Q318 82 322 152 Q330 210 322 300 Q315 330 300 300 Q292 240 250 235 Q208 240 200 300 Q185 330 178 300 Q170 210 178 152 Z" fill="{HAIR}"/>
  <path d="M178 152 Q200 108 250 104 Q300 108 322 152 Q300 112 250 110 Q200 112 178 152 Z" fill="{HAIR_SHADE}" opacity="0.6"/>'''
    elif variant == 'hair_bald':
        return svg(A, A, '<!-- bald: no hair layer -->')
    elif variant == 'hair_manbun':
        h = f'''
  <path d="M178 152 Q182 84 250 80 Q318 84 322 152 Q300 114 250 112 Q200 114 178 152 Z" fill="{HAIR}"/>
  <circle cx="250" cy="58" r="24" fill="{HAIR}"/>
  <circle cx="250" cy="58" r="12" fill="{HAIR_SHADE}" stroke="none"/>'''
    elif variant == 'hair_curly':
        circles = ''.join(
            f'<circle cx="{250 + 40 * math.cos(i * 0.9)}" cy="{95 + 30 * math.sin(i * 0.9)}" r="22" fill="{HAIR}"/>'
            for i in range(9))
        h = f'''
  <path d="M178 152 Q182 96 250 92 Q318 96 322 152 Q300 120 250 118 Q200 120 178 152 Z" fill="{HAIR}"/>
  {circles}'''
    elif variant == 'hair_undercut':
        h = f'''
  <rect x="178" y="96" width="22" height="66" rx="10" fill="{HAIR_SHADE}"/>
  <rect x="300" y="96" width="22" height="66" rx="10" fill="{HAIR_SHADE}"/>
  <path d="M178 152 Q182 88 250 84 Q318 88 322 152 Q300 112 250 110 Q200 112 178 152 Z" fill="{HAIR}"/>'''
    elif variant == 'hair_spiky':
        h = f'''
  <path d="M178 152 Q180 120 200 116 L212 88 L228 110 L242 74 L258 108 L274 82 L288 112 Q318 116 322 152 Q300 118 250 116 Q200 118 178 152 Z" fill="{HAIR}"/>'''
    elif variant == 'hair_ponytail':
        h = f'''
  <path d="M178 152 Q182 84 250 80 Q318 84 322 152 Q300 114 250 112 Q200 114 178 152 Z" fill="{HAIR}"/>
  <path d="M322 140 Q372 150 368 230 Q366 270 350 280 Q352 230 330 180 Q316 152 322 140 Z" fill="{HAIR}"/>
  <circle cx="372" cy="238" r="10" fill="#e05656" stroke="none"/>
  <circle cx="372" cy="238" r="4" fill="#ffffff" stroke="none"/>'''
    return svg(A, A, h)


def avatar_beard(variant):
    b = ''
    if variant == 'beard_none':
        return svg(A, A, '<!-- no beard -->')
    elif variant == 'beard_stubble':
        b = f'''
  <path d="M190 190 Q195 205 205 216 Q250 232 295 216 Q305 205 310 190 Q280 212 250 214 Q220 212 190 190 Z" fill="{HAIR}" opacity="0.35"/>'''
    elif variant == 'beard_goatee':
        b = f'''
  <path d="M236 196 Q244 218 250 224 Q256 218 264 196 Q250 204 236 196 Z" fill="{HAIR}"/>
  <path d="M222 178 Q236 170 250 176 Q264 170 278 178" stroke="{HAIR_SHADE}" stroke-width="7" fill="none"/>'''
    elif variant == 'beard_full':
        b = f'''
  <path d="M182 176 Q178 210 200 240 Q220 262 250 266 Q280 262 300 240 Q322 210 318 176 Q296 190 250 192 Q204 190 182 176 Z" fill="{HAIR}"/>
  <circle cx="250" cy="180" r="13" fill="{SKIN}"/>'''
    elif variant == 'beard_mustache':
        b = f'''
  <path d="M212 182 Q224 170 236 182 Q250 178 264 182 Q276 170 288 182 Q270 196 250 196 Q230 196 212 182 Z" fill="{HAIR}"/>'''
    return svg(A, A, b)


def avatar_top(variant):
    hoodie = f'''
  <path d="M176 258 Q176 240 200 232 Q220 224 250 224 Q280 224 300 232 Q324 240 324 258 L328 452 Q328 478 296 478 L204 478 Q172 478 172 452 Z" fill="BASE"/>
  <path d="M200 232 Q250 210 300 232 Q280 244 250 246 Q220 244 200 232 Z" fill="HOOD" opacity="0.75"/>
  <path d="M244 300 L256 300 L253 318 L247 318 Z" fill="#3c414c"/>
  <path d="M172 452 L204 478 L296 478 L328 452 L318 460 L182 460 Z" fill="#000000" opacity="0.12"/>'''
    hoodie_ear = '''
  <path d="M214 236 L228 204 L244 234 Z" fill="#3c414c"/>
  <path d="M286 236 L272 204 L256 234 Z" fill="#3c414c"/>'''

    tops = {
        'top_hoodie_gray': hoodie.replace('BASE', '#7a7f88').replace('HOOD', '#8d929c'),
        'top_hoodie_localhost': hoodie.replace('BASE', '#30343c').replace('HOOD', '#3c414c'),
        'top_hoodie_corp': hoodie.replace('BASE', '#ff6b35').replace('HOOD', '#ff8c5c'),
        'top_hoodie_cat': hoodie_ear + hoodie.replace('BASE', '#4a5568').replace('HOOD', '#5c6a80'),
        'top_tshirt': '''
  <path d="M176 258 L160 300 Q158 400 168 460 L332 460 Q342 400 340 300 L324 258 Q304 244 280 250 Q250 232 220 250 Q196 244 176 258 Z" fill="#4f9d69"/>
  <path d="M250 232 L220 250 Q250 244 280 250 Z" fill="#3f7d54"/>''',
        'top_shirt': '''
  <path d="M176 258 L164 292 Q160 400 170 460 L330 460 Q340 400 336 292 L324 258 Q304 244 280 250 Q250 232 220 250 Q196 244 176 258 Z" fill="#cfe0ee"/>
  <path d="M224 248 L250 268 L276 248 L266 240 L250 250 L234 240 Z" fill="#ffffff"/>
  <path d="M250 268 L250 460" stroke="#a9c2d6" stroke-width="6"/>
  <circle cx="250" cy="300" r="5" fill="#8fa9bd" stroke="none"/>
  <circle cx="250" cy="340" r="5" fill="#8fa9bd" stroke="none"/>
  <circle cx="250" cy="380" r="5" fill="#8fa9bd" stroke="none"/>''',
        'top_jacket': '''
  <path d="M176 258 Q176 240 200 232 Q220 224 250 224 Q280 224 300 232 Q324 240 324 258 L330 460 Q330 478 296 478 L204 478 Q170 478 170 460 L176 258 Z" fill="#5b4636"/>
  <path d="M250 258 L250 478" stroke="#3e2f23" stroke-width="8"/>
  <path d="M200 232 Q250 210 300 232 L282 258 Q250 242 218 258 Z" fill="#4a382b"/>
  <circle cx="250" cy="320" r="4" fill="#c9a227" stroke="none"/>
  <circle cx="250" cy="360" r="4" fill="#c9a227" stroke="none"/>''',
    }
    texts = ''
    if variant == 'top_hoodie_localhost':
        texts = '''
  <text x="250" y="366" font-family="monospace" font-size="30" fill="#4ade80" text-anchor="middle">localhost</text>
  <text x="250" y="396" font-family="monospace" font-size="16" fill="#64748b" text-anchor="middle">:3000</text>'''
    elif variant == 'top_hoodie_corp':
        texts = '''
  <text x="250" y="368" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle">C</text>'''
    elif variant == 'top_tshirt':
        texts = '''
  <text x="250" y="392" font-family="monospace" font-size="28" fill="#ffffff" text-anchor="middle">&lt;/&gt;</text>'''
    elif variant == 'top_hoodie_cat':
        texts = '''
  <text x="250" y="386" font-family="monospace" font-size="22" fill="#e2e8f0" text-anchor="middle">meow_dev</text>'''
    return svg(A, A, tops.get(variant, '<!-- none -->'), texts=texts)


def avatar_acc(variant):
    acc = {
        'acc_none': '<!-- no accessory -->',
        'acc_headphones': '''
  <path d="M190 150 Q190 90 250 86 Q310 90 310 150" stroke="#2f3542" stroke-width="16" fill="none"/>
  <rect x="172" y="142" width="40" height="62" rx="16" fill="#2f3542"/>
  <rect x="288" y="142" width="40" height="62" rx="16" fill="#2f3542"/>
  <rect x="180" y="150" width="24" height="46" rx="12" fill="#57606f"/>''',
        'acc_glasses': '''
  <circle cx="220" cy="160" r="26" fill="#ffffff" opacity="0.25"/>
  <circle cx="280" cy="160" r="26" fill="#ffffff" opacity="0.25"/>
  <circle cx="220" cy="160" r="26" fill="none" stroke="#2f3542" stroke-width="7"/>
  <circle cx="280" cy="160" r="26" fill="none" stroke="#2f3542" stroke-width="7"/>
  <path d="M246 158 L254 158" stroke="#2f3542" stroke-width="7"/>''',
        'acc_vr_headset': '''
  <rect x="196" y="140" width="108" height="48" rx="16" fill="#2f3542"/>
  <rect x="214" y="152" width="72" height="24" rx="10" fill="#0f1115"/>
  <circle cx="240" cy="164" r="5" fill="#19d3ff" stroke="none"/>
  <circle cx="260" cy="164" r="5" fill="#19d3ff" stroke="none"/>
  <path d="M170 150 Q196 130 250 128 Q304 130 330 150" stroke="#2f3542" stroke-width="12" fill="none"/>''',
        'acc_cap': '''
  <path d="M182 146 Q250 92 318 146 Q300 132 250 130 Q200 132 182 146 Z" fill="#d63031"/>
  <path d="M176 150 Q250 100 324 150 L324 158 Q250 140 176 158 Z" fill="#b0231f"/>
  <rect x="120" y="152" width="70" height="14" rx="7" fill="#b0231f"/>''',
        'acc_medal': '''
  <rect x="238" y="248" width="24" height="60" fill="#c9a227"/>
  <rect x="226" y="244" width="48" height="16" rx="4" fill="#e8b923"/>
  <circle cx="250" cy="340" r="26" fill="#ffd166"/>
  <circle cx="250" cy="340" r="20" fill="#f5b301"/>''',
        'acc_beanie': '''
  <path d="M180 150 Q182 92 250 88 Q318 92 320 150 L320 158 Q250 138 180 158 Z" fill="#3b82f6"/>
  <rect x="178" y="148" width="144" height="22" rx="11" fill="#2563eb"/>
  <circle cx="250" cy="84" r="12" fill="#93c5fd"/>''',
    }
    texts = ''
    if variant == 'acc_medal':
        texts = '''
  <text x="250" y="347" font-family="monospace" font-size="18" fill="#7a5c00" text-anchor="middle">1k</text>'''
    return svg(A, A, acc.get(variant, '<!-- none -->'), texts=texts)


# ---------------------------------------------------------------- room 1000x1000
R = 1000


def room_bg(level):
    floors = ['#4a4a4a', '#555555', '#5e5140', '#6b4f35', '#7d6a52']
    floor = floors[level]
    base = f'''
  <rect x="0" y="0" width="1000" height="700" fill="url(#wallGrad)"/>
  <rect x="0" y="0" width="1000" height="700" fill="#ffffff" opacity="0.06"/>
  <line x1="200" y1="0" x2="200" y2="700" stroke="#ffffff" stroke-width="2" opacity="0.05"/>
  <line x1="450" y1="0" x2="450" y2="700" stroke="#ffffff" stroke-width="2" opacity="0.05"/>
  <rect x="0" y="676" width="1000" height="24" fill="url(#steelGrad)"/>
  <rect x="0" y="700" width="1000" height="300" fill="url(#floorGrad)"/>
  <line x1="0" y1="760" x2="1000" y2="760" stroke="#000000" stroke-width="3" opacity="0.15"/>
  <line x1="0" y1="820" x2="1000" y2="820" stroke="#000000" stroke-width="3" opacity="0.15"/>
  <line x1="0" y1="880" x2="1000" y2="880" stroke="#000000" stroke-width="3" opacity="0.15"/>
  <line x1="0" y1="940" x2="1000" y2="940" stroke="#000000" stroke-width="3" opacity="0.15"/>
  <line x1="150" y1="730" x2="150" y2="980" stroke="#000000" stroke-width="3" opacity="0.10"/>
  <line x1="400" y1="730" x2="400" y2="980" stroke="#000000" stroke-width="3" opacity="0.10"/>
  <line x1="650" y1="730" x2="650" y2="980" stroke="#000000" stroke-width="3" opacity="0.10"/>
  <line x1="900" y1="730" x2="900" y2="980" stroke="#000000" stroke-width="3" opacity="0.10"/>'''
    extra = ''
    if level >= 2:
        extra += '''
  <rect x="120" y="760" width="300" height="180" rx="8" fill="#000000" opacity="0.12" stroke="none"/>'''
    if level >= 3:
        extra += '''
  <circle cx="500" cy="120" r="46" fill="#ffffff" opacity="0.25" stroke="none"/>
  <circle cx="500" cy="120" r="26" fill="#ffffff" opacity="0.5" stroke="none"/>'''
    if level >= 4:
        extra += '''
  <rect x="40" y="600" width="180" height="60" rx="10" fill="#000000" opacity="0.10"/>'''
    texts = ''
    if level >= 4:
        texts = '''
  <text x="130" y="640" font-family="monospace" font-size="26" fill="#ffffff" opacity="0.5" text-anchor="middle">16F</text>'''
    return svg(R, R, base + extra, texts=texts)


def room_window(variant):
    frame = '#5d6672'
    curtain_l = '''
  <path d="M540 90 Q520 200 540 470 L600 470 Q580 200 600 90 Z" fill="#8fa3c4"/>
  <path d="M600 90 Q620 200 600 470 L640 470 Q660 200 640 90 Z" fill="#7a90b4"/>'''
    curtain_r = '''
  <path d="M860 90 Q880 200 860 470 L920 470 Q940 200 920 90 Z" fill="#8fa3c4"/>
  <path d="M920 90 Q940 200 920 470 L980 470 Q1000 200 980 90 Z" fill="#7a90b4"/>'''
    rod = '<rect x="500" y="76" width="520" height="14" rx="7" fill="url(#steelGrad)"/>'

    w = ''
    if variant == 'window_square':
        w = f'''
  {rod}{curtain_l}{curtain_r}
  <rect x="600" y="120" width="320" height="340" rx="8" fill="url(#glassGrad)"/>
  <line x1="760" y1="120" x2="760" y2="460" stroke="{frame}" stroke-width="12"/>
  <line x1="600" y1="290" x2="920" y2="290" stroke="{frame}" stroke-width="12"/>
  <path d="M616 136 L740 250" stroke="#ffffff" stroke-width="10" opacity="0.5"/>
  <circle cx="850" cy="180" r="26" fill="#ffe9a8" stroke="none" opacity="0.9"/>
  <rect x="592" y="460" width="336" height="14" rx="4" fill="{frame}"/>'''
    elif variant == 'window_panoramic':
        w = f'''
  {rod}{curtain_l}{curtain_r}
  <rect x="520" y="120" width="420" height="300" rx="8" fill="url(#glassGrad)"/>
  <line x1="660" y1="120" x2="660" y2="420" stroke="{frame}" stroke-width="12"/>
  <line x1="800" y1="120" x2="800" y2="420" stroke="{frame}" stroke-width="12"/>
  <path d="M536 136 L650 250" stroke="#ffffff" stroke-width="10" opacity="0.5"/>
  <circle cx="880" cy="180" r="26" fill="#ffe9a8" stroke="none" opacity="0.9"/>
  <rect x="512" y="420" width="436" height="14" rx="4" fill="{frame}"/>'''
    elif variant == 'window_round':
        w = f'''
  {rod}{curtain_l}{curtain_r}
  <circle cx="760" cy="290" r="150" fill="url(#glassGrad)"/>
  <circle cx="760" cy="290" r="150" fill="none" stroke="{frame}" stroke-width="16"/>
  <line x1="760" y1="140" x2="760" y2="440" stroke="{frame}" stroke-width="12"/>
  <line x1="610" y1="290" x2="910" y2="290" stroke="{frame}" stroke-width="12"/>
  <path d="M640 200 L700 250" stroke="#ffffff" stroke-width="10" opacity="0.5"/>
  <circle cx="700" cy="240" r="22" fill="#ffe9a8" stroke="none" opacity="0.9"/>'''
    elif variant == 'window_arched':
        w = f'''
  {rod}{curtain_l}{curtain_r}
  <path d="M600 460 L600 260 Q600 120 760 120 Q920 120 920 260 L920 460 Z" fill="url(#glassGrad)"/>
  <path d="M600 460 L600 260 Q600 120 760 120 Q920 120 920 260 L920 460" fill="none" stroke="{frame}" stroke-width="16"/>
  <line x1="760" y1="120" x2="760" y2="460" stroke="{frame}" stroke-width="12"/>
  <path d="M620 150 L740 240" stroke="#ffffff" stroke-width="10" opacity="0.5"/>
  <circle cx="840" cy="200" r="24" fill="#ffe9a8" stroke="none" opacity="0.9"/>'''
    elif variant == 'window_blinds':
        w = f'''
  {rod}
  <rect x="600" y="120" width="320" height="340" rx="8" fill="url(#glassGrad)"/>
  <circle cx="700" cy="200" r="22" fill="#ffe9a8" stroke="none" opacity="0.85"/>
  <rect x="604" y="150" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="186" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="222" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="258" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="294" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="330" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="366" width="312" height="16" fill="#e8edf2"/>
  <rect x="604" y="402" width="312" height="16" fill="#e8edf2"/>
  <path d="M620 462 L700 380" stroke="#d6a53c" stroke-width="8"/>'''
    return svg(R, R, w)


def room_decor(variant):
    d = ''
    texts = ''
    if variant == 'decor_poster_js':
        d = '''
  <rect x="110" y="170" width="220" height="280" rx="6" fill="#f1c40f"/>
  <rect x="110" y="170" width="220" height="280" rx="6" fill="none" stroke="#3a3a3a" stroke-width="6"/>
  <rect x="104" y="164" width="232" height="16" rx="8" fill="#e0b90c"/>'''
        texts = '''
  <text x="220" y="330" font-family="sans-serif" font-size="110" font-weight="bold" fill="#20242a" text-anchor="middle">JS</text>
  <text x="220" y="400" font-family="monospace" font-size="26" fill="#20242a" text-anchor="middle">The Good Parts</text>'''
    elif variant == 'decor_neon':
        d = '''
  <rect x="90" y="170" width="260" height="230" rx="10" fill="#171b24" opacity="0.9"/>
  <rect x="90" y="170" width="260" height="230" rx="10" fill="none" stroke="#333b4d" stroke-width="5"/>'''
        texts = '''
  <text x="220" y="266" font-family="monospace" font-size="60" font-weight="bold" fill="#00e5ff" text-anchor="middle" style="filter:drop-shadow(0 0 14px #00e5ff)">WORK</text>
  <text x="220" y="348" font-family="monospace" font-size="60" font-weight="bold" fill="#ff2d78" text-anchor="middle" style="filter:drop-shadow(0 0 14px #ff2d78)">HARD</text>'''
    elif variant == 'decor_server':
        d = '''
  <rect x="110" y="210" width="230" height="260" rx="8" fill="#2b2f36"/>
  <rect x="130" y="230" width="190" height="40" rx="4" fill="#3a4049"/>
  <rect x="130" y="290" width="190" height="40" rx="4" fill="#3a4049"/>
  <rect x="130" y="350" width="190" height="40" rx="4" fill="#3a4049"/>
  <rect x="130" y="410" width="190" height="40" rx="4" fill="#3a4049"/>
  <circle cx="150" cy="250" r="6" fill="#4ade80" stroke="none"/>
  <circle cx="170" cy="310" r="6" fill="#4ade80" stroke="none"/>
  <circle cx="190" cy="370" r="6" fill="#f87171" stroke="none"/>
  <circle cx="150" cy="430" r="6" fill="#4ade80" stroke="none"/>'''
    elif variant == 'decor_books':
        colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22']
        d = '''
  <rect x="110" y="150" width="230" height="26" rx="4" fill="#6b4f35"/>'''
        for i, c in enumerate(colors):
            d += f'''
  <rect x="{118 + i * 30}" y="176" width="24" height="{150 - (i % 3) * 22}" rx="3" fill="{c}"/>'''
    elif variant == 'decor_whiteboard':
        d = '''
  <rect x="110" y="170" width="230" height="270" rx="8" fill="#f8fafc"/>
  <rect x="110" y="170" width="230" height="270" rx="8" fill="none" stroke="#cbd5e1" stroke-width="8"/>
  <path d="M140 230 L200 210 L240 250 L300 200" stroke="#2563eb" stroke-width="6" fill="none"/>
  <path d="M150 330 L190 300 L240 350 L300 300" stroke="#dc2626" stroke-width="6" fill="none"/>'''
        texts = '''
  <text x="150" y="290" font-family="monospace" font-size="24" fill="#64748b">legacy == pain</text>'''
    elif variant == 'decor_madlads_poster':
        d = '''
  <rect x="110" y="170" width="220" height="280" rx="8" fill="#111827"/>
  <rect x="110" y="170" width="220" height="280" rx="8" fill="none" stroke="#f59e0b" stroke-width="8"/>
  <circle cx="220" cy="280" r="70" fill="#f59e0b"/>
  <circle cx="196" cy="266" r="10" fill="#111827" stroke="none"/>
  <circle cx="244" cy="266" r="10" fill="#111827" stroke="none"/>
  <path d="M196 320 Q220 340 244 320" stroke="#111827" stroke-width="8" fill="none"/>'''
        texts = '''
  <text x="220" y="410" font-family="monospace" font-size="30" fill="#f59e0b" text-anchor="middle">MAD LAD</text>'''
    elif variant == 'decor_pirate_poster':
        d = '''
  <rect x="110" y="170" width="220" height="280" rx="8" fill="#0c1a2b"/>
  <rect x="110" y="170" width="220" height="280" rx="8" fill="none" stroke="#e8b923" stroke-width="8"/>
  <circle cx="220" cy="260" r="52" fill="#f5c542"/>
  <path d="M170 250 Q220 210 270 250 L258 220 L240 232 L220 200 L200 232 L182 220 Z" fill="#20242a"/>
  <circle cx="204" cy="256" r="7" fill="#20242a" stroke="none"/>
  <circle cx="236" cy="256" r="7" fill="#20242a" stroke="none"/>
  <rect x="204" y="290" width="32" height="60" fill="#e8b923"/>'''
        texts = '''
  <text x="220" y="410" font-family="monospace" font-size="30" fill="#e8b923" text-anchor="middle">SMB Gen2</text>'''
    elif variant == 'decor_clock':
        d = '''
  <circle cx="220" cy="310" r="110" fill="#141821"/>
  <circle cx="220" cy="310" r="110" fill="none" stroke="#00e5ff" stroke-width="8"/>
  <circle cx="220" cy="310" r="86" fill="none" stroke="#00e5ff" stroke-width="4" opacity="0.45"/>
  <path d="M220 240 L220 310 L262 334" stroke="#ffffff" stroke-width="10" fill="none"/>'''
        texts = '''
  <text x="220" y="452" font-family="monospace" font-size="24" fill="#00e5ff" text-anchor="middle" style="filter:drop-shadow(0 0 8px #00e5ff)">СПРИНТ</text>'''
    elif variant == 'decor_poster_python':
        d = '''
  <rect x="110" y="170" width="220" height="280" rx="6" fill="#1e3a5f"/>
  <rect x="110" y="170" width="220" height="280" rx="6" fill="none" stroke="#3a5a8c" stroke-width="6"/>
  <rect x="104" y="164" width="232" height="16" rx="8" fill="#163052"/>'''
        texts = '''
  <text x="220" y="330" font-family="sans-serif" font-size="100" font-weight="bold" fill="#ffd43b" text-anchor="middle">Py</text>
  <text x="220" y="400" font-family="monospace" font-size="26" fill="#9fc5e8" text-anchor="middle">import this</text>'''
    return svg(R, R, d, texts=texts)


def room_desk(variant):
    shadows = shadow(410, 740, 330, 26, 0.16)
    d = ''
    if variant == 'desk_parata':
        d = '''
  <rect x="90" y="640" width="640" height="26" rx="6" fill="url(#woodGrad)"/>
  <rect x="140" y="666" width="80" height="70" fill="#8a6238"/>
  <rect x="560" y="666" width="80" height="70" fill="#8a6238"/>
  <path d="M110 652 L150 652 M600 652 L700 652" stroke="#ffffff" stroke-width="3" opacity="0.25"/>'''
    elif variant == 'desk_ikea':
        d = '''
  <rect x="90" y="640" width="640" height="24" rx="6" fill="#d9d9d9"/>
  <rect x="120" y="664" width="14" height="72" fill="#8a8a8a"/>
  <rect x="690" y="664" width="14" height="72" fill="#8a8a8a"/>
  <rect x="110" y="736" width="34" height="8" rx="2" fill="#8a8a8a"/>
  <rect x="680" y="736" width="34" height="8" rx="2" fill="#8a8a8a"/>'''
    elif variant == 'desk_office':
        d = '''
  <rect x="90" y="640" width="640" height="26" rx="6" fill="url(#woodGrad)"/>
  <rect x="100" y="666" width="200" height="80" fill="#6b4a2f"/>
  <rect x="120" y="686" width="30" height="20" rx="3" fill="#e8b923"/>
  <rect x="120" y="714" width="30" height="20" rx="3" fill="#e8b923"/>
  <rect x="560" y="666" width="14" height="80" fill="#5c3f28"/>'''
    elif variant == 'desk_standing':
        d = '''
  <rect x="90" y="560" width="640" height="24" rx="6" fill="#cbd5e1"/>
  <rect x="350" y="584" width="60" height="152" fill="#64748b"/>
  <rect x="340" y="660" width="80" height="20" rx="4" fill="#475569"/>
  <rect x="260" y="584" width="16" height="152" fill="#94a3b8"/>
  <rect x="600" y="584" width="16" height="152" fill="#94a3b8"/>
  <rect x="130" y="600" width="120" height="20" rx="4" fill="#3b82f6"/>'''
    elif variant == 'desk_rgb':
        d = '''
  <rect x="90" y="640" width="640" height="26" rx="6" fill="#1e293b"/>
  <rect x="90" y="650" width="640" height="10" fill="#ff2d78" opacity="0.85"/>
  <rect x="120" y="666" width="14" height="70" fill="#0f172a"/>
  <rect x="690" y="666" width="14" height="70" fill="#0f172a"/>
  <rect x="640" y="690" width="150" height="56" rx="8" fill="#0f172a"/>
  <rect x="660" y="706" width="110" height="6" rx="3" fill="#00e5ff" opacity="0.9" stroke="none"/>'''
    return svg(R, R, d, shadows=shadows)


def room_chair(variant):
    shadows = shadow(642, 736, 90, 22, 0.16)
    c = ''
    if variant == 'chair_stool':
        c = '''
  <circle cx="640" cy="600" r="52" fill="url(#woodGrad)"/>
  <circle cx="640" cy="600" r="38" fill="#a8794f"/>
  <rect x="618" y="640" width="12" height="96" fill="#6b4a2f"/>
  <rect x="652" y="640" width="12" height="96" fill="#6b4a2f"/>'''
    elif variant == 'chair_office':
        c = '''
  <rect x="566" y="470" width="150" height="180" rx="26" fill="#2f3542"/>
  <rect x="590" y="486" width="102" height="140" rx="16" fill="#3d4452"/>
  <rect x="600" y="636" width="82" height="26" rx="10" fill="#2f3542"/>
  <rect x="632" y="662" width="18" height="40" fill="#57606f"/>
  <path d="M570 736 L710 736" stroke="#2f3542" stroke-width="14" stroke-linecap="round"/>
  <circle cx="588" cy="748" r="8" fill="#2f3542"/>
  <circle cx="692" cy="748" r="8" fill="#2f3542"/>'''
    elif variant == 'chair_gaming':
        c = '''
  <rect x="562" y="440" width="160" height="210" rx="34" fill="#c0392b"/>
  <rect x="586" y="462" width="112" height="150" rx="22" fill="#20242a"/>
  <circle cx="642" cy="500" r="16" fill="#e8b923"/>
  <rect x="600" y="636" width="84" height="26" rx="10" fill="#c0392b"/>
  <rect x="632" y="662" width="18" height="40" fill="#57606f"/>
  <path d="M570 736 L710 736" stroke="#20242a" stroke-width="14" stroke-linecap="round"/>
  <path d="M586 480 L698 600" stroke="#ffffff" stroke-width="5" opacity="0.2"/>'''
    elif variant == 'chair_herman_miller':
        c = '''
  <path d="M570 470 Q642 430 714 470 L714 600 Q642 636 570 600 Z" fill="url(#steelGrad)"/>
  <path d="M570 470 Q642 430 714 470" fill="none" stroke="#8b93a3" stroke-width="14"/>
  <path d="M586 494 L698 494 M586 524 L698 524 M586 554 L698 554" stroke="#20242a" stroke-width="8" opacity="0.55"/>
  <rect x="632" y="636" width="18" height="40" fill="#57606f"/>
  <path d="M570 736 L710 736" stroke="#3d4452" stroke-width="14" stroke-linecap="round"/>'''
    elif variant == 'chair_throne':
        c = '''
  <path d="M560 400 L720 400 L720 470 L680 470 L680 470 Q660 500 660 620 L620 620 L620 470 L560 470 Z" fill="#b8860b"/>
  <rect x="600" y="430" width="80" height="170" rx="12" fill="#8a2be2"/>
  <circle cx="600" cy="430" r="14" fill="#ffd700"/>
  <circle cx="680" cy="430" r="14" fill="#ffd700"/>
  <rect x="630" y="640" width="20" height="40" fill="#b8860b"/>
  <rect x="560" y="700" width="160" height="20" rx="8" fill="#8a2be2"/>'''
    return svg(R, R, c, shadows=shadows)


def room_setup(variant):
    shadows = shadow(500, 668, 260, 14, 0.12)
    s = ''
    if variant == 'setup_laptop':
        s = '''
  <path d="M400 640 L500 520 L640 520 L700 640 Z" fill="#20242a"/>
  <path d="M500 520 L640 520 L650 530 L490 530 Z" fill="#2f3542"/>
  <path d="M390 640 L710 640 L700 656 L400 656 Z" fill="#57606f"/>
  <path d="M440 540 L560 616" stroke="#4a90d9" stroke-width="3" opacity="0.5"/>'''
    elif variant == 'setup_monitor':
        s = '''
  <rect x="470" y="500" width="180" height="120" rx="8" fill="#20242a"/>
  <rect x="482" y="512" width="156" height="96" rx="4" fill="#1e293b"/>
  <rect x="484" y="514" width="60" height="24" rx="2" fill="#38bdf8" opacity="0.8" stroke="none"/>
  <rect x="550" y="620" width="20" height="40" fill="#2f3542"/>
  <rect x="500" y="660" width="120" height="10" rx="4" fill="#2f3542"/>'''
    elif variant == 'setup_dual':
        s = '''
  <rect x="420" y="510" width="160" height="110" rx="8" fill="#20242a"/>
  <rect x="430" y="520" width="140" height="90" rx="4" fill="#1e293b"/>
  <rect x="600" y="510" width="160" height="110" rx="8" fill="#20242a"/>
  <rect x="610" y="520" width="140" height="90" rx="4" fill="#312e81"/>
  <rect x="492" y="620" width="18" height="36" fill="#2f3542"/>
  <rect x="672" y="620" width="18" height="36" fill="#2f3542"/>'''
    elif variant == 'setup_gaming':
        s = '''
  <rect x="430" y="490" width="230" height="140" rx="14" fill="#20242a"/>
  <rect x="444" y="504" width="202" height="112" rx="8" fill="#120f1f"/>
  <rect x="460" y="520" width="70" height="30" rx="4" fill="#ff2d78" opacity="0.85" stroke="none"/>
  <rect x="560" y="530" width="60" height="20" rx="3" fill="#38bdf8" opacity="0.7" stroke="none"/>
  <rect x="520" y="630" width="26" height="36" fill="#2f3542"/>
  <rect x="700" y="640" width="150" height="240" rx="10" fill="#1e293b"/>
  <rect x="716" y="664" width="118" height="40" rx="4" fill="#00e5ff" opacity="0.85" stroke="none"/>
  <rect x="716" y="716" width="118" height="40" rx="4" fill="#a855f7" opacity="0.8" stroke="none"/>
  <rect x="716" y="768" width="118" height="40" rx="4" fill="#ff2d78" opacity="0.8" stroke="none"/>'''
    elif variant == 'setup_macbook':
        s = '''
  <path d="M430 640 L520 530 L620 530 L670 640 Z" fill="#d1d5db"/>
  <path d="M520 530 L620 530 L628 540 L512 540 Z" fill="#e5e7eb"/>
  <path d="M420 640 L680 640 L672 654 L428 654 Z" fill="#9ca3af"/>
  <path d="M452 540 L548 616" stroke="#374151" stroke-width="3" opacity="0.4"/>
  <circle cx="645" cy="648" r="4" fill="#6b7280" stroke="none"/>'''
    elif variant == 'setup_ultrawide':
        s = '''
  <path d="M400 500 Q555 460 710 500 L710 620 L400 620 Z" fill="#20242a"/>
  <path d="M416 510 Q555 476 694 510 L694 610 Q555 636 416 610 Z" fill="#16233b"/>
  <rect x="440" y="524" width="90" height="26" rx="3" fill="#38bdf8" opacity="0.75" stroke="none"/>
  <rect x="560" y="540" width="100" height="20" rx="3" fill="#818cf8" opacity="0.6" stroke="none"/>
  <rect x="545" y="620" width="22" height="40" fill="#2f3542"/>
  <rect x="490" y="660" width="130" height="12" rx="5" fill="#2f3542"/>'''
    return svg(R, R, s, shadows=shadows)


def room_plant(variant):
    p = ''
    shadows = ''
    if variant == 'atmo_plant':
        shadows = shadow(860, 662, 60, 12, 0.12)
        p = '''
  <path d="M820 620 Q800 520 860 470 Q920 520 900 620 Z" fill="#2e8b57"/>
  <path d="M860 620 Q840 540 900 500 Q950 540 930 620 Z" fill="#3cb371"/>
  <path d="M816 620 L904 620 L890 660 L830 660 Z" fill="#b5651d"/>'''
    elif variant == 'atmo_cactus':
        shadows = shadow(873, 662, 55, 12, 0.12)
        p = '''
  <rect x="850" y="470" width="46" height="150" rx="22" fill="#2e8b57"/>
  <rect x="838" y="500" width="30" height="18" rx="8" fill="#2e8b57"/>
  <rect x="878" y="520" width="30" height="18" rx="8" fill="#2e8b57"/>
  <rect x="846" y="520" width="30" height="18" rx="8" fill="#3cb371"/>
  <path d="M826 620 L920 620 L904 660 L842 660 Z" fill="#b5651d"/>'''
    elif variant == 'atmo_coffee':
        shadows = shadow(873, 622, 55, 10, 0.10)
        p = '''
  <rect x="838" y="540" width="70" height="80" rx="10" fill="#ffffff"/>
  <path d="M908 560 Q940 560 940 582 Q940 600 908 600" fill="none" stroke="#cbd5e1" stroke-width="8"/>
  <path d="M852 520 Q866 500 862 488 M880 520 Q894 502 888 490" stroke="#94a3b8" stroke-width="5" fill="none"/>'''
    elif variant == 'atmo_rug':
        shadows = shadow(430, 900, 260, 120, 0.08)
        p = '''
  <ellipse cx="430" cy="900" rx="260" ry="120" fill="#b56576"/>
  <ellipse cx="430" cy="900" rx="200" ry="90" fill="none" stroke="#e8d3d8" stroke-width="6"/>
  <ellipse cx="430" cy="900" rx="130" ry="58" fill="none" stroke="#e8d3d8" stroke-width="6"/>
  <ellipse cx="430" cy="900" rx="60" ry="26" fill="#e8d3d8" opacity="0.8"/>'''
    elif variant == 'atmo_lamp':
        shadows = shadow(160, 880, 60, 14, 0.14)
        p = '''
  <path d="M160 240 L120 620 L200 620 Z" fill="#f5d76e" opacity="0.35"/>
  <path d="M148 240 L120 620 L200 620 L172 240 Z" fill="url(#steelGrad)"/>
  <rect x="120" y="620" width="80" height="16" rx="8" fill="#475569"/>
  <rect x="146" y="200" width="28" height="44" rx="6" fill="#5d6672"/>
  <path d="M128 180 Q160 120 192 180 Z" fill="#ffd166"/>
  <circle cx="160" cy="150" r="14" fill="#fff3c4" opacity="0.9" stroke="none"/>'''
    return svg(R, R, p, shadows=shadows)


def room_pet(variant):
    p = ''
    shadows = ''
    if variant == 'pet_none':
        return svg(R, R, '<!-- no pet -->')
    elif variant == 'pet_cat':
        shadows = shadow(880, 724, 70, 16, 0.14)
        p = '''
  <ellipse cx="880" cy="700" rx="60" ry="40" fill="#f97316"/>
  <path d="M845 668 L835 620 L862 655 Z" fill="#f97316"/>
  <path d="M915 668 L925 620 L898 655 Z" fill="#f97316"/>
  <circle cx="865" cy="694" r="5" fill="#20242a" stroke="none"/>
  <circle cx="895" cy="694" r="5" fill="#20242a" stroke="none"/>
  <path d="M872 706 Q880 712 888 706" stroke="#20242a" stroke-width="3" fill="none"/>
  <rect x="860" y="712" width="40" height="12" rx="6" fill="#ef4444"/>
  <rect x="874" y="712" width="12" height="12" fill="#facc15" stroke="none"/>
  <path d="M920 700 Q950 690 945 660" stroke="#f97316" stroke-width="12" fill="none" stroke-linecap="round"/>'''
    elif variant == 'pet_dog':
        shadows = shadow(880, 726, 75, 16, 0.14)
        p = '''
  <ellipse cx="880" cy="700" rx="64" ry="42" fill="#8b5a2b"/>
  <ellipse cx="836" cy="676" rx="20" ry="28" fill="#8b5a2b" transform="rotate(-18 836 676)"/>
  <ellipse cx="924" cy="676" rx="20" ry="28" fill="#8b5a2b" transform="rotate(18 924 676)"/>
  <circle cx="862" cy="694" r="5" fill="#20242a" stroke="none"/>
  <circle cx="898" cy="694" r="5" fill="#20242a" stroke="none"/>
  <ellipse cx="880" cy="712" rx="14" ry="9" fill="#6b4226"/>
  <path d="M844 716 Q880 736 916 716 L916 700 Q880 722 844 700 Z" fill="#f5f5f0"/>
  <path d="M820 706 Q800 700 798 680" stroke="#8b5a2b" stroke-width="10" fill="none" stroke-linecap="round"/>'''
    elif variant == 'pet_cactus':
        shadows = shadow(880, 746, 55, 12, 0.12)
        p = '''
  <rect x="862" y="600" width="36" height="110" rx="18" fill="#2e8b57"/>
  <rect x="852" y="630" width="26" height="14" rx="6" fill="#2e8b57"/>
  <rect x="882" y="640" width="26" height="14" rx="6" fill="#2e8b57"/>
  <circle cx="872" cy="640" r="4" fill="#20242a" stroke="none"/>
  <circle cx="888" cy="640" r="4" fill="#20242a" stroke="none"/>
  <path d="M874 660 Q880 664 886 660" stroke="#20242a" stroke-width="3" fill="none"/>
  <path d="M846 710 L914 710 L900 744 L860 744 Z" fill="#b5651d"/>'''
    elif variant == 'pet_robo':
        shadows = shadow(880, 730, 55, 12, 0.12)
        p = '''
  <rect x="840" y="640" width="80" height="60" rx="12" fill="#64748b"/>
  <rect x="852" y="652" width="56" height="30" rx="6" fill="#0f172a"/>
  <circle cx="870" cy="666" r="5" fill="#00e5ff" stroke="none"/>
  <circle cx="890" cy="666" r="5" fill="#00e5ff" stroke="none"/>
  <rect x="872" y="700" width="16" height="20" rx="4" fill="#64748b"/>
  <rect x="832" y="716" width="24" height="12" rx="6" fill="#64748b"/>
  <rect x="904" y="716" width="24" height="12" rx="6" fill="#64748b"/>
  <rect x="876" y="606" width="8" height="30" fill="#64748b"/>
  <circle cx="880" cy="600" r="8" fill="#ff2d78"/>'''
    elif variant == 'pet_spider':
        shadows = shadow(880, 722, 60, 14, 0.12)
        p = '''
  <ellipse cx="880" cy="706" rx="34" ry="26" fill="#232a36"/>
  <circle cx="880" cy="672" r="22" fill="#232a36"/>
  <circle cx="874" cy="666" r="6" fill="#ff4757" stroke="none"/>
  <circle cx="886" cy="666" r="6" fill="#ff4757" stroke="none"/>
  <path d="M846 690 Q800 660 776 640 M914 690 Q960 660 984 640 M848 716 Q800 730 770 750 M912 716 Q960 730 990 750" stroke="#232a36" stroke-width="9" fill="none"/>'''
    elif variant == 'pet_bulldog':
        shadows = shadow(880, 726, 75, 16, 0.14)
        p = '''
  <ellipse cx="880" cy="706" rx="66" ry="44" fill="#a0805c"/>
  <ellipse cx="840" cy="672" rx="18" ry="26" fill="#a0805c" transform="rotate(-14 840 672)"/>
  <ellipse cx="920" cy="672" rx="18" ry="26" fill="#a0805c" transform="rotate(14 920 672)"/>
  <circle cx="868" cy="696" r="5" fill="#20242a" stroke="none"/>
  <circle cx="892" cy="696" r="5" fill="#20242a" stroke="none"/>
  <path d="M850 716 Q880 740 910 716 L910 700 Q880 724 850 700 Z" fill="#f5f5f0"/>
  <path d="M844 684 L872 684 M888 684 L916 684" stroke="#6b5540" stroke-width="5"/>
  <circle cx="906" cy="700" r="7" fill="#d98880" stroke="none"/>'''
    return svg(R, R, p, shadows=shadows)


def main():
    # Avatar layers
    write('avatar/body/base.svg', avatar_body())
    for v in ['eye_normal', 'eye_tired', 'eye_closed', 'eye_vr', 'eye_red', 'eye_legendary']:
        write(f'avatar/eyes/{v}.svg', avatar_eyes(v))
    for v in ['hair_buzzcut', 'hair_short', 'hair_messy', 'hair_long', 'hair_bald',
              'hair_manbun', 'hair_curly', 'hair_undercut', 'hair_spiky', 'hair_ponytail']:
        write(f'avatar/hair/{v}.svg', avatar_hair(v))
    for v in ['beard_none', 'beard_stubble', 'beard_goatee', 'beard_full', 'beard_mustache']:
        write(f'avatar/beard/{v}.svg', avatar_beard(v))
    for v in ['top_hoodie_gray', 'top_hoodie_localhost', 'top_hoodie_corp', 'top_hoodie_cat',
              'top_tshirt', 'top_shirt', 'top_jacket']:
        write(f'avatar/top/{v}.svg', avatar_top(v))
    for v in ['acc_none', 'acc_headphones', 'acc_glasses', 'acc_vr_headset', 'acc_cap',
              'acc_medal', 'acc_beanie']:
        write(f'avatar/acc/{v}.svg', avatar_acc(v))

    # Room layers
    for lvl in range(5):
        write(f'room/bg/bg_{lvl}.svg', room_bg(lvl))
    for v in ['window_square', 'window_panoramic', 'window_round', 'window_arched', 'window_blinds']:
        write(f'room/window/{v}.svg', room_window(v))
    for v in ['decor_poster_js', 'decor_neon', 'decor_server', 'decor_books', 'decor_whiteboard',
              'decor_madlads_poster', 'decor_pirate_poster', 'decor_clock', 'decor_poster_python']:
        write(f'room/decor/{v}.svg', room_decor(v))
    for v in ['desk_parata', 'desk_ikea', 'desk_office', 'desk_standing', 'desk_rgb']:
        write(f'room/desk/{v}.svg', room_desk(v))
    for v in ['chair_stool', 'chair_office', 'chair_gaming', 'chair_herman_miller', 'chair_throne']:
        write(f'room/chair/{v}.svg', room_chair(v))
    for v in ['setup_laptop', 'setup_monitor', 'setup_dual', 'setup_gaming', 'setup_macbook', 'setup_ultrawide']:
        write(f'room/setup/{v}.svg', room_setup(v))
    for v in ['atmo_none', 'atmo_plant', 'atmo_cactus', 'atmo_coffee', 'atmo_rug', 'atmo_lamp']:
        write(f'room/plant/{v}.svg', room_plant(v))
    for v in ['pet_none', 'pet_cat', 'pet_dog', 'pet_cactus', 'pet_robo', 'pet_spider', 'pet_bulldog']:
        write(f'room/pet/{v}.svg', room_pet(v))

    print(f'✓ generated layer assets into {OUT}')


if __name__ == '__main__':
    main()
