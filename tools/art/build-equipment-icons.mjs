/** Hand-authored 48px pixel-style SVGs. No reference screenshot fragments. */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
const root = 'packages/client/public/art/equipment';
await mkdir(root, { recursive: true });
const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" shape-rendering="crispEdges">${body}</svg>\n`;
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
let laptop =
  rect(7, 7, 34, 26, '#080d14') +
  rect(9, 9, 30, 22, '#748297') +
  rect(11, 11, 26, 18, '#0c213e') +
  rect(13, 13, 22, 14, '#15375a');
for (let i = 0; i < 5; i++) laptop += rect(15, 15 + i * 2, 6 + i * 2, 1, i % 2 ? '#4c86b0' : '#658fbc');
laptop += '<path d="M7 32h34l6 8v3H1v-3z" fill="#080d14"/><path d="M9 33h30l4 6H5z" fill="#6d7889"/>';
for (let row = 0; row < 2; row++)
  for (let col = 0; col < 8; col++) laptop += rect(10 + col * 3, 34 + row * 2, 2, 1, '#202d3d');
laptop += rect(20, 38, 8, 2, '#a4adba') + rect(3, 41, 42, 1, '#7b879b');
await writeFile(`${root}/laptop.svg`, wrap(laptop));
let keyboard = rect(2, 12, 44, 25, '#090e16') + rect(4, 14, 40, 21, '#667282') + rect(5, 15, 38, 19, '#1c2634');
for (let row = 0; row < 4; row++)
  for (let col = 0; col < 10; col++)
    keyboard += rect(7 + col * 3.5, 17 + row * 3, 2, 2, row === 3 && col > 2 && col < 7 ? '#9aa6b4' : '#66778c');
keyboard += rect(16, 30, 17, 2, '#a3b1c0') + rect(40, 30, 2, 2, '#82b96a');
await writeFile(`${root}/keyboard.svg`, wrap(keyboard));
const chair =
  '<path d="M16 3h18v3h3v20h-3v5h-2v3H20v-3h-4v-5h-3V6h3z" fill="#080c12"/>' +
  rect(17, 6, 16, 18, '#526071') +
  rect(19, 8, 12, 14, '#293744') +
  rect(20, 10, 10, 2, '#697689') +
  '<path d="M12 25h24v7H12z" fill="#667383"/>' +
  rect(15, 26, 18, 4, '#344453') +
  rect(22, 32, 5, 7, '#8b98a3') +
  '<path d="M23 36h3v4h13v3H10v-3h13z" fill="#121b25"/>' +
  rect(8, 42, 7, 3, '#6a7786') +
  rect(35, 42, 7, 3, '#6a7786') +
  rect(22, 40, 5, 7, '#66758a') +
  '<path d="M9 19h3v10H9zm27 0h3v10h-3z" fill="#84909e"/>';
await writeFile(`${root}/chair.svg`, wrap(chair));
const headphones = await readFile('packages/client/public/reference-ui/headphones.svg', 'utf8');
await writeFile(`${root}/headphones.svg`, headphones);
console.log('Built four original pixel-style equipment icons');
