const CONFIG = {
  brandName: 'The Harpooner',
  footerText: 'THE HARPOONER',
  shots: 4,
  countdownSeconds: 3,
  pauseBetweenShots: 700,
  mirrorCaptures: true,
  cameraNameHint: 'Canon',
  resolution: { width: 1920, height: 1080 },
};

const FALLBACK_THEMES = [
  { id: 'classic', name: 'Newsprint White', note: 'Crisp and editorial', bg: '#f8f5ed', ink: '#040624', accent: '#e9e4d9', border: '#d5cfc3' },
  { id: 'pastel', name: 'Harpooner Cyan', note: 'The signature finish', bg: '#43d9e7', ink: '#030522', accent: '#b9f5f6', border: '#f1ffff' },
  { id: 'midnight', name: 'Deep Current', note: 'Navy and cinematic', bg: '#040522', ink: '#ecffff', accent: '#102e85', border: '#43d9e7' },
  { id: 'cream', name: 'Parchment', note: 'Warm campus classic', bg: '#eee8dc', ink: '#061039', accent: '#d7c9ae', border: '#fbf8f0' },
  { id: 'silver', name: 'Press Silver', note: 'Cool modern finish', bg: '#dce1e5', ink: '#071035', accent: '#bac5cd', border: '#f7fbfd' },
  { id: 'checker', name: 'Signal Burgundy', note: 'Bold quill-inspired color', bg: '#7f171d', ink: '#fff8e9', accent: '#c99f55', border: '#42dbe8', checker: true },
];

const PAPER_SIZES = {
  '4x6': { css: 'photo', width: 4, height: 6, label: '4 × 6' },
  a4: { css: 'A4', width: 8.27, height: 11.69, label: 'A4' },
  letter: { css: 'letter', width: 8.5, height: 11, label: 'Letter' },
};

const THEME_DEFAULTS = { category: 'General', pattern: 'solid', photoEffect: 'original', fontStyle: 'editorial', padding: 64, gap: 26, borderWidth: 5, footerHeight: 230, tagline: 'THE AGENT OF TRUTH · BISUCANDIJAY CAMPUS', showDate: true, showLogo: true, elements: [] };
const normalizeTheme = (theme) => ({ ...THEME_DEFAULTS, ...theme, category: String(theme.category || 'General').trim() || 'General', pattern: theme.pattern || (theme.checker ? 'checker' : 'solid'), elements: Array.isArray(theme.elements) ? theme.elements : [] });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const logoImage = new Image();
logoImage.src = 'harpooner-logo.jpg';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screens = ['select', 'cameraCheck', 'booth', 'designer'];
let stream = null;
let frames = [];
let busy = false;
let demoMode = false;
let themes = FALLBACK_THEMES.map(normalizeTheme);
let activeTheme = themes[1];
let activeThemeCategory = 'all';
const elementImageCache = new Map();
const DEVELOPER_PREVIEW_KEY = 'harpoonerDeveloperPreview';
let printPlacements = [];
let printPlacementKey = '';
let placementZ = 1;
let updateAvailable = false;
let sessionPhotoEffect = 'original';
const PHOTO_FILTERS = { original:'none', bw:'grayscale(1)', sepia:'sepia(.72) contrast(1.04)', vivid:'saturate(1.35) contrast(1.12)' };

function setUpdateState(label, state = '', disabled = false) {
  $('updateLabel').textContent = label;
  $('updateButton').className = `status-pill ${state}`.trim();
  $('updateButton').disabled = disabled;
}

