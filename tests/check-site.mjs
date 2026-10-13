// Run with: node tests/check-site.mjs
// Static checks for the pages. Layout and interactions are checked in a browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  'index.html', '404.html', 'projects/light-switch.html',
  'projects/blinds-control.html', 'projects/zaylo-remote.html',
  'projects/self-balancing-robot.html', 'projects/inverted-pendulum.html'
];
const failures = [];
let links = 0;
let scripts = 0;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ids = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const check = (condition, message) => { if (!condition) failures.push(message); };

for (const file of pages) {
  const html = read(file);
  const allIds = ids(html);
  check(allIds.length === new Set(allIds).size, file + ': duplicate IDs');
  check(!/—|&mdash;|&#8212;|&#x2014;/i.test(html), file + ': em dash');
  check((html.match(/<main\b/g) || []).length === 1, file + ': expected one main');
  check((html.match(/<h1\b/g) || []).length === 1, file + ': expected one h1');
  check(/<title>[^<]*Giorgi Suramlishvili[^<]*<\/title>/.test(html), file + ': title should include the name');
  check(/site\.css\?v=\d+/.test(html), file + ': missing the shared stylesheet');
  check(!/styles\.css|editorial\.css/.test(html), file + ': links an old stylesheet');
  // Decoration from the old design that made the pages read like a template.
  check(!/§|FIG\.\d|class="(?:hud|coord|tick|marquee|support-note)\b/.test(html), file + ': old decorative markers returned');
  check(!/style="[^"]*font-family/.test(html), file + ': inline font styling');
  for (const match of html.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
    const ref = match[1].replaceAll('&amp;', '&');
    if (/^(?:[a-z]+:|\/\/)/i.test(ref)) continue;
    const url = new URL(ref, 'https://local.test/' + file);
    const destination = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    const absolute = path.join(root, destination);
    links++;
    if (!fs.existsSync(absolute)) {
      failures.push(file + ': missing ' + ref);
      continue;
    }
    if (url.hash && destination.endsWith('.html')) {
      check(ids(read(destination)).includes(decodeURIComponent(url.hash.slice(1))),
        file + ': missing anchor ' + ref);
    }
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const [, attributes, body] = match;
    if (/application\/ld\+json/.test(attributes)) {
      try { JSON.parse(body); } catch (error) { failures.push(file + ': ' + error.message); }
      continue;
    }
    const src = attributes.match(/src="([^"]+)"/)?.[1];
    if (src && /^(?:https?:|\/\/)/.test(src)) continue;
    const local = src && (src.startsWith('/') ? src.slice(1) : path.posix.join(path.posix.dirname(file), src));
    const code = src ? read(local.split('?')[0]) : body;
    if (!code.trim()) continue;
    try { new vm.Script(code); scripts++; } catch (error) { failures.push(file + ': ' + error.message); }
  }
  for (const match of html.matchAll(/url\(#([^)]+)\)/g)) {
    check(allIds.includes(match[1]), file + ': missing SVG definition ' + match[1]);
  }
  // Every "On this page" link must match its section heading.
  for (const [, href, label] of html.matchAll(/<aside class="toc"[\s\S]*?<\/aside>/g).next().value?.[0].matchAll(/<a href="#([^"]+)">(.*?)<\/a>/g) ?? []) {
    const section = html.match(new RegExp('<section\\b[^>]*id="' + href + '"[^>]*>\\s*<h2[^>]*>(.*?)</h2>'));
    check(section, file + ': contents link to missing section ' + href);
    if (!section) continue;
    const heading = section[1].replace(/<span class="num">(\d+)<\/span>/, (_, n) => Number(n) + '. ');
    check(heading === label, file + ': contents label "' + label + '" differs from heading "' + heading + '"');
  }
}

const home = read('index.html');
const light = read('projects/light-switch.html');
const blinds = read('projects/blinds-control.html');
const robot = read('projects/self-balancing-robot.html');
const paper = read('projects/inverted-pendulum.html');
check((light.match(/class="mode-item"/g) || []).length === 5, 'Light: expected five mode explanations');
check(blinds.includes('400 ms') && blinds.includes('5 s timeout'), 'Blinds: gesture timings changed');
check(/LQR/.test(robot) && !/chosen a PID/.test(robot + paper), 'Robot: should say Atlas uses LQR');
check(/Rolls-Royce/.test(home) && /5&ndash;9 October/.test(home), 'Home: Rolls-Royce work experience missing');
check(!fs.existsSync(path.join(root, 'styles.css')) && !fs.existsSync(path.join(root, 'editorial.css')), 'Old stylesheets are back');

console.log(JSON.stringify({ pages: pages.length, localReferences: links, scriptsChecked: scripts, failures }, null, 2));
if (failures.length) process.exitCode = 1;
