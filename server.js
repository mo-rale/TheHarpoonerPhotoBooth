// Local-only photobooth server. Binds to 127.0.0.1 so nothing else on the network can reach it.
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const PHOTOS_DIR = path.join(__dirname, 'photos');
const DATA_DIR = path.join(__dirname, 'data');
const DESIGNS_FILE = path.join(DATA_DIR, 'designs.json');
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DESIGNS = [
  { id: 'classic', name: 'Newsprint White', note: 'Crisp and editorial', bg: '#f8f5ed', ink: '#040624', accent: '#e9e4d9', border: '#d5cfc3', checker: false },
  { id: 'harpooner-cyan', name: 'Harpooner Cyan', note: 'The signature finish', bg: '#43d9e7', ink: '#030522', accent: '#b9f5f6', border: '#f1ffff', checker: false },
  { id: 'deep-current', name: 'Deep Current', note: 'Navy and cinematic', bg: '#040522', ink: '#ecffff', accent: '#102e85', border: '#43d9e7', checker: false },
  { id: 'parchment', name: 'Parchment', note: 'Warm campus classic', bg: '#eee8dc', ink: '#061039', accent: '#d7c9ae', border: '#fbf8f0', checker: false },
  { id: 'press-silver', name: 'Press Silver', note: 'Cool modern finish', bg: '#dce1e5', ink: '#071035', accent: '#bac5cd', border: '#f7fbfd', checker: false },
  { id: 'signal-burgundy', name: 'Signal Burgundy', note: 'Bold quill-inspired color', bg: '#7f171d', ink: '#fff8e9', accent: '#c99f55', border: '#42dbe8', checker: true },
];

const DESIGN_DEFAULTS = {
  pattern: 'solid', photoEffect: 'original', fontStyle: 'editorial', padding: 64, gap: 26,
  borderWidth: 5, footerHeight: 230, tagline: 'THE AGENT OF TRUTH · BISUCANDIJAY CAMPUS',
  showDate: true, showLogo: true, category: 'General', elements: [],
};
const cleanText = (value, max) => String(value || '').trim().slice(0, max);
const cleanColor = (value) => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : null;
const allowed = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
};
const sanitizeElements = (elements) => (Array.isArray(elements) ? elements : []).slice(0, 24).map((element, index) => {
  const type = allowed(element && element.type, ['text', 'emoji', 'image'], 'text');
  const imageSource = type === 'image' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(element.src || '') && String(element.src).length <= 3000000
    ? String(element.src)
    : '';
  if (type === 'image' && !imageSource) return null;
  return {
    id: cleanText(element.id, 50) || `element-${index + 1}`,
    type,
    content: type === 'image' ? '' : cleanText(element.content, type === 'emoji' ? 12 : 80),
    src: imageSource,
    x: clampNumber(element.x, 0, 100, 50),
    y: clampNumber(element.y, 0, 100, 50),
    size: clampNumber(element.size, 4, 45, type === 'text' ? 10 : 14),
    rotation: clampNumber(element.rotation, -180, 180, 0),
    opacity: clampNumber(element.opacity, 20, 100, 100),
    color: cleanColor(element.color) || '#ffffff',
  };
}).filter(Boolean);
const normalizeDesign = (design) => ({
  ...DESIGN_DEFAULTS,
  ...design,
  pattern: allowed(design.pattern || (design.checker ? 'checker' : 'solid'), ['solid', 'checker', 'stripes'], 'solid'),
  photoEffect: allowed(design.photoEffect, ['original', 'bw', 'sepia', 'vivid'], 'original'),
  fontStyle: allowed(design.fontStyle, ['editorial', 'modern'], 'editorial'),
  padding: clampNumber(design.padding, 36, 110, 64),
  gap: clampNumber(design.gap, 10, 60, 26),
  borderWidth: clampNumber(design.borderWidth, 0, 16, 5),
  footerHeight: clampNumber(design.footerHeight, 170, 340, 230),
  tagline: cleanText(design.tagline || DESIGN_DEFAULTS.tagline, 70),
  category: cleanText(design.category || 'General', 30) || 'General',
  showDate: design.showDate !== false,
  showLogo: design.showLogo !== false,
  elements: sanitizeElements(design.elements),
});

if (!fs.existsSync(DESIGNS_FILE)) fs.writeFileSync(DESIGNS_FILE, JSON.stringify(DEFAULT_DESIGNS.map(normalizeDesign), null, 2));