async function handleUpdate() {
  const installing = updateAvailable;
  setUpdateState(installing ? 'Installing…' : 'Checking…', 'checking', true);
  try {
    const response = await fetch(installing ? '/api/update/install' : '/api/update/check', { method:'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Update check failed.');
    if (!installing && result.updateAvailable) {
      updateAvailable = true;
      setUpdateState(`Install update (${result.behind})`, 'available');
      $('updateButton').title = result.latestMessage || 'A newer GitHub version is available.';
      return;
    }
    updateAvailable = false;
    if (installing) {
      setUpdateState(result.restartRequired ? 'Updated · restart server' : 'Updated · reload', 'updated');
      $('updateButton').title = `Updated to ${result.current || 'the latest version'}.`;
      if (!result.restartRequired) setTimeout(() => window.location.reload(), 1000);
    } else {
      setUpdateState('Up to date', 'updated');
      $('updateButton').title = `Current version ${result.current || ''}`.trim();
      setTimeout(() => setUpdateState('Check updates'), 3000);
    }
  } catch (error) {
    updateAvailable = false;
    setUpdateState('Update failed', 'error');
    $('updateButton').title = error.message;
    setTimeout(() => setUpdateState('Check updates'), 5000);
  }
}

function show(name) {
  screens.forEach((id) => $(id).classList.toggle('active', id === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetThumbs() {
  $('thumbGrid').classList.toggle('three-shots', CONFIG.shots === 3);
  $('thumbGrid').innerHTML = Array.from({ length: CONFIG.shots }, (_, i) =>
    `<div class="thumb"><span>▣</span><small>Photo ${i + 1}</small></div>`
  ).join('');
  $('shotProgress').textContent = `0/${CONFIG.shots}`;
  $('shotBadge').textContent = `Photo 1 of ${CONFIG.shots}`;
  $('captureMessage').textContent = 'Ready when you are.';
}

function setSessionControlsDisabled(disabled) {
  ['sessionTimer', 'sessionShots', 'sessionFilter'].forEach((id) => { $(id).disabled = disabled; });
}

function applySessionFilter() {
  const filter = PHOTO_FILTERS[sessionPhotoEffect] || 'none';
  $('boothCam').style.filter = filter;
  const label = $('sessionFilter').selectedOptions[0]?.textContent || 'Original';
  $('liveBadge').textContent = `● Live · ${label}`;
}

function filterFrame(frame) {
  if (sessionPhotoEffect === 'original') return frame;
  const canvas = document.createElement('canvas');
  canvas.width = frame.width; canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = PHOTO_FILTERS[sessionPhotoEffect] || 'none';
  ctx.drawImage(frame, 0, 0);
  return canvas;
}

function renderCameraOptions(devices, selectedId) {
  const select = $('cameraSelect');
  select.innerHTML = devices.map((device, index) => {
    const label = device.label || `Camera ${index + 1}`;
    return `<option value="${device.deviceId}">${label}</option>`;
  }).join('');
  select.value = selectedId;
  select.disabled = devices.length < 2;
}

async function startCamera(requestedDeviceId = '') {
  const select = $('cameraSelect');
  demoMode = false;
  $('enterBoothBtn').hidden = false;
  $('enterPreviewBooth').hidden = true;
  $('enterBoothBtn').disabled = true;
  $('cam').removeAttribute('poster'); $('boothCam').removeAttribute('poster');
  $('cam').classList.remove('demo-feed'); $('boothCam').classList.remove('demo-feed');
  $('cameraLoading').classList.remove('hidden');
  $('cameraLoading').innerHTML = '<span class="camera-glyph">▣</span><strong>Starting your camera</strong><small>Allow camera access when your browser asks.</small>';
  $('cameraStatus').classList.remove('is-ready'); $('cameraStatus').textContent = 'Starting';
  select.disabled = true;
  $('camError').hidden = true;
  try {
    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
      const unsupported = new Error('This browser does not provide camera access.');
      unsupported.code = 'UNSUPPORTED_BROWSER';
      throw unsupported;
    }
    let devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    if (!devices.length || devices.every((device) => !device.label)) {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((track) => track.stop());
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    }
    const hint = CONFIG.cameraNameHint.toLowerCase();
    const pick = devices.find((device) => device.deviceId === requestedDeviceId)
      || devices.find((device) => device.label.toLowerCase().includes(hint))
      || devices[0];
    if (!pick) throw new Error('No video input was found.');
    const nextStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: pick.deviceId },
        width: { ideal: CONFIG.resolution.width },
        height: { ideal: CONFIG.resolution.height },
      },
      audio: false,
    });
    const previousStream = stream;
    stream = nextStream;
    $('cam').srcObject = stream;
    $('boothCam').srcObject = stream;
    await Promise.all([$('cam').play(), $('boothCam').play()]);
    if (previousStream) previousStream.getTracks().forEach((track) => track.stop());
    const refreshedDevices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    renderCameraOptions(refreshedDevices, pick.deviceId);
    $('cameraLoading').classList.add('hidden');
    $('cameraStatus').textContent = '● Ready';
    $('cameraStatus').classList.add('is-ready');
    $('cameraLabel').textContent = pick?.label || 'Default camera';
    $('cameraHint').textContent = 'Your camera looks good.';
    $('enterBoothBtn').disabled = false;
    return true;
  } catch (error) {
    const unsupported = error.code === 'UNSUPPORTED_BROWSER';
    $('cameraLoading').innerHTML = unsupported
      ? '<span class="camera-glyph">!</span><strong>Open in Chrome or Edge</strong><small>This in-app browser cannot access webcams.</small>'
      : '<span class="camera-glyph">!</span><strong>Camera unavailable</strong><small>Check the cable and browser camera permission.</small>';
    $('cameraStatus').textContent = 'Needs attention';
    $('camError').hidden = false;
    $('camError').textContent = unsupported
      ? 'This browser cannot detect cameras. Open http://localhost:3000 in Google Chrome or Microsoft Edge.'
      : 'No camera found. Close other apps using the webcam, check the USB cable, then refresh the camera list.';
    $('cameraHint').textContent = unsupported ? 'Use a full browser to choose the laptop camera or Canon.' : 'The booth needs a camera before it can continue.';
    console.error(error);
    select.disabled = false;
    return false;
  }
}

