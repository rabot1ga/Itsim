import { en } from './packages/shared/src/i18n/en';
import { readFileSync } from 'fs';
const keys = JSON.parse(readFileSync('/tmp/dict-keys.json', 'utf-8')) as string[];
const missing = keys.filter((k) => !(k in (en as any)));
console.log('missing:', JSON.stringify(missing));
