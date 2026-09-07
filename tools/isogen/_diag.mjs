import sharp from 'sharp';
const f = process.argv[2];
const img = sharp(f).ensureAlpha();
const { width, height } = await img.metadata();
const raw = await img.raw().toBuffer();
const st = new Map();
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4;
  if (raw[i + 3] < 200) continue;
  const r = raw[i], g = raw[i+1], b = raw[i+2];
  const lum = 0.299*r + 0.587*g + 0.114*b;
  const hex = '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  const s = st.get(hex) ?? { n:0, sy:0, ymax:0, ymin:1, lum };
  s.n++; s.sy += y/height; s.ymax = Math.max(s.ymax, y/height); s.ymin = Math.min(s.ymin, y/height);
  st.set(hex, s);
}
const total = [...st.values()].reduce((a,s)=>a+s.n,0);
console.log(f, `${width}x${height}`);
for (const [hex,s] of [...st.entries()].sort((a,b)=>b[1].n-a[1].n))
  if (s.n/total > 0.004)
    console.log(hex, 'share', (s.n/total*100).toFixed(1)+'%', 'y', (s.sy/s.n).toFixed(2), 'ymin', s.ymin.toFixed(2), 'ymax', s.ymax.toFixed(2), 'lum', s.lum.toFixed(0));