const readDesigns = () => JSON.parse(fs.readFileSync(DESIGNS_FILE, 'utf8')).map(normalizeDesign);
const saveDesigns = (designs) => {
  const temporaryFile = `${DESIGNS_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(designs, null, 2));
  fs.renameSync(temporaryFile, DESIGNS_FILE);
};
const makeId = (name) => {
  const slug = cleanText(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
  return `${slug}-${Date.now().toString(36)}`;
};
const sanitizeDesign = (input, id) => {
  const design = {
    id: id || makeId(input.name),
    name: cleanText(input.name, 40),
    note: cleanText(input.note, 80),
    bg: cleanColor(input.bg),
    ink: cleanColor(input.ink),
    accent: cleanColor(input.accent),
    border: cleanColor(input.border),
    pattern: allowed(input.pattern, ['solid', 'checker', 'stripes'], 'solid'),
    photoEffect: allowed(input.photoEffect, ['original', 'bw', 'sepia', 'vivid'], 'original'),
    fontStyle: allowed(input.fontStyle, ['editorial', 'modern'], 'editorial'),
    padding: clampNumber(input.padding, 36, 110, 64),
    gap: clampNumber(input.gap, 10, 60, 26),
    borderWidth: clampNumber(input.borderWidth, 0, 16, 5),
    footerHeight: clampNumber(input.footerHeight, 170, 340, 230),
    tagline: cleanText(input.tagline || DESIGN_DEFAULTS.tagline, 70),
    category: cleanText(input.category || 'General', 30) || 'General',
    showDate: input.showDate !== false,
    showLogo: input.showLogo !== false,
    elements: sanitizeElements(input.elements),
  };
  return design.name && design.bg && design.ink && design.accent && design.border ? design : null;
};

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/photos', express.static(PHOTOS_DIR));

app.get('/api/designs', (_req, res) => {
  try { res.json(readDesigns()); }
  catch (_error) { res.status(500).json({ error: 'Could not read designs.' }); }
});

app.post('/api/designs', (req, res) => {
  const design = sanitizeDesign(req.body || {});
  if (!design) return res.status(400).json({ error: 'A name and four valid colors are required.' });
  try {
    const designs = readDesigns();
    designs.push(design);
    saveDesigns(designs);
    res.status(201).json(design);
  } catch (_error) { res.status(500).json({ error: 'Could not save the design.' }); }
});

app.put('/api/designs/:id', (req, res) => {
  const id = path.basename(req.params.id);
  const design = sanitizeDesign(req.body || {}, id);
  if (!design) return res.status(400).json({ error: 'A name and four valid colors are required.' });
  try {
    const designs = readDesigns();
    const index = designs.findIndex((item) => item.id === id);
    if (index < 0) return res.status(404).json({ error: 'Design not found.' });
    designs[index] = design;
    saveDesigns(designs);
    res.json(design);
  } catch (_error) { res.status(500).json({ error: 'Could not update the design.' }); }
});

app.delete('/api/designs/:id', (req, res) => {
  const id = path.basename(req.params.id);
  try {
    const designs = readDesigns();
    if (designs.length <= 1) return res.status(400).json({ error: 'Keep at least one design.' });
    const next = designs.filter((item) => item.id !== id);
    if (next.length === designs.length) return res.status(404).json({ error: 'Design not found.' });
    saveDesigns(next);
    res.json({ ok: true });
  } catch (_error) { res.status(500).json({ error: 'Could not delete the design.' }); }
});

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Save a finished strip (JPEG data URL)
app.post('/api/save', (req, res) => {
  const { image } = req.body || {};
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(image || '');
  if (!m) return res.status(400).json({ error: 'Expected a JPEG data URL.' });
  const name = `strip-${stamp()}.jpg`;
  fs.writeFile(path.join(PHOTOS_DIR, name), Buffer.from(m[1], 'base64'), (err) => {
    if (err) return res.status(500).json({ error: 'Could not write the file.' });
    res.json({ name, url: `/photos/${name}` });
  });
});

// List saved strips, newest first
app.get('/api/photos', (_req, res) => {
  const files = fs.readdirSync(PHOTOS_DIR).filter((f) => f.endsWith('.jpg')).sort().reverse();
  res.json(files.map((f) => ({ name: f, url: `/photos/${f}` })));
});

app.delete('/api/photos/:name', (req, res) => {
  const name = path.basename(req.params.name);
  fs.unlink(path.join(PHOTOS_DIR, name), (err) => (err ? res.status(404).end() : res.json({ ok: true })));
});

app.listen(PORT, HOST, () => console.log(`Photobooth running at http://localhost:${PORT}`));