function createDemoFrame(index = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 1040; canvas.height = 780;
  const ctx = canvas.getContext('2d');
  const palettes = [['#0a2b70','#43d9e7'],['#3f102b','#f3a3c4'],['#071033','#7f171d'],['#102e85','#c99f55']];
  const [dark, bright] = palettes[index % palettes.length];
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, dark); gradient.addColorStop(1, '#02051d');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = .2; ctx.fillStyle = bright; ctx.beginPath(); ctx.arc(820, 160, 250, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(180, 680, 300, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = bright; ctx.lineWidth = 6; ctx.strokeRect(95, 75, 850, 630);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f8f6ef'; ctx.font = '800 66px Georgia, serif'; ctx.fillText('THE HARPOONER', 520, 350);
  ctx.fillStyle = bright; ctx.font = '800 28px Segoe UI, sans-serif'; ctx.fillText(`PREVIEW MODE · SAMPLE SHOT ${index + 1}`, 520, 410);
  ctx.fillStyle = '#aeb8cc'; ctx.font = '500 22px Segoe UI, sans-serif'; ctx.fillText('Use this screen to point and annotate layout changes', 520, 455);
  return canvas;
}

function activateDemoMode() {
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null; demoMode = true;
  const poster = createDemoFrame(0).toDataURL('image/jpeg', .9);
  $('cam').srcObject = null; $('boothCam').srcObject = null;
  $('cam').poster = poster; $('boothCam').poster = poster;
  $('cam').classList.add('demo-feed'); $('boothCam').classList.add('demo-feed');
  $('cameraLoading').classList.add('hidden'); $('camError').hidden = true;
  $('cameraStatus').textContent = '● Preview mode'; $('cameraStatus').classList.add('is-ready');
  $('cameraLabel').textContent = 'Simulated camera for annotations';
  $('cameraSelect').innerHTML = '<option>Preview camera</option>'; $('cameraSelect').disabled = true;
  $('cameraHint').textContent = 'Preview mode is ready. No hardware camera is being used.';
  $('enterBoothBtn').disabled = false; $('enterBoothBtn').hidden = true; $('enterPreviewBooth').hidden = false;
}

function grabFrame() {
  const video = $('boothCam');
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('Camera frame is not ready.');
  const targetRatio = 4 / 3;
  let sw = vw;
  let sh = vw / targetRatio;
  if (sh > vh) { sh = vh; sw = vh * targetRatio; }
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = 1040;
  canvas.height = 780;
  const ctx = canvas.getContext('2d');
  if (CONFIG.mirrorCaptures) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.filter = PHOTO_FILTERS[sessionPhotoEffect] || 'none';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawChecker(ctx, width, height, colorA, colorB) {
  const size = 80;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2) ? colorA : colorB;
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawPattern(ctx, width, height, theme) {
  if (theme.pattern === 'checker') {
    drawChecker(ctx, width, height, theme.bg, theme.accent);
  } else if (theme.pattern === 'stripes') {
    ctx.save();
    ctx.globalAlpha = .32;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 34;
    for (let x = -height; x < width + height; x += 110) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke();
    }
    ctx.restore();
  }
}

function getElementImage(source, theme) {
  if (!source) return null;
  if (elementImageCache.has(source)) return elementImageCache.get(source);
  const image = new Image();
  image.onload = () => {
    if (activeTheme?.id === theme.id && frames.length) updateStrip(activeTheme);
  };
  image.src = source;
  elementImageCache.set(source, image);
  return image;
}

async function ensureThemeImages(theme) {
  const images = (theme.elements || []).filter((element) => element.type === 'image' && element.src).map((element) => getElementImage(element.src, theme));
  await Promise.all(images.map((image) => image.complete && image.naturalWidth ? Promise.resolve() : new Promise((resolve) => {
    const finish = () => resolve();
    image.addEventListener('load', finish, { once:true });
    image.addEventListener('error', finish, { once:true });
    setTimeout(finish, 5000);
  })));
}

function drawDesignElements(ctx, width, height, theme) {
  (theme.elements || []).forEach((element) => {
    const x = width * (Number(element.x) || 0) / 100;
    const y = height * (Number(element.y) || 0) / 100;
    const size = width * (Number(element.size) || 12) / 100;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Number(element.rotation) || 0) * Math.PI / 180);
    ctx.globalAlpha = Math.max(.2, Math.min(1, (Number(element.opacity) || 100) / 100));
    if (element.type === 'photo') {
      const frameIndex = Math.max(0, Number(element.slot || 1) - 1);
      const frame = frames[frameIndex];
      if (!frame) { ctx.restore(); return; }
      if (frame) {
        const targetWidth = width * (Number(element.size) || 70) / 100;
        const targetHeight = height * (Number(element.height) || 18) / 100;
        const sourceWidth = frame.width;
        const sourceHeight = frame.height;
        const sourceRatio = sourceWidth / sourceHeight;
        const targetRatio = targetWidth / targetHeight;
        let sx = 0; let sy = 0; let sw = sourceWidth; let sh = sourceHeight;
        if (sourceRatio > targetRatio) { sw = sourceHeight * targetRatio; sx = (sourceWidth - sw) / 2; }
        else { sh = sourceWidth / targetRatio; sy = (sourceHeight - sh) / 2; }
        ctx.filter = ({ bw:'grayscale(1)', sepia:'sepia(.72) contrast(1.04)', vivid:'saturate(1.35) contrast(1.12)' })[theme.photoEffect] || 'none';
        ctx.drawImage(frame, sx, sy, sw, sh, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
        ctx.filter = 'none';
      }
    } else if (element.type === 'shape') {
      ctx.fillStyle = element.color || '#ffffff';
      if (element.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill();
      } else if (element.shape === 'line') {
        ctx.fillRect(-size / 2, -Math.max(8, size * .06) / 2, size, Math.max(8, size * .06));
      } else {
        ctx.fillRect(-size / 2, -size * .3, size, size * .6);
      }
    } else if (element.type === 'image') {
      const image = getElementImage(element.src, theme);
      if (image?.complete && image.naturalWidth) {
        const imageHeight = element.fit === 'stretch'
          ? height * (Number(element.height) || 100) / 100
          : size * image.naturalHeight / image.naturalWidth;
        ctx.drawImage(image, -size / 2, -imageHeight / 2, size, imageHeight);
      }
    } else {
      const fontFamily = element.type === 'emoji' ? '"Segoe UI Emoji","Apple Color Emoji",sans-serif' : ({ modern:'Segoe UI, sans-serif', display:'Impact, "Arial Black", sans-serif', editorial:'Georgia, serif' }[element.fontFamily || theme.fontStyle] || 'Georgia, serif');
      ctx.fillStyle = element.color || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${element.type === 'text' ? `${element.fontWeight || 800} ` : ''}${Math.max(28, size)}px ${fontFamily}`;
      ctx.fillText(element.content || (element.type === 'emoji' ? '★' : 'Your text'), 0, 0, width * .92);
    }
    ctx.restore();
  });
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0; let sy = 0; let sw = image.width; let sh = image.height;
  if (sourceRatio > targetRatio) { sw = image.height * targetRatio; sx = (image.width - sw) / 2; }
  else { sh = image.width / targetRatio; sy = (image.height - sh) / 2; }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function buildStrip(theme = activeTheme) {
  const width = 900;
  const pad = theme.padding ?? 64;
  const photoWidth = width - pad * 2;
  const standardPhotoHeight = Math.round(photoWidth * .75);
  const gap = theme.gap ?? 26;
  const footer = theme.footerHeight ?? 230;
  const borderWidth = theme.borderWidth ?? 5;
  const height = width * 3;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  drawPattern(ctx, width, height, theme);
  const hasCustomPhotoBoxes = (theme.elements || []).some((element) => element.type === 'photo');
  const photoHeight = frames.length === 3
    ? Math.floor((height - footer - pad * 2 - gap * 2) / 3)
    : standardPhotoHeight;
  if (!theme.blankCanvas && !hasCustomPhotoBoxes) frames.forEach((frame, index) => {
    const y = pad + index * (photoHeight + gap);
    ctx.fillStyle = theme.border;
    ctx.fillRect(pad - borderWidth, y - borderWidth, photoWidth + borderWidth * 2, photoHeight + borderWidth * 2);
    ctx.save();
    ctx.filter = ({ bw: 'grayscale(1)', sepia: 'sepia(.72) contrast(1.04)', vivid: 'saturate(1.35) contrast(1.12)' })[theme.photoEffect] || 'none';
    drawImageCover(ctx, frame, pad, y, photoWidth, photoHeight);
    ctx.restore();
  });
  if (!theme.blankCanvas) {
    const footerTop = height - footer;
    let footerY = footerTop + 65;
    if (theme.showLogo && logoImage.complete && logoImage.naturalWidth) {
      const logoSize = Math.min(72, Math.max(46, footer * .27));
      const logoY = footerTop + 12;
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImage, width / 2 - logoSize / 2, logoY, logoSize, logoSize);
      ctx.restore();
      footerY = logoY + logoSize + 43;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.ink;
    const fontFamily = theme.fontStyle === 'modern' ? 'Segoe UI, sans-serif' : 'Georgia, serif';
    ctx.font = `800 52px ${fontFamily}`;
    ctx.fillText(CONFIG.footerText, width / 2, footerY);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(width / 2 - 90, footerY + 14, 180, 4);
    ctx.fillStyle = theme.ink;
    ctx.font = `600 20px ${fontFamily}`;
    ctx.fillText(theme.tagline || THEME_DEFAULTS.tagline, width / 2, footerY + 49);
    if (theme.showDate) {
      ctx.font = '700 18px Segoe UI, sans-serif';
      ctx.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase(), width / 2, footerY + 82);
    }
  }
  drawDesignElements(ctx, width, height, theme);
  return canvas;
}

function updateStrip(theme) {
  activeTheme = theme;
  const dataUrl = buildStrip(theme).toDataURL('image/jpeg', .94);
  $('stripImg').src = dataUrl;
  $('downloadBtn').href = dataUrl;
  document.querySelectorAll('.theme-card').forEach((card) => card.classList.toggle('selected', card.dataset.theme === theme.id));
  return dataUrl;
}

function getPrintSetup() {
  const basePaper = PAPER_SIZES[$('paperSize').value];
  const orientation = $('paperOrientation').value;
  const landscape = orientation === 'landscape';
  const physicalWidth = landscape ? basePaper.height : basePaper.width;
  const physicalHeight = landscape ? basePaper.width : basePaper.height;
  const paper = {
    ...basePaper,
    width: physicalWidth,
    height: physicalHeight,
    label: basePaper.css === 'photo' ? `${physicalWidth} × ${physicalHeight} ${orientation}` : `${basePaper.label} ${orientation}`,
    css: basePaper.css === 'photo'
      ? `${landscape ? basePaper.height : basePaper.width}in ${landscape ? basePaper.width : basePaper.height}in`
      : `${basePaper.css} ${orientation}`,
  };
  const copies = Number($('printCopies').value);
  const requestedWidth = Number($('stripWidth').value);
  const margin = Number($('pageMargin').value);
  const gap = Number($('stripGap').value);
  const alignment = $('pageAlignment').value;
  const free = $('layoutMode').value === 'free';
  const stripImage = $('stripImg');
  const aspect = stripImage.naturalWidth && stripImage.naturalHeight ? stripImage.naturalHeight / stripImage.naturalWidth : 3;
  const width = Math.min(requestedWidth, (paper.height - margin * 2) / aspect);
  const automaticPerPage = Math.max(1, Math.floor((paper.width - margin * 2 + gap + .001) / (width + gap)));
  const perPage = free ? copies : automaticPerPage;
  const pages = free ? 1 : Math.ceil(copies / perPage);
  return { paper, copies, width, perPage, pages, margin, gap, alignment, free };
}

function ensurePrintPlacements(setup, force = false) {
  const key = `${setup.paper.label}|${setup.copies}`;
  if (!force && printPlacementKey === key && printPlacements.length === setup.copies) return;
  const columns = setup.paper.width > setup.paper.height ? setup.copies : Math.min(2, setup.copies);
  const rows = Math.ceil(setup.copies / columns);
  printPlacements = Array.from({ length: setup.copies }, (_, index) => ({
    x: ((index % columns) + .5) * 100 / columns,
    y: (Math.floor(index / columns) + .5) * 100 / rows,
    z: index + 1,
  }));
  printPlacementKey = key;
  placementZ = setup.copies + 1;
}

function updatePrintSummary() {
  const { paper, copies, width, pages } = getPrintSetup();
  const pageText = pages > 1 ? ` · ${pages} pages` : '';
  $('printSummary').textContent = `${copies} ${copies === 1 ? 'strip' : 'strips'}${pageText} · ${width.toFixed(2).replace(/\.00$/, '')} in · ${paper.label}`;
}

function updateStripWidthOptions() {
  const allowA4Width = $('paperSize').value === 'a4';
  [$('stripWidth'), $('previewStripWidth')].forEach((select) => {
    const option = select.querySelector('option[value="4"]');
    if (!option) return;
    option.hidden = !allowA4Width;
    option.disabled = !allowA4Width;
    if (!allowA4Width && select.value === '4') select.value = '3';
  });
}

function preparePrint() {
  const setup = getPrintSetup();
  const { paper, copies, width, perPage, margin, gap, alignment, free } = setup;
  let pageStyle = $('dynamicPrintStyle');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'dynamicPrintStyle';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${paper.css}; margin: 0; }`;
  const sheet = $('printSheet');
  sheet.style.setProperty('--strip-width', `${width}in`);
  sheet.style.setProperty('--page-width', `${paper.width}in`);
  sheet.style.setProperty('--page-height', `${paper.height}in`);
  sheet.replaceChildren();
  if (free) {
    ensurePrintPlacements(setup);
    const page = document.createElement('div'); page.className = 'print-page free-layout';
    printPlacements.forEach((placement) => {
      const image = new Image(); image.src = $('stripImg').src; image.alt = 'Photo strip for printing';
      image.style.width = `${width}in`;
      image.style.left = `${margin + (paper.width - margin * 2) * placement.x / 100}in`;
      image.style.top = `${margin + (paper.height - margin * 2) * placement.y / 100}in`;
      image.style.zIndex = String(placement.z);
      page.appendChild(image);
    });
    sheet.appendChild(page);
    return;
  }
  for (let start = 0; start < copies; start += perPage) {
    const page = document.createElement('div');
    page.className = 'print-page';
    page.style.padding = `${margin}in`;
    page.style.gap = `${gap}in`;
    page.style.alignItems = alignment === 'start' ? 'flex-start' : 'center';
    const count = Math.min(perPage, copies - start);
    page.replaceChildren(...Array.from({ length: count }, () => {
      const image = new Image();
      image.src = $('stripImg').src;
      image.alt = 'Photo strip for printing';
      return image;
    }));
    sheet.appendChild(page);
  }
}

function renderPrintPreview() {
  const setup = getPrintSetup();
  const { paper, copies, width, perPage, pages, margin, gap, alignment, free } = setup;
  if (free) ensurePrintPlacements(setup);
  $('printPreviewTitle').textContent = `${copies} ${copies === 1 ? 'strip' : 'strips'} on ${paper.label}`;
  $('printPreviewDetails').textContent = free
    ? `Free arrange · drag every strip anywhere on the page · ${width.toFixed(2).replace(/\.00$/, '')} in actual strip width`
    : `${pages} ${pages === 1 ? 'page' : 'pages'} · up to ${perPage} ${perPage === 1 ? 'strip' : 'strips'} per page · ${width.toFixed(2).replace(/\.00$/, '')} in actual strip width`;
  const container = $('printPreviewPages');
  container.replaceChildren();
  for (let start = 0, pageNumber = 1; start < copies; start += perPage, pageNumber += 1) {
    const wrapper = document.createElement('div'); wrapper.className = 'print-preview-page-wrap';
    const page = document.createElement('div'); page.className = 'preview-paper'; page.style.aspectRatio = `${paper.width} / ${paper.height}`;
    const pageContent = document.createElement('div'); pageContent.className = `preview-paper-content ${free ? 'free-layout' : ''}`;
    pageContent.style.inset = `${(margin / paper.height) * 100}% ${(margin / paper.width) * 100}%`;
    pageContent.style.gap = `${(gap / paper.width) * 100}%`;
    pageContent.style.alignItems = alignment === 'start' ? 'flex-start' : 'center';
    const count = Math.min(perPage, copies - start);
    pageContent.replaceChildren(...Array.from({ length: count }, (_, localIndex) => {
      const copyIndex = start + localIndex;
      const image = new Image(); image.src = $('stripImg').src; image.alt = '';
      image.style.width = `${(width / (paper.width - margin * 2)) * 100}%`;
      if (free) {
        const placement = printPlacements[copyIndex];
        image.style.left = `${placement.x}%`; image.style.top = `${placement.y}%`;
        image.style.transform = 'translate(-50%,-50%)'; image.style.zIndex = String(placement.z);
        image.setAttribute('aria-label', `Move strip ${copyIndex + 1}`);
        image.addEventListener('pointerdown', (event) => {
          event.preventDefault(); image.setPointerCapture(event.pointerId);
          placement.z = ++placementZ; image.style.zIndex = String(placement.z);
          const move = (moveEvent) => {
            const bounds = pageContent.getBoundingClientRect();
            placement.x = Math.max(0, Math.min(100, ((moveEvent.clientX - bounds.left) / bounds.width) * 100));
            placement.y = Math.max(0, Math.min(100, ((moveEvent.clientY - bounds.top) / bounds.height) * 100));
            image.style.left = `${placement.x}%`; image.style.top = `${placement.y}%`;
          };
          image.addEventListener('pointermove', move);
          image.addEventListener('pointerup', () => image.removeEventListener('pointermove', move), { once:true });
        });
      }
      return image;
    }));
    page.appendChild(pageContent);
    const label = document.createElement('small'); label.textContent = `Page ${pageNumber} · ${paper.label}`;
    wrapper.append(page, label); container.appendChild(wrapper);
  }
}

function openPrintPreview() {
  $('previewPaperSize').value = $('paperSize').value;
  $('previewOrientation').value = $('paperOrientation').value;
  $('previewCopies').value = $('printCopies').value;
  $('previewStripWidth').value = $('stripWidth').value;
  updateStripWidthOptions();
  renderPrintPreview();
  $('printPreviewDialog').showModal();
}

function renderThemes() {
  const categories = [...new Set(themes.map((theme) => theme.category || 'General'))]
    .sort((a, b) => a.localeCompare(b));
  if (activeThemeCategory !== 'all' && !categories.includes(activeThemeCategory)) activeThemeCategory = 'all';

  $('themeTabs').innerHTML = [
    { id: 'all', label: 'All designs' },
    ...categories.map((category) => ({ id: category, label: category })),
  ].map((tab) => `
    <button class="theme-tab ${activeThemeCategory === tab.id ? 'active' : ''}" type="button" data-category="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>
  `).join('');

  const visibleThemes = activeThemeCategory === 'all'
    ? themes
    : themes.filter((theme) => theme.category === activeThemeCategory);
  $('themeGrid').innerHTML = visibleThemes.map((theme) => `
    <button class="theme-card ${theme.id === activeTheme.id ? 'selected' : ''}" type="button" data-theme="${theme.id}" style="--swatch-bg:${theme.bg};--swatch-border:${theme.border};--swatch-accent:${theme.accent}" ${themeSupportsShotCount(theme) ? '' : 'disabled'}>
      <span class="theme-swatch ${theme.pattern || 'solid'}"><i></i><i></i><i></i><i></i><b></b></span>
      <strong>${escapeHtml(theme.name)}</strong><small>${escapeHtml(theme.note)}</small>
    </button>
  `).join('') || '<p class="theme-empty">No designs are saved in this event tab yet.</p>';
}

function themeSupportsShotCount(theme, shotCount = CONFIG.shots) {
  const photoSlots = (theme.elements || [])
    .filter((element) => element.type === 'photo')
    .map((element) => Number(element.slot || 1));
  return photoSlots.length === 0 || (photoSlots.length <= shotCount && Math.max(...photoSlots) <= shotCount);
}

function ensureCompatibleTheme() {
  if (themeSupportsShotCount(activeTheme)) return;
  activeTheme = themes.find((theme) => themeSupportsShotCount(theme)) || activeTheme;
}

async function loadThemes() {
  try {
    const response = await fetch('/api/designs', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load designs.');
    const savedThemes = await response.json();
    if (Array.isArray(savedThemes) && savedThemes.length) {
      const activeId = activeTheme?.id;
      themes = savedThemes.map(normalizeTheme);
      activeTheme = themes.find((theme) => theme.id === activeId) || themes[0];
      ensureCompatibleTheme();
      renderThemes();
    }
  } catch (error) {
    console.warn('Using built-in designs.', error);
  }
}

async function countdown(seconds) {
  const element = $('countdown');
  for (let i = seconds; i >= 1; i -= 1) {
    element.textContent = i;
    element.classList.remove('tick');
    void element.offsetWidth;
    element.classList.add('tick');
    await wait(1000);
  }
  element.textContent = '';
}

function showThumb(frame, index) {
  const thumb = $('thumbGrid').children[index];
  const image = new Image();
  image.src = frame.toDataURL('image/jpeg', .82);
  image.alt = `Photo ${index + 1}`;
  thumb.replaceChildren(image);
  $('shotProgress').textContent = `${index + 1}/${CONFIG.shots}`;
}

async function saveStrip(dataUrl) {
  try {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!response.ok) throw new Error('The booth could not save this strip.');
    return true;
  } catch (error) {
    console.error('Save failed', error);
    return false;
  }
}

async function runSession() {
  if (busy || (!stream && !demoMode)) return;
  busy = true;
  frames = [];
  resetThumbs();
  $('captureBtn').disabled = true;
  $('captureBtn').textContent = 'Session in progress';
  setSessionControlsDisabled(true);
  try {
    for (let i = 0; i < CONFIG.shots; i += 1) {
      $('shotBadge').textContent = `Photo ${i + 1} of ${CONFIG.shots}`;
      $('captureMessage').textContent = i === 0 ? 'Get ready — your first photo is next.' : 'Nice! Get ready for the next one.';
      await countdown(demoMode ? 1 : CONFIG.countdownSeconds);
      const frame = demoMode ? filterFrame(createDemoFrame(i)) : grabFrame();
      frames.push(frame);
      showThumb(frame, i);
      const flash = $('flash');
      flash.classList.remove('pop');
      void flash.offsetWidth;
      flash.classList.add('pop');
      $('captureMessage').textContent = `Photo ${i + 1} captured.`;
      await wait(CONFIG.pauseBetweenShots);
    }
    renderThemes();
    updateStrip(activeTheme);
    $('doneBtn').textContent = demoMode ? 'Finish preview' : 'Finish & save session';
    show('designer');
  } catch (error) {
    $('captureMessage').textContent = 'Something interrupted the session. Please try again.';
    console.error(error);
  } finally {
    busy = false;
    $('captureBtn').disabled = false;
    $('captureBtn').innerHTML = '<span>▣</span> Start photos';
    setSessionControlsDisabled(false);
  }
}

$('continueBtn').addEventListener('click', async () => { show('cameraCheck'); await startCamera(); });
$('cameraSelect').addEventListener('change', async (event) => {
  $('cameraHint').textContent = 'Switching camera…';
  await startCamera(event.target.value);
});
$('refreshCameras').addEventListener('click', async () => {
  $('cameraHint').textContent = 'Refreshing connected cameras…';
  await startCamera($('cameraSelect').value);
});
$('previewWithoutCamera').addEventListener('click', activateDemoMode);

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    if (!$('cameraCheck').classList.contains('active')) return;
    const selectedId = $('cameraSelect').value;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    renderCameraOptions(devices, selectedId);
  });
}
$('enterBoothBtn').addEventListener('click', () => { resetThumbs(); show('booth'); });
$('backToCheck').addEventListener('click', () => show('cameraCheck'));
$('captureBtn').addEventListener('click', runSession);
$('sessionTimer').addEventListener('change', (event) => {
  CONFIG.countdownSeconds = Math.max(1, Math.min(15, Number(event.target.value) || 3));
  $('sessionSummaryNote').textContent = `${CONFIG.shots} photos with a ${CONFIG.countdownSeconds}-second countdown.`;
});
$('sessionShots').addEventListener('change', (event) => {
  CONFIG.shots = Number(event.target.value) === 3 ? 3 : 4;
  $('sessionSummaryTitle').textContent = CONFIG.shots === 3 ? 'Three photos coming up' : 'Four photos coming up';
  $('sessionSummaryNote').textContent = `${CONFIG.shots} photos with a ${CONFIG.countdownSeconds}-second countdown.`;
  resetThumbs();
  ensureCompatibleTheme();
  renderThemes();
});
$('sessionFilter').addEventListener('change', (event) => {
  sessionPhotoEffect = event.target.value;
  applySessionFilter();
});
$('againBtn').addEventListener('click', () => { resetThumbs(); show('booth'); });
$('doneBtn').addEventListener('click', async () => {
  const button = $('doneBtn');
  if (demoMode) { frames = []; resetThumbs(); show('select'); button.textContent = 'Finish & save session'; return; }
  button.disabled = true; button.textContent = 'Saving final design…';
  await ensureThemeImages(activeTheme);
  const saved = await saveStrip(updateStrip(activeTheme));
  if (!saved) { button.disabled = false; button.textContent = 'Save failed — try again'; return; }
  frames = []; resetThumbs(); show('select');
  button.disabled = false; button.textContent = 'Finish & save session';
});
$('printBtn').addEventListener('click', openPrintPreview);
$('previewPaperSize').addEventListener('change', () => { $('paperSize').value = $('previewPaperSize').value; updateStripWidthOptions(); $('stripWidth').value = $('previewStripWidth').value; updatePrintSummary(); renderPrintPreview(); });
$('previewOrientation').addEventListener('change', () => { $('paperOrientation').value = $('previewOrientation').value; updatePrintSummary(); renderPrintPreview(); });
$('previewCopies').addEventListener('change', () => { $('printCopies').value = $('previewCopies').value; updatePrintSummary(); renderPrintPreview(); });
$('previewStripWidth').addEventListener('change', () => { $('stripWidth').value = $('previewStripWidth').value; updatePrintSummary(); renderPrintPreview(); });
['pageMargin','stripGap','pageAlignment'].forEach((id) => $(id).addEventListener('change', () => { updatePrintSummary(); renderPrintPreview(); }));
$('layoutMode').addEventListener('change', () => { updatePrintSummary(); renderPrintPreview(); });
$('resetArrangement').addEventListener('click', () => { ensurePrintPlacements(getPrintSetup(), true); renderPrintPreview(); });
$('closePrintPreview').addEventListener('click', () => $('printPreviewDialog').close());
$('backFromPrintPreview').addEventListener('click', () => $('printPreviewDialog').close());
$('printPreviewDialog').addEventListener('click', (event) => { if (event.target === $('printPreviewDialog')) $('printPreviewDialog').close(); });
$('confirmPrint').addEventListener('click', () => { preparePrint(); $('printPreviewDialog').close(); window.print(); });
$('paperSize').addEventListener('change', updatePrintSummary);
$('paperOrientation').addEventListener('change', updatePrintSummary);
$('printCopies').addEventListener('change', updatePrintSummary);
$('stripWidth').addEventListener('change', updatePrintSummary);
window.addEventListener('afterprint', () => $('printSheet').replaceChildren());
$('brandHome').addEventListener('click', (event) => { event.preventDefault(); if (!busy) show('select'); });
$('updateButton').addEventListener('click', handleUpdate);
$('themeGrid').addEventListener('click', (event) => {
  const card = event.target.closest('.theme-card');
  if (!card) return;
  const theme = themes.find((item) => item.id === card.dataset.theme);
  if (theme) updateStrip(theme);
});
$('themeTabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-category]');
  if (!tab) return;
  activeThemeCategory = tab.dataset.category;
  renderThemes();
});

const previewStage = new URLSearchParams(window.location.search).get('preview');
$('previewWithoutCamera').hidden = localStorage.getItem(DEVELOPER_PREVIEW_KEY) !== 'true';
window.addEventListener('storage', (event) => {
  if (event.key === DEVELOPER_PREVIEW_KEY) $('previewWithoutCamera').hidden = event.newValue !== 'true';
});
if (previewStage) {
  show('cameraCheck');
  activateDemoMode();
  if (previewStage === 'booth') { resetThumbs(); show('booth'); }
}

$('brandName').textContent = CONFIG.brandName;
renderThemes();
resetThumbs();
updatePrintSummary();
updateStripWidthOptions();
if (previewStage === 'designer' || previewStage === 'print') {
  frames = Array.from({ length: CONFIG.shots }, (_, index) => createDemoFrame(index));
  updateStrip(activeTheme);
  show('designer');
  if (previewStage === 'print') openPrintPreview();
}
loadThemes();
