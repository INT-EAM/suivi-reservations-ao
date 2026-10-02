// Construit le favori à partir de la source lisible : node outils/build-bookmarklet.mjs
// (télécharge terser au besoin via npx). Résultat : outils/pwise-bookmarklet.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const min = execFileSync('npx', ['--yes', 'terser@5', `${dir}pwise-extract.src.js`, '--compress', '--mangle', '--comments', 'false'], { encoding: 'utf8' });
// Un favori est une URL : « % » doit être échappé pour ne pas être décodé par le navigateur.
const favori = 'javascript:' + min.trim().replace(/%/g, '%25');
writeFileSync(`${dir}pwise-bookmarklet.txt`, favori + '\n');
console.log(`pwise-bookmarklet.txt : ${favori.length} caractères`);
