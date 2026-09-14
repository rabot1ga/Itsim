#!/usr/bin/env node
// Show every layer on top of body_base so we can inspect placement.
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';

const DIR='packages/client/public/layers/avatar-v2';
const CW=500,CH=760,COLS=6,GAP=6;
function blank(w,h){return sharp({create:{width:w,height:h,channels:4,background:{r:20,g:20,b:24,alpha:1}}});}

const body=await sharp(DIR+'/body_base.webp').ensureAlpha().png().toBuffer();
const files=(await readdir(DIR)).filter(f=>f.endsWith('.webp')&&f!=='body_base.webp').sort();
const rows=Math.ceil(files.length/COLS);
const outW=COLS*CW+(COLS+1)*GAP;
const outH=rows*CH+(rows+1)*GAP;
const comps=[];
for(let i=0;i<files.length;i++){
  const layer=await sharp(DIR+'/'+files[i]).ensureAlpha().png().toBuffer();
  const tile=blank(CW,CH).composite([{input:body},{input:layer}]).png().toBuffer();
  const r=Math.floor(i/COLS),c=i%COLS;
  comps.push({input:await tile,left:GAP+c*(CW+GAP),top:GAP+r*(CH+GAP)});
}
await blank(outW,outH).composite(comps).png().toFile('tools/art/avatar-v2/preview-all.png');
console.log('wrote',files.length,'tiles → tools/art/avatar-v2/preview-all.png');
