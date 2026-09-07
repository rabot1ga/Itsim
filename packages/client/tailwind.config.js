/**
 * Palette note (docs/design.md §17): every colour here is sampled from the game's own
 * artwork — the room/office SVG layers and the pixel component palettes. No stock
 * indigo→fuchsia gradients: the UI is the same world as the sprites.
 *
 *   ink    #11151c → #333c4c   walls and shadows of the pixel rooms
 *   paper  #e9edf4             the pale window light
 *   sky    #a9c6e0             daylight through the window (info, energy)
 *   moss   #7fae7a             the desk plant (money, success)
 *   ochre  #d99a4e             the desk lamp (motivation, warnings)
 *   gold   #f4d35e             the trophy / lamp glow (accent, rewards, CTA)
 *   clay   #c2565a             the mug and the error state (danger)
 *   wood   #b98d60             desk and floor (neutral warm)
 *
 * The legacy Tailwind names (slate/primary/emerald/amber/red/violet…) are remapped onto
 * this palette on purpose: one edit here retints the whole app and keeps old markup honest.
 */

const ink = {
  50: '#eef1f6',
  100: '#dde2ea',
  200: '#c2c9d5',
  300: '#a3acbc',
  400: '#8b93a3',
  500: '#7b8494',
  600: '#5c6575',
  700: '#333c4c',
  800: '#1e2430',
  900: '#161b24',
  950: '#11151c',
};

const sky = {
  50: '#eff5fa',
  100: '#dce9f4',
  200: '#c0d8ec',
  300: '#a9c6e0',
  400: '#8bb0d0',
  500: '#6f95b8',
  600: '#577b9d',
  700: '#45637f',
  800: '#354c62',
  900: '#28394a',
};

const moss = {
  50: '#eef5ed',
  100: '#dbeada',
  200: '#bcd8b8',
  300: '#9ccf97',
  400: '#7fae7a',
  500: '#6b9c66',
  600: '#568151',
  700: '#42663f',
  800: '#2f4a2e',
  900: '#22371f',
};

const ochre = {
  50: '#faf1e4',
  100: '#f5e2c6',
  200: '#f0cf9e',
  300: '#e6b478',
  400: '#d99a4e',
  500: '#c8862f',
  600: '#a86c22',
  700: '#7f5019',
  800: '#5c3a12',
  900: '#40280d',
};

const clay = {
  50: '#f8ecec',
  100: '#f2d6d7',
  200: '#e8b0b2',
  300: '#e08b8d',
  400: '#d47478',
  500: '#c2565a',
  600: '#a44448',
  700: '#7d3437',
  800: '#57262a',
  900: '#3b1c1f',
};

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

const gold = {
  100: '#fbeec2',
  200: '#f8e29b',
  300: '#f4d35e',
  400: '#eec44a',
  500: '#e0ad3c',
  600: '#c2932f',
  700: '#8f6c22',
  800: '#654c18',
  900: '#43330f',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        white: '#e9edf4',
        ink,
        paper: ink[50],
        gold,
        wood,
        clay,
        moss,
        ochre,

        // Legacy names remapped onto the art palette.
        slate: ink,
        gray: ink,
        zinc: ink,
        neutral: ink,
        stone: ink,
        primary: sky,
        accent: wood,
        sky,
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
        violet: wood,
        purple: wood,
        fuchsia: wood,

        // Semantic resource colours (HUD, meters).
        energy: sky[300],
        health: moss[400],
        motivation: ochre[400],
        reputation: gold[300],
        money: moss[300],

        success: moss[400],
        warning: ochre[400],
        danger: clay[500],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        '3xl': '16px',
      },
      fontSize: {
        '2xs': ['10px', '13px'],
        xs: ['11px', '15px'],
        sm: ['13px', '18px'],
        base: ['15px', '21px'],
        lg: ['17px', '23px'],
        xl: ['20px', '26px'],
        '2xl': ['24px', '30px'],
        '3xl': ['28px', '34px'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset',
        lift: '0 6px 20px rgba(8, 11, 16, 0.55)',
      },
    },
  },
  plugins: [],
};
