#!/usr/bin/env node
/**
 * Avatar-layer builder v4 — hand-tuned per-batch placement.
 *
 * Masters come in batches drawn at different zooms (t1 full-figure on 1024²
 * canvas; b2/b3 cropped close-ups on 1024²; b4-b8 cropped items on 1408x768
 * canvas). Rather than failing at auto-detecting features across such varied
 * sources, we have a per-file OVERRIDES table that says how to scale and
 * where to anchor each sprite against body_base landmarks, with a few
 * measured helpers (pupil-pin, skin-pin, fullTop/fullBottom via mannequin
 * silhouette) where applicable.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, basename } from 'node:path';

const TOL=72, EDGE_DILATE=2;
const CW=500, CH=760;
const BODY = { top:30, height:690, cx:250 };
const L = {
  crown:30, hairline:52, brow:70, eye:95, nose:128, mouth:150, chin:168,
  neck:182, shoulder:192, armpit:212, chest:270, waist:350, navel:385,
  waistband:430, crotch:465, ankle:720, ear:85,
};

// ---- per-file tuning table ----
// Each entry describes how to take the silhouette bbox of a chroma-keyed
// sprite and place it on the canvas:
//   mode:
//     'anchor'  - scale bbox to canvas, anchor point (ax,ay) in bbox-local
//                 [0..1]×[0..1] maps to canvas point (rx,ry).
//     'pupil'   - find two dark pupil blobs; distance between them →
//                 eyeSpan (default 80 px). Midpoint pins to (250, eye).
//     'skinHair'- peach skin patch in sprite maps to hairline→chin; hair
//                 edge is preserved relative to it.
//     'hair'    - strip mannequin/skin; isolate colored hair; anchor via bottom
//                 edge of hair bbox to hairline on canvas.
//     'fullTop' - full-figure shirt (b2/b3 style): locate mannequin silh
//                 inside the sprite; scale so shoulders = 200 px.
//     'fullBot' - full-figure pants: same, scale so outer-leg at crotch = 170.
//     'item'    - strip desaturated body, keep colored item, anchor centroid.
const OVERRIDES = {
  // ---- eyes ----
  'eyes_normal.png':   {mode:'pupil', eyeSpan:80, eyeY:L.eye},
  'eye_tired.png':     {mode:'pupil', eyeSpan:80, eyeY:L.eye},
  'eye_red.png':       {mode:'pupil', eyeSpan:80, eyeY:L.eye},
  'eye_legendary.png': {mode:'pupil', eyeSpan:80, eyeY:L.eye},
  'eye_closed.png':    {mode:'anchor', scale:0.12, ax:0.5, ay:0.5, rx:250, ry:L.eye},
  'eye_vr.png':        {mode:'pupil', eyeSpan:80, eyeY:L.eye-5},
  // ---- face accessories ----
  'acc_glasses.png':   {mode:'pupil', eyeSpan:120, eyeY:L.eye+10},
  'acc_vr_headset.png':{mode:'pupil', eyeSpan:200, eyeY:L.eye+5},
  // ---- hair ----
  // Silhouette bbox covers entire body; we pick (ax,ay) in that bbox so that the
  // rendered hair sprite covers from crown down to hairline/brow. Scale/ay/ry
  // tuned per-file for each master zoom.
  'hair_short.png':    {mode:'anchor', scale:0.10, ax:0.5, ay:0.18, rx:250, ry:L.crown+18},
  'hair_short_v2.png': {mode:'anchor', scale:0.10, ax:0.5, ay:0.18, rx:250, ry:L.crown+18},
  'hair_short_v3.png': {mode:'anchor', scale:0.10, ax:0.5, ay:0.18, rx:250, ry:L.crown+18},
  'hair_messy.png':    {mode:'anchor', scale:0.12, ax:0.5, ay:0.14, rx:250, ry:L.crown+14},
  'hair_manbun.png':   {mode:'anchor', scale:0.13, ax:0.5, ay:0.18, rx:250, ry:L.crown+10},
  'hair_buzzcut.png':  {mode:'anchor', scale:0.13, ax:0.5, ay:0.35, rx:250, ry:L.crown+25},
  'hair_curly.png':    {mode:'anchor', scale:0.13, ax:0.5, ay:0.18, rx:250, ry:L.crown+14},
  'hair_long.png':     {mode:'anchor', scale:0.16, ax:0.5, ay:0.10, rx:250, ry:L.crown+5},
  'hair_ponytail.png': {mode:'anchor', scale:0.15, ax:0.5, ay:0.18, rx:250, ry:L.crown+12},
  'hair_undercut.png': {mode:'anchor', scale:0.13, ax:0.5, ay:0.22, rx:250, ry:L.crown+18},
  'hair_spiky.png':    {mode:'anchor', scale:0.14, ax:0.5, ay:0.16, rx:250, ry:L.crown+8},
  // ---- beards ----
  'beard_goatee.png':  {mode:'anchor', targetW:55,targetH:50, ax:0.5,ay:0.22, rx:250, ry:L.mouth+2},
  'beard_stubble.png': {mode:'anchor', targetW:80,targetH:40, ax:0.5,ay:0.24, rx:250, ry:L.mouth+5},
  'beard_full.png':    {mode:'anchor', targetW:90,targetH:85, ax:0.5,ay:0.20, rx:250, ry:L.mouth+5},
  'beard_mustache.png':{mode:'anchor', targetW:70,targetH:18, ax:0.5,ay:0.30, rx:250, ry:L.nose+12},
  // ---- tops ----
  'top_tshirt.png':           {mode:'top', shoulder:215, ry:L.shoulder-2},
  'top_hoodie_gray.png':      {mode:'top', shoulder:245, ry:L.shoulder-4},
  'top_hoodie_localhost.png': {mode:'top', shoulder:245, ry:L.shoulder-4},
  'top_shirt.png':            {mode:'top', shoulder:235, ry:L.shoulder-2},
  'top_jacket.png':           {mode:'top', shoulder:255, ry:L.shoulder-4},
  'top_hoodie_corp.png':      {mode:'top', shoulder:240, ry:L.shoulder-4},
  'top_hoodie_cat.png':       {mode:'top', shoulder:240, ry:L.shoulder-4},
  // ---- bottoms ----
  'bottom_jeans.png':      {mode:'bottom', legLen:300, ry:L.waistband-5},
  'bottom_sweatpants.png': {mode:'bottom', legLen:300, ry:L.waistband-5},
  'bottom_chinos.png':     {mode:'bottom', legLen:300, ry:L.waistband-5},
  'bottom_shorts.png':     {mode:'bottom', legLen:165, ry:L.waistband-5},
  'bottom_suit.png':       {mode:'bottom', legLen:300, ry:L.waistband-5},
  // ---- accessories ----
  'acc_cap.png':       {mode:'anchor', targetW:140,targetH:80, ax:0.5, ay:0.70, rx:250, ry:L.crown+25},
  'acc_headphones.png':{mode:'anchor', targetW:200,targetH:120,ax:0.5, ay:0.60, rx:250, ry:L.ear+5},
  'acc_beanie.png':    {mode:'anchor', targetW:130,targetH:100,ax:0.5, ay:0.70, rx:250, ry:L.crown+25},
  'acc_medal.png':     {mode:'item', satTol:24, targetW:40, ay:0.0, rx:250, ry:L.chest+50},
};

// ---------- low-level pixel ops ----------

async function loadRaw(p){
  const r=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const copy=Buffer.alloc(r.data.length);
  r.data.copy(copy);
  return {data:copy, info:r.info};
}

function keyMg(src,w,h){
  // Only detect magenta; DO NOT dilate/erode. Edge halos are small enough
  // and erode was eating small sprites (eyes/hats) entirely because every
  // pixel in a small sprite is adjacent to the transparent background.
  const m=new Uint8Array(w*h);
  const N=w*h*4;
  for(let i=0,p=0;i<N;i+=4,p++){
    const r=src[i],g=src[i+1],b=src[i+2];
    if(Math.max(Math.abs(r-255),Math.abs(g),Math.abs(b-255))<=TOL)m[p]=0;
    else m[p]=1;
  }
  return m;
}

function bbox(m,w,h){
  let x1=w,y1=h,x2=-1,y2=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(!m[y*w+x])continue;
    if(x<x1)x1=x;if(y<y1)y1=y;if(x>x2)x2=x;if(y>y2)y2=y;
  }
  return {x:x1,y:y1,w:x2-x1+1,h:y2-y1+1};
}
function denoise(m,w,h){
  // Drop isolated single-pixel specks. A border fg pixel touching canvas edge
  // is NOT treated as isolated (mannequins reach the bottom of the canvas).
  const o=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(!m[p])continue;
    let a=false;
    for(let dy=-1;dy<=1&&!a;dy++)for(let dx=-1;dx<=1&&!a;dx++){
      if(!dx&&!dy)continue;
      const nx=x+dx,ny=y+dy;
      if(nx<0||ny<0||nx>=w||ny>=h){a=true;break;}
      if(m[ny*w+nx])a=true;
    }
    if(a)o[p]=1;
  }
  return o;
}
function components(m,w,h){
  const c=new Int32Array(w*h),szs=[];let id=0,st=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(!m[p]||c[p])continue;
    id++;let n=0;st.length=0;st.push(p);c[p]=id;
    while(st.length){
      const q=st.pop();n++;
      const qx=q%w;
      const nb=[q-w,q+w];if(qx>0)nb.push(q-1);if(qx<w-1)nb.push(q+1);
      for(const nn of nb)if(m[nn]&&!c[nn]){c[nn]=id;st.push(nn);}
    }
    szs.push({id,n});
  }
  return {c,szs};
}
function keepBig(m,w,h,rat=0.08){
  const {c,szs}=components(m,w,h);
  if(!szs.length)return m;
  szs.sort((a,b)=>b.n-a.n);
  const mn=szs[0].n;
  const keep=new Set(szs.filter(s=>s.n>=mn*rat).map(s=>s.id));
  const o=new Uint8Array(w*h);
  for(let p=0;p<o.length;p++)if(keep.has(c[p]))o[p]=1;
  return o;
}
function skinPix(mask,data,w,h){
  const o=new Uint8Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!mask[p])continue;
    const r=data[i],g=data[i+1],b=data[i+2];
    if(r>200&&g>140&&g<220&&b>115&&b<195&&r>g+5&&g>b+8)o[p]=1;
  }
  return o;
}
// Mask for colored hair/beard pixels: drop magenta BG, drop grey mannequin,
// drop skin. Keep everything else (including dark outlines and colored strands).
// Confined to a "head zone" (top portion of silhouette) so beard mode doesn't
// accidentally grab pants/shirts from the same sprite.
// Generic "colored item" mask: drop magenta BG, drop grey mannequin, drop skin.
// If silhouette bbox `silh` and a fractional yRange [y0,y1] are given, the mask
// is confined to that vertical slice. `lumFloor` lets us keep dark outlines
// (hair/clothes) without dragging in eye/line-work noise; pass 0 to keep all.
function coloredPix(mask,data,w,h,silh,yRange,lumFloor=0){
  const o=new Uint8Array(w*h);
  const minY = yRange ? silh.y+Math.floor(silh.h*yRange[0]) : 0;
  const maxY = yRange ? silh.y+Math.floor(silh.h*yRange[1]) : w*h;
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!mask[p])continue;
    if(yRange){const y=Math.floor(p/w);if(y<minY||y>maxY)continue;}
    const r=data[i],g=data[i+1],b=data[i+2];
    const lum=(r+g+b)/3;
    if(lum<lumFloor)continue;
    if(r>200&&b>200&&g<40)continue;
    const sp=Math.max(r,g,b)-Math.min(r,g,b);
    if(sp<25&&lum>60&&lum<220)continue;
    if(r>180&&g>130&&b>100&&r>g+5&&g>b+5)continue;
    o[p]=1;
  }
  return o;
}
const hairPix=coloredPix;
function mannequinPix(mask,data,w,h){
  const o=new Uint8Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!mask[p])continue;
    const r=data[i],g=data[i+1],b=data[i+2];
    const isSkin=r>200&&g>140&&g<220&&b>115&&b<195&&r>g+5&&g>b+8;
    const sp=Math.max(r,g,b)-Math.min(r,g,b),lum=(r+g+b)/3;
    const isGray=sp<30&&lum>55&&lum<210;
    if(isSkin||isGray)o[p]=1;
  }
  return o;
}
function pupils(mask,data,w,h,silh){
  const d=new Uint8Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!mask[p])continue;
    const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
    if(!a)continue;
    if((r+g+b)/3<65)d[p]=1;
  }
  const {c,szs}=components(d,w,h);
  if(szs.length<2)return null;
  szs.sort((a,b)=>b.n-a.n);
  const cands=[];
  for(const s of szs.slice(0,8)){
    let sx=0,sy=0,n=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const p=y*w+x;if(c[p]!==s.id)continue;
      sx+=x;sy+=y;n++;
    }
    cands.push({cx:sx/n,cy:sy/n,n});
  }
  let best=null,bs=-1;
  for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++){
    const a=cands[i],b=cands[j];
    const sp=Math.abs(a.cx-b.cx);
    if(sp<silh.w*0.25)continue;
    if(Math.abs(a.cy-b.cy)>silh.h*0.25)continue;
    if(sp>bs){bs=sp;best={a,b};}
  }
  if(!best)return null;
  return {lx:Math.min(best.a.cx,best.b.cx),rx:Math.max(best.a.cx,best.b.cx),
          y:(best.a.cy+best.b.cy)/2,span:Math.abs(best.a.cx-best.b.cx)};
}
// Find the bottom edge of a "top block" (hair, cap) given a colored mask.
// Scans downward from the top of the silhouette; stops at the first significant
// gap (low colored-pixel row) past a minimum head height, which corresponds to
// the forehead gap between hair and eyes. Falls back to the bottom of the
// yRange if no gap is found.
function topBlockBbox(mask,w,h,silh,yRange,minGap=8){
  const minY=silh.y+Math.floor(silh.h*yRange[0]);
  const maxY=silh.y+Math.floor(silh.h*yRange[1]);
  let x1=w,y1=h,x2=-1,y2=-1;
  let hairBot=maxY;
  let started=false,gapRun=0,minStart=silh.y+Math.floor(silh.h*0.10);
  for(let y=minY;y<=maxY;y++){
    let cnt=0,rl=w,rr=-1;
    for(let x=0;x<w;x++){
      if(mask[y*w+x]){cnt++;if(x<rl)rl=x;if(x>rr)rr=x;}
    }
    if(cnt>0){
      started=true;gapRun=0;
      if(rl<x1)x1=rl;if(rr>x2)x2=rr;if(y<y1)y1=y;
      y2=y;
    }else if(started&&y>minStart){
      gapRun++;
      if(gapRun>=minGap){hairBot=y-minGap;break;}
    }
  }
  if(x2<0)return bbox(mask,w,h);
  return {x:x1,y:y1,w:x2-x1+1,h:hairBot-y1+1};
}
// Find the top edge of a "middle block" (beard, mouth-region) by scanning up from
// the middle yRange toward the top, stopping at a gap that marks the nose/lip gap.
function midBlockBbox(mask,w,h,silh,yRange,minGap=6){
  const minY=silh.y+Math.floor(silh.h*yRange[0]);
  const maxY=silh.y+Math.floor(silh.h*yRange[1]);
  let x1=w,y1=h,x2=-1,y2=-1;
  let beardTop=minY,gapRun=0,started=false;
  let minStart=silh.y+Math.floor(silh.h*(yRange[0]+(yRange[1]-yRange[0])*0.15));
  for(let y=maxY;y>=minY;y--){
    let cnt=0,rl=w,rr=-1;
    for(let x=0;x<w;x++){
      if(mask[y*w+x]){cnt++;if(x<rl)rl=x;if(x>rr)rr=x;}
    }
    if(cnt>0){
      started=true;gapRun=0;
      if(rl<x1)x1=rl;if(rr>x2)x2=rr;if(y<y1)y1=y;if(y>y2)y2=y;
    }else if(started&&y<minStart){
      gapRun++;
      if(gapRun>=minGap){beardTop=y+minGap;break;}
    }
  }
  if(x2<0)return bbox(mask,w,h);
  return {x:x1,y:beardTop,w:x2-x1+1,h:y2-beardTop+1};
}
function stripDesat(data,mask,w,h,sat){
  const o=new Uint8Array(w*h);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!mask[p])continue;
    const r=data[i],g=data[i+1],b=data[i+2];
    const sp=Math.max(r,g,b)-Math.min(r,g,b),lum=(r+g+b)/3;
    if(sp<sat&&lum>55&&lum<210){data[i]=data[i+1]=data[i+2]=data[i+3]=0;o[p]=0;}
    else o[p]=1;
  }
  return o;
}
function extBuf(data,w,h,box){
  const x=Math.max(0,Math.min(w-1,box.x));
  const y=Math.max(0,Math.min(h-1,box.y));
  const bw=Math.max(1,Math.min(box.w,w-x));
  const bh=Math.max(1,Math.min(box.h,h-y));
  return sharp(data,{raw:{width:w,height:h,channels:4}})
    .extract({left:x,top:y,width:bw,height:bh}).png().toBuffer();
}
function blank(){return sharp({create:{width:CW,height:CH,channels:4,background:{r:0,g:0,b:0,alpha:0}}});}
async function toGray(img,lo=0.36,hi=0.82){
  const {data,info}=await img.png().raw().toBuffer({resolveWithObject:true});
  let mn=1,mx=0;const ls=new Float32Array(data.length/4);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!data[i+3])continue;
    const l=(0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2])/255;
    ls[p]=l;if(l<mn)mn=l;if(l>mx)mx=l;
  }
  const sp=Math.max(0.05,mx-mn);
  for(let i=0,p=0;i<data.length;i+=4,p++){
    if(!data[i+3])continue;
    const v=Math.round((lo+(ls[p]-mn)/sp*(hi-lo))*255);
    data[i]=data[i+1]=data[i+2]=v;
  }
  return sharp(data,{raw:{width:info.width,height:info.height,channels:4}});
}
function rowW(mask,w,h,y){
  let x1=w,x2=-1;
  for(let x=0;x<w;x++)if(mask[y*w+x]){if(x<x1)x1=x;if(x>x2)x2=x;}
  return {x1,x2,w:x2<0?0:x2-x1+1,cx:x2<0?0:(x1+x2)/2};
}

// ---------- placement helpers ----------

async function placeAnchor(bufP, bw, bh, scale, ax, ay, rx, ry){
  const buf=await bufP;
  let tw=Math.max(1,Math.round(bw*scale)), th=Math.max(1,Math.round(bh*scale));
  const fit=Math.min(1,(CW-4)/tw,(CH-4)/th);
  tw=Math.max(1,Math.round(tw*fit));th=Math.max(1,Math.round(th*fit));
  const rz=await sharp(buf).resize(tw,th,{kernel:'nearest'}).png().toBuffer();
  const left=Math.max(-tw+2,Math.min(CW-2,Math.round(rx-ax*tw)));
  const top =Math.max(-th+2,Math.min(CH-2,Math.round(ry-ay*th)));
  return {rz,left,top};
}

async function buildBody(inp,out){
  const {data:rawData,info}=await loadRaw(inp);
  const w=info.width,h=info.height;
  let m=keyMg(rawData,w,h);
  m=denoise(m,w,h);
  m=keepBig(m,w,h);
  const outData=Buffer.alloc(rawData.length); rawData.copy(outData);
  for(let p=0;p<m.length;p++)if(!m[p])outData[p*4+3]=0;
  const s=bbox(m,w,h);
  if(s.w<=0||s.h<=0)throw new Error('body empty');
  const buf=await extBuf(outData,w,h,s);
  const sc=BODY.height/s.h;
  let tw=Math.round(s.w*sc),th=BODY.height;
  if(tw>CW||th>CH){const fit=Math.min(CW/tw,CH/th);tw=Math.round(tw*fit);th=Math.round(th*fit);}
  const rz=await(await toGray(sharp(buf))).resize(tw,th,{kernel:'nearest'}).png().toBuffer();
  const cv=blank().composite([{input:rz,left:Math.round((CW-tw)/2),top:BODY.top}]);
  await mkdir(dirname(out),{recursive:true});
  await cv.webp({quality:92}).toFile(out);
  console.log(JSON.stringify({out,s}));
}

async function buildLayer(inp,slot,out){
  const fname=basename(inp);
  const ov=OVERRIDES[fname];
  const {data:rawData,info}=await loadRaw(inp);
  const w=info.width,h=info.height;
  let m=keyMg(rawData,w,h);
  m=denoise(m,w,h);
  m=keepBig(m,w,h);
  const outData=Buffer.alloc(rawData.length);rawData.copy(outData);
  let tot=0;for(let p=0;p<m.length;p++){if(m[p])tot++;else outData[p*4+3]=0;}
  const s=bbox(m,w,h);
  if(s.w<=0||s.h<=0){
    await mkdir(dirname(out),{recursive:true});
    await blank().webp({quality:92}).toFile(out);
    console.log(JSON.stringify({out,empty:true}));return;
  }
  const buf=extBuf(outData,w,h,s);

  let placed;
  if(ov?.mode==='pupil'){
    // Must re-run chroma-key on fresh copy so color data is intact for pupil detection
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const pp=pupils(m2,fresh.data,fresh.info.width,fresh.info.height,s);
    const eyeSpan=ov.eyeSpan||80, eyeY=ov.eyeY||L.eye;
    let sc,ax,ay,rx=250,ry=eyeY;
    if(pp){
      sc=eyeSpan/pp.span;
      ax=((pp.lx+pp.rx)/2 - s.x)/s.w; // anchor x fraction in bbox
      ay=(pp.y - s.y)/s.h;
    }else{
      sc=0.14; ax=0.5; ay=0.5;
    }
    // But we place from the STRIPPED item (remove any remaining gray/skin so
    // only the eyes/accessory remain), using same scale/anchor.
    const stripCopy=new Uint8Array(fresh.data.length);stripCopy.set(fresh.data);
    const it0=stripDesat(stripCopy,m2,fresh.info.width,fresh.info.height,18);
    const it=keepBig(denoise(it0,fresh.info.width,fresh.info.height),fresh.info.width,fresh.info.height,0.08);
    for(let p=0;p<it.length;p++)if(!it[p])fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;
    const ib=bbox(it,fresh.info.width,fresh.info.height);
    if(pp && ib.w>0){
      const ubuf=extBuf(fresh.data,fresh.info.width,fresh.info.height,ib);
      const ax=(pp.lx+pp.rx)/2 - ib.x, ay=pp.y - ib.y;
      const isc=eyeSpan/pp.span;
      const iW=ib.w*isc, iH=ib.h*isc;
      const fit=Math.min(1,(CW-20)/iW,(CH-30)/iH);
      const fW=Math.round(iW*fit),fH=Math.round(iH*fit);
      const rz=await sharp(await ubuf).resize(fW,fH,{kernel:'nearest'}).png().toBuffer();
      const Lx=Math.round(rx - ax*isc*fit);
      const Ly=Math.round(ry - ay*isc*fit);
      placed={rz,left:Math.max(-fW+2,Math.min(CW-2,Lx)),top:Math.max(-fH+2,Math.min(CH-2,Ly))};
    }else if(ib.w>0){
      const ubuf=extBuf(fresh.data,fresh.info.width,fresh.info.height,ib);
      placed=await placeAnchor(ubuf,ib.w,ib.h,sc,0.5,0.5,rx,ry);
    }else{
      placed=await placeAnchor(buf,s.w,s.h,sc,0.5,0.5,rx,ry);
    }
  }
  else if(ov?.mode==='hair'){
    // Strip mannequin/skin so only hair-colored pixels remain; place using bbox
    // of hair only — this avoids anchoring on the full head+body silhouette.
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const hm=keepBig(denoise(coloredPix(m2,c2,fresh.info.width,fresh.info.height,s,[0,0.62],20)),fresh.info.width,fresh.info.height,0.03);
    const hb=topBlockBbox(hm,fresh.info.width,fresh.info.height,s,[0,0.62]);
    for(let p=0;p<hm.length;p++){
      if(!hm[p]){fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;continue;}
      const y=Math.floor(p/fresh.info.width);
      if(y<hb.y||y>=hb.y+hb.h)fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;
    }
    const useBox = hb.w>0 ? hb : s;
    const useBuf = hb.w>0 ? extBuf(fresh.data,fresh.info.width,fresh.info.height,hb) : buf;
    const targetH = ov.h || 55;
    const sc=targetH/useBox.h;
    // Anchor bottom edge of hair bbox (ay=1) to canvas ry (default brow).
    placed=await placeAnchor(useBuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay||1.0,ov.rx||250,ov.ry||L.brow);
  }
  else if(ov?.mode==='beard'){
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    // Beard zone: 35%-82% of silhouette. Use midBlockBbox to cut the nose/lip gap
    // so we don't include eyes/nose in the beard bbox.
    const bm=keepBig(denoise(coloredPix(m2,c2,fresh.info.width,fresh.info.height,s,[0.30,0.85],30)),fresh.info.width,fresh.info.height,0.03);
    const bb=midBlockBbox(bm,fresh.info.width,fresh.info.height,s,[0.30,0.85]);
    for(let p=0;p<bm.length;p++){
      if(!bm[p]){fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;continue;}
      const y=Math.floor(p/fresh.info.width);
      if(y<bb.y||y>=bb.y+bb.h)fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;
    }
    const useBox = bb.w>0 ? bb : s;
    const useBuf = bb.w>0 ? extBuf(fresh.data,fresh.info.width,fresh.info.height,bb) : buf;
    const targetH = ov.h || 55;
    const sc=targetH/useBox.h;
    placed=await placeAnchor(useBuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay||0.0,ov.rx||250,ov.ry||L.mouth-4);
  }
  else if(ov?.mode==='top'){
    // Tops: isolate colored pixels in the torso portion of the sprite (below the
    // head zone), stripping grey mannequin and skin.
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const W=fresh.info.width,H=fresh.info.height;
    // Torso zone: from ~22% below top of silhouette (armpits down). Keeps shirts/jackets
    // and avoids capturing hair/face.
    const sm2=keepBig(denoise(coloredPix(m2,c2,W,H,s,[0.22,1.0])),W,H,0.10);
    for(let p=0;p<sm2.length;p++)if(!sm2[p])fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;
    const sb=bbox(sm2,W,H);
    const useBox=sb.w>0?sb:s;
    const useBuf=sb.w>0?extBuf(fresh.data,W,H,sb):buf;
    const sc=(ov.shoulder||195)/useBox.w;
    placed=await placeAnchor(useBuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay||0.0,ov.rx||250,ov.ry||L.shoulder);
  }
  else if(ov?.mode==='bottom'){
    // Bottoms: isolate colored pixels from ~38% of silhouette down (waist to feet).
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const W=fresh.info.width,H=fresh.info.height;
    const bm2=keepBig(denoise(coloredPix(m2,c2,W,H,s,[0.38,1.0])),W,H,0.10);
    for(let p=0;p<bm2.length;p++)if(!bm2[p])fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;
    const bb=bbox(bm2,W,H);
    const useBox=bb.w>0?bb:s;
    const useBuf=bb.w>0?extBuf(fresh.data,W,H,bb):buf;
    const sc=(ov.legLen||290)/useBox.h;
    placed=await placeAnchor(useBuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay||0.0,ov.rx||250,ov.ry||L.waistband);
  }
  else if(ov?.mode==='head'){
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const W=fresh.info.width,H=fresh.info.height;
    const am=keepBig(denoise(coloredPix(m2,c2,W,H,s,[0,0.55],20)),W,H,0.05);
    // Cut at first horizontal gap (forehead) so we don't drag in eyes.
    const ab=topBlockBbox(am,W,H,s,[0,0.55]);
    for(let p=0;p<am.length;p++){
      if(!am[p]){fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;continue;}
      const y=Math.floor(p/W);
      if(y<ab.y||y>=ab.y+ab.h)fresh.data[p*4]=fresh.data[p*4+1]=fresh.data[p*4+2]=fresh.data[p*4+3]=0;
    }
    const useBox=ab.w>0?ab:s;
    const useBuf=ab.w>0?extBuf(fresh.data,W,H,ab):buf;
    const targetH=ov.h||45;
    const sc=targetH/useBox.h;
    placed=await placeAnchor(useBuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay||1.0,ov.rx||250,ov.ry||L.crown);
  }
  else if(ov?.mode==='skinHair'){
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const sk=keepBig(skinPix(m2,fresh.data,fresh.info.width,fresh.info.height),fresh.info.width,fresh.info.height,0.05);
    const sb=bbox(sk,fresh.info.width,fresh.info.height);
    // sb height = hairline→chin ≈ 116 px on canvas.
    const sc=116/sb.h;
    // anchor: skin top-left in bbox → L.hairline
    const ax=(sb.x-s.x+sb.w/2)/s.w;
    const ay=(sb.y-s.y)/s.h;
    placed=await placeAnchor(buf,s.w,s.h,sc,ax,ay,250,L.hairline);
  }
  else if(ov?.mode==='fullTop'){
    // Locate mannequin silhouette inside sprite; find shoulder row
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    let mm=keepBig(denoise(mannequinPix(m2,fresh.data,fresh.info.width,fresh.info.height),fresh.info.width,fresh.info.height),fresh.info.width,fresh.info.height);
    let mbox=bbox(mm,fresh.info.width,fresh.info.height);
    // Fallback: if mannequin mask empty (grey skin not recognized), use full silhouette.
    if(mbox.w<=0){mm=m2;mbox=bbox(m2,fresh.info.width,fresh.info.height);}
    // find max-width row in top 30% of mannequin bbox (shoulders)
    let sw=0,sy=mbox.y,scx=mbox.x+mbox.w/2;
    for(let y=mbox.y;y<mbox.y+Math.floor(mbox.h*0.30);y++){
      const r=rowW(mm,fresh.info.width,fresh.info.height,y);
      if(r.w>sw){sw=r.w;sy=y;scx=r.cx;}
    }
    if(sw<=0){sw=s.w;sy=s.y;scx=s.x+s.w/2;}
    const sc=200/sw;
    const ax=(scx-s.x)/s.w;
    const ay=(sy-s.y)/s.h;
    placed=await placeAnchor(buf,s.w,s.h,sc,ax,ay,250,L.shoulder);
  }
  else if(ov?.mode==='fullBottom'){
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    // Find crotch (narrowest point in middle of opaque area)
    let cw=Infinity,cy=s.y,ccx=s.x+s.w/2;
    for(let y=s.y+Math.floor(s.h*0.30);y<s.y+Math.floor(s.h*0.70);y++){
      const r=rowW(m2,fresh.info.width,fresh.info.height,y);
      if(r.w>20&&r.w<cw){cw=r.w;cy=y;ccx=r.cx;}
    }
    if(!isFinite(cw)){cw=80;cy=s.y+Math.floor(s.h*0.5);ccx=s.x+s.w/2;}
    const sc=170/cw;
    const ax=(ccx-s.x)/s.w;
    const ay=(cy-s.y)/s.h;
    placed=await placeAnchor(buf,s.w,s.h,sc,ax,ay,250,L.crotch);
  }
  else if(ov?.mode==='itemColor'){
    // Like item but uses hairPix (colored non-skin, non-grey) to isolate accessory.
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const it0=stripDesat(c2,m2,fresh.info.width,fresh.info.height,ov.satTol||24);
    let it=keepBig(denoise(it0,fresh.info.width,fresh.info.height),fresh.info.width,fresh.info.height,0.05);
    // also accept hairPix for strong-colored items (caps/beanies have low saturation on black)
    let ib=bbox(it,fresh.info.width,fresh.info.height);
    let useMask=it, useData=fresh.data, useBox=ib;
    if(ib.w<=0){useMask=m2;useData=outData;useBox=s;}
    else for(let p=0;p<useMask.length;p++)if(!useMask[p])useData[p*4]=useData[p*4+1]=useData[p*4+2]=useData[p*4+3]=0;
    const ibuf=extBuf(useData,fresh.info.width,fresh.info.height,useBox);
    const sc=(ov.targetW||80)/useBox.w;
    placed=await placeAnchor(ibuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay||0.5,ov.rx||250,ov.ry||L.crown);
  }
  else if(ov?.mode==='item'){
    const fresh=await loadRaw(inp);
    const c2=new Uint8Array(fresh.data.length);c2.set(fresh.data);
    const m2=keepBig(denoise(keyMg(c2,fresh.info.width,fresh.info.height)),fresh.info.width,fresh.info.height);
    for(let p=0;p<m2.length;p++)if(!m2[p])fresh.data[p*4+3]=0;
    const it0=stripDesat(c2,m2,fresh.info.width,fresh.info.height,ov.satTol||24);
    let it=keepBig(denoise(it0,fresh.info.width,fresh.info.height),fresh.info.width,fresh.info.height,0.08);
    let ib=bbox(it,fresh.info.width,fresh.info.height);
    let useMask=it, useData=fresh.data, useBox=ib;
    if(ib.w<=0){
      // fall back to whole silhouette
      useMask=m2; useData=outData; useBox=s;
    }else{
      for(let p=0;p<useMask.length;p++)if(!useMask[p])useData[p*4]=useData[p*4+1]=useData[p*4+2]=useData[p*4+3]=0;
    }
    const ibuf=extBuf(useData,fresh.info.width,fresh.info.height,useBox);
    const sc=(ov.targetW||80)/useBox.w;
    placed=await placeAnchor(ibuf,useBox.w,useBox.h,sc,ov.ax||0.5,ov.ay??0.25,ov.rx||250,ov.ry||L.chest);
  }
  else{
    // anchor mode: support either `scale` (ratio) or `targetW/targetH` (final size on canvas).
    let sc=ov.scale;
    if(ov.targetW) sc=ov.targetW/s.w;
    else if(ov.targetH) sc=ov.targetH/s.h;
    placed=await placeAnchor(buf,s.w,s.h,sc,ov.ax,ov.ay,ov.rx,ov.ry);
  }

  let final=blank().composite([{input:placed.rz,left:placed.left,top:placed.top}]);
  await mkdir(dirname(out),{recursive:true});
  await final.webp({quality:92}).toFile(out);
  console.log(JSON.stringify({out,s}));
}

const [cmd,...args]=process.argv.slice(2);
if(cmd==='body'){const[i,o]=args;await buildBody(i,o);}
else if(cmd==='layer'){const[i,s,o]=args;await buildLayer(i,s,o);}
else{console.error('bad cmd',cmd);process.exit(1);}
