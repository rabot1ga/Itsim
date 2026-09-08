/**
 * Palette — IT LIFE design system (docs/design-system.md).
 *
 * Colours are taken straight from the design references:
 *
 *   ink    #0D1117 → #F1F4F8   background, surfaces, lines, text
 *   green  #4ADE80             actions, money, XP, success  (moss)
 *   gold   #F4D35E             currency, rewards, reputation
 *   orange #F5A623             mood, warnings, compromise    (ochre)
 *   red    #E15554             danger, refusal, health       (clay)
 *   blue   #5AA9E6             energy, info, tags            (sky)
 *   purple #8B6FE0             third/alternative choice
 *
 * The legacy Tailwind names (slate/emerald/amber/red/violet…) are remapped onto
 * these scales on purpose: one edit here retints the whole app and keeps old
 * markup honest. `index.css` mirrors the same values as CSS custom properties.
 */

const ink = {
  50: '#f7f9fc',
  100: '#f1f4f8', // --text
  200: '#d6dde7',
  300: '#b7c0cc', // --text-dim
  400: '#94a0b0',
  500: '#7c8798', // --text-mute
  600: '#4b5563', // --text-faint
  700: '#3a4456', // --line-strong
  800: '#212836', // --surface-alt
  850: '#1b212c', // --surface
  900: '#161b22', // --bg-raise
  950: '#0d1117', // --bg
};

/** green — actions, money, XP, success */
const moss = {
  50: '#eafaf0',
  100: '#c9f5da',
  200: '#9aecbd',
  300: '#4ade80',
  400: '#35c46a',
  500: '#22a25a',
  600: '#1b8149',
  700: '#166534',
  800: '#114b28',
  900: '#0c2b1b',
};

/** orange — mood, warnings */
const ochre = {
  50: '#fdf3e2',
  100: '#fbe4bd',
  200: '#f8cd8a',
  300: '#f5a623',
  400: '#e2941a',
  500: '#c07c12',
  600: '#96600e',
  700: '#6f470b',
  800: '#4d3108',
  900: '#2f1e05',
};

/** red — danger, refusal, health in crisis */
const clay = {
  50: '#fbecec',
  100: '#f6d2d2',
  200: '#efaaa9',
  300: '#ea8483',
  400: '#e56b6a',
  500: '#e15554',
  600: '#c23f3e',
  700: '#932e2e',
  800: '#651f1f',
  900: '#3d1414',
};

/** blue — energy, info */
const sky = {
  50: '#eef6fd',
  100: '#d6e9fa',
  200: '#a9d1f2',
  300: '#5aa9e6',
  400: '#4691cb',
  500: '#3878aa',
  600: '#2d6089',
  700: '#234a69',
  800: '#1a364c',
  900: '#132633',
};

/** gold — currency, rewards, reputation */
const gold = {
  100: '#fdf3cd',
  200: '#f9e7a3',
  300: '#f4d35e',
  400: '#e6c04a',
  500: '#cfa733',
  600: '#a98527',
  700: '#7c611b',
  800: '#564213',
  900: '#33270b',
};

/** purple — the third / special choice */
const grape = {
  100: '#e6dffa',
  200: '#c9baf3',
  300: '#a68ce9',
  400: '#8b6fe0',
  500: '#7458c9',
  600: '#5c44a4',
  700: '#45337b',
  800: '#2f2354',
  900: '#1d1636',
};

/** wood stays for pixel-art tinting helpers */
const wood = {
  50: '#f7efe5',
  100: '#eddcc7',
  200: '#dfc4a2',
  300: '#d3b48f',
  400: '#b98d60',
  500: '#a2764d',
  600: '#87603e',
  700: '#6a4b31',
  800: '#4b3624',
  900: '#33251a',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        white: '#f1f4f8',
        ink,
        paper: ink[50],
        gold,
        wood,
        clay,
        moss,
        ochre,
        grape,
        sky,

        // Legacy names remapped onto the design-system palette.
        slate: ink,
        gray: ink,
        zinc: ink,
        neutral: ink,
        stone: ink,
        primary: moss,
        accent: moss,
        blue: sky,
        cyan: sky,
        teal: sky,
        indigo: sky,
        emerald: moss,
        green: moss,
        lime: moss,
        amber: ochre,
        yellow: ochre,
        orange: ochre,
        red: clay,
        rose: clay,
        pink: clay,
        violet: grape,
        purple: grape,
        fuchsia: grape,

        // Semantic resource colours (HUD, meters, chips).
        energy: sky[300],
        mood: ochre[300],
        health: clay[500],
        motivation: ochre[300],
        reputation: gold[300],
        money: moss[300],
        xp: moss[300],

        success: moss[300],
        warning: ochre[300],
        danger: clay[500],
      },
      borderRadius: {
        DEFAULT: '12px',
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '14px',
        '2xl': '16px',
        '3xl': '20px',
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '22px'],
        xl: ['18px', '24px'],
        '2xl': ['20px', '26px'],
        '3xl': ['24px', '30px'],
      },
      boxShadow: {
        card: '0 2px 6px rgba(0,0,0,0.3)',
        lift: '0 10px 30px -14px rgba(0,0,0,0.85)',
      },
    },
  },
  plugins: [],
};
