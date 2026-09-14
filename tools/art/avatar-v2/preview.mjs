#!/usr/bin/env node
// Build a 2x3 preview grid composing a few outfits to visually verify alignment.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const DIR='packages/client/public/layers/avatar-v2';
const CANVAS_W=500,CANVAS_H=760;
const COLS=3,ROWS=2;
const GAP=8;

const combos=[
  {name:'tshirt+jeans+short', eyes:'eye_normal', hair:'hair_short', beard:'beard_none',
   top:'top_tshirt', bottom:'bottom_jeans', acc:'acc_none'},
  {name:'shirt+chinos+messy-beard', eyes:'eye_tired', hair:'hair_messy', beard:'beard_full',
   top:'top_shirt', bottom:'bottom_chinos', acc:'acc_glasses'},
  {name:'hoodie-cat+shorts+manbun+cap', eyes:'eye_red', hair:'hair_manbun', beard:'beard_goatee',
   top:'top_hoodie_cat', bottom:'bottom_shorts', acc:'acc_cap'},
  {name:'hoodie-localhost+sweats+buzz+headphones', eyes:'eye_closed', hair:'hair_buzzcut', beard:'beard_none',
   top:'top_hoodie_localhost', bottom:'bottom_sweatpants', acc:'acc_headphones'},
  {name:'jacket+suit+long+vr', eyes:'eye_legendary', hair:'hair_long', beard:'beard_stubble',
   top:'top_jacket', bottom:'bottom_suit', acc:'acc_vr_headset'},
  {name:'hoodie-gray+jeans+spiky+medal', eyes:'eye_normal', hair:'hair_spiky', beard:'beard_mustache',
   top:'top_hoodie_gray', bottom:'bottom_jeans', acc:'acc_medal'},
];

function blank(w,h){return sharp({create:{width:w,height:h,channels:4,background:{r:20,g:20,b:24,alpha:1}}});}

async function load(name){
  if(!name||name==='acc_none'||name==='beard_none'||name==='hair_bald')return null;
  try{return await sharp(DIR+'/'+name+'.webp').ensureAlpha().png().toBuffer();}catch(e){return null;}
}

async function compose(outfit){
  const parts=['body_base', outfit.bottom, outfit.top, outfit.eyes, outfit.beard, outfit.hair, outfit.acc];
  const inputs=[];
  for(const p of parts){
    const buf=await load(p);
    if(buf)inputs.push({input:buf,left:0,top:0});
  }
  return blank(CANVAS_W,CANVAS_H).composite(inputs).png().toBuffer();
}

const tiles=[];
for(const c of combos){
  const buf=await compose(c);
  tiles.push({buf,name:c.name});
}

const outW=COLS*CANVAS_W+(COLS+1)*GAP;
const outH=ROWS*CANVAS_H+(ROWS+1)*GAP;
let img=blank(outW,outH);
const composites=[];
for(let i=0;i<tiles.length;i++){
  const r=Math.floor(i/COLS), col=i%COLS;
  const x=GAP+col*(CANVAS_W+GAP);
  const y=GAP+r*(CANVAS_H+GAP);
  composites.push({input:tiles[i].buf,left:x,top:y});
}
img=img.composite(composites);
await img.png().toFile('tools/art/avatar-v2/preview.png');
console.log('wrote preview → tools/art/avatar-v2/preview.png');
