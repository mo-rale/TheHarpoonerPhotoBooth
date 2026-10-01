const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const DEVELOPER_PREVIEW_KEY = 'harpoonerDeveloperPreview';

let designs = [];
let editingId = null;
let activeDesignTab = 'all';
let designElements = [];
let selectedElementId = null;
let zoom = 1;
let gridEnabled = false;
let spacePressed = false;
let canvasPanning = false;
let undoStack = [];
let redoStack = [];
let pendingInspectorSnapshot = null;

const selectedElement = () => designElements.find((element) => element.id === selectedElementId);
const makeElementId = () => `element-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const elementSnapshot = () => clone(designElements);

function updateHistoryButtons() {
  $('undoBtn').disabled = undoStack.length === 0;
  $('redoBtn').disabled = redoStack.length === 0;
}

function remember(snapshot = elementSnapshot()) {
  undoStack.push(snapshot);
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
  setSaveState('Unsaved changes');
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(elementSnapshot());
  designElements = undoStack.pop();
  if (!designElements.some((item) => item.id === selectedElementId)) selectedElementId = designElements.at(-1)?.id || null;
  renderElementStudio();
  updateHistoryButtons();
  setSaveState('Unsaved changes');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(elementSnapshot());
  designElements = redoStack.pop();
  if (!designElements.some((item) => item.id === selectedElementId)) selectedElementId = designElements.at(-1)?.id || null;
  renderElementStudio();
  updateHistoryButtons();
  setSaveState('Unsaved changes');
}

function setSaveState(message) {
  $('saveState').textContent = message;
}

function formData() {
  return {
    name: $('designName').value,
    note: $('designNote').value,
    category: $('designCategory').value.trim() || 'General',
    bg: $('designBg').value,
    ink: $('designInk').value,
    accent: $('designAccent').value,
    border: $('designBorder').value,
    pattern: $('designPattern').value,
    photoEffect: $('designEffect').value,
    fontStyle: $('designFont').value,
    padding: Number($('designPadding').value),
    gap: Number($('designGap').value),
    borderWidth: Number($('designBorderWidth').value),
    footerHeight: Number($('designFooter').value),
    tagline: $('designTagline').value,
    showLogo: $('designShowLogo').checked,
    showDate: $('designShowDate').checked,
    elements: clone(designElements),
  };
}

function elementLabel(element) {
  if (element.type === 'image') return 'Uploaded image';
  if (element.type === 'shape') return `${element.shape || 'rectangle'} shape`;
  if (element.type === 'emoji') return `Sticker ${element.content || '★'}`;
  return element.content || 'Text';
}

function renderCanvasElements() {
  const overlay = $('elementOverlay');
  overlay.replaceChildren();
  designElements.forEach((element) => {
    const node = document.createElement('div');
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    node.className = `canvas-element ${element.id === selectedElementId ? 'selected' : ''}`;
    node.style.left = `${element.x}%`;
    node.style.top = `${element.y}%`;
    node.style.color = element.color || '#ffffff';
    node.style.opacity = String((element.opacity ?? 100) / 100);
    node.style.transform = `translate(-50%,-50%) rotate(${element.rotation || 0}deg)`;
    node.setAttribute('aria-label', `Move ${elementLabel(element)}`);

    if (element.type === 'image') {
      node.style.width = `${element.size}%`;
      const image = document.createElement('img'); image.src = element.src; image.alt = '';
      node.appendChild(image);
    } else if (element.type === 'shape') {
      node.classList.add('shape-element', element.shape || 'rectangle');
      node.style.width = `${element.size}%`;
      node.style.height = element.shape === 'line' ? `${Math.max(3, element.size * .12)}px` : `${Math.max(4, element.size * .6)}%`;
    } else {
      const family = element.type === 'emoji'
        ? '"Segoe UI Emoji","Apple Color Emoji",sans-serif'
        : ({ modern:'"Segoe UI",sans-serif', display:'Impact,"Arial Black",sans-serif', editorial:'Georgia,serif' }[element.fontFamily || 'editorial']);
      node.style.fontFamily = family;
      node.style.fontWeight = String(element.fontWeight || (element.type === 'text' ? 800 : 400));
      node.style.fontSize = `${Math.max(10, element.size * 2.2)}px`;
      node.textContent = element.content || (element.type === 'emoji' ? '★' : 'Your text');
    }

    if (element.id === selectedElementId) {
      const resizeHandle = document.createElement('span');
      resizeHandle.className = 'transform-handle resize-handle';
      resizeHandle.setAttribute('role', 'button');
      resizeHandle.setAttribute('aria-label', `Resize ${elementLabel(element)}`);
      resizeHandle.title = 'Drag to resize';

      const rotateHandle = document.createElement('span');
      rotateHandle.className = 'transform-handle rotate-handle';
      rotateHandle.setAttribute('role', 'button');
      rotateHandle.setAttribute('aria-label', `Rotate ${elementLabel(element)}`);
      rotateHandle.title = 'Drag to rotate';

      const startTransform = (event, mode) => {
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        const beforeTransform = elementSnapshot();
        const nodeBounds = node.getBoundingClientRect();
        const centerX = nodeBounds.left + nodeBounds.width / 2;
        const centerY = nodeBounds.top + nodeBounds.height / 2;
        const startDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));
        const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
        const startSize = element.size;
        const startRotation = element.rotation || 0;
        let changed = false;
        handle.setPointerCapture(event.pointerId);

        const move = (moveEvent) => {
          changed = true;
          if (mode === 'resize') {
            const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
            const maxSize = element.type === 'image' ? 100 : 60;
            element.size = Math.max(4, Math.min(maxSize, Math.round(startSize * distance / startDistance)));
            if (element.type === 'image' || element.type === 'shape') node.style.width = `${element.size}%`;
            if (element.type === 'shape') node.style.height = element.shape === 'line' ? `${Math.max(3, element.size * .12)}px` : `${Math.max(4, element.size * .6)}%`;
            if (element.type === 'text' || element.type === 'emoji') node.style.fontSize = `${Math.max(10, element.size * 2.2)}px`;
            $('elementSize').value = String(element.size);
            $('elementSizeValue').textContent = String(element.size);
            $('selectionStatus').textContent = `Size ${element.size}`;
          } else {
            const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI;
            let rotation = Math.round(startRotation + angle - startAngle);
            rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
            element.rotation = rotation;
            node.style.transform = `translate(-50%,-50%) rotate(${rotation}deg)`;
            $('elementRotation').value = String(rotation);
            $('elementRotationValue').textContent = `${rotation}°`;
            $('selectionStatus').textContent = `Rotation ${rotation}°`;
          }
        };
        const finish = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', finish);
          handle.removeEventListener('pointercancel', finish);
          if (changed) remember(beforeTransform);
          renderElementStudio();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
      };

      resizeHandle.addEventListener('pointerdown', (event) => startTransform(event, 'resize'));
      rotateHandle.addEventListener('pointerdown', (event) => startTransform(event, 'rotate'));
      node.append(rotateHandle, resizeHandle);
    }

    node.addEventListener('click', (event) => { event.stopPropagation(); selectElement(element.id); });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectElement(element.id); }
    });
    node.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.transform-handle')) return;
      event.preventDefault();
      const beforeMove = elementSnapshot();
      selectedElementId = element.id;
      node.classList.add('selected');
      node.setPointerCapture(event.pointerId);
      let moved = false;
      const move = (moveEvent) => {
        moved = true;
        const bounds = $('designPreview').getBoundingClientRect();
        let x = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
        let y = ((moveEvent.clientY - bounds.top) / bounds.height) * 100;
        if (gridEnabled) { x = Math.round(x / 5) * 5; y = Math.round(y / 5) * 5; }
        element.x = Math.max(0, Math.min(100, Math.round(x)));
        element.y = Math.max(0, Math.min(100, Math.round(y)));
        node.style.left = `${element.x}%`; node.style.top = `${element.y}%`;
        $('selectionStatus').textContent = `X ${element.x} · Y ${element.y}`;
      };
      node.addEventListener('pointermove', move);
      const finishMove = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointercancel', finishMove);
        if (moved) remember(beforeMove);
        renderElementStudio();
      };
      node.addEventListener('pointerup', finishMove, { once:true });
      node.addEventListener('pointercancel', finishMove, { once:true });
    });
    overlay.appendChild(node);
  });
}

function renderLayers() {
  const layers = $('elementLayers');
  layers.replaceChildren();
  [...designElements].reverse().forEach((element, reverseIndex) => {
    const row = document.createElement('button'); row.type = 'button';
    row.className = `layer-row ${element.id === selectedElementId ? 'active' : ''}`;
    const icon = ({ image:'▧', shape:'◆', emoji:'★', text:'T' })[element.type] || 'T';
    row.innerHTML = `<b class="layer-icon">${icon}</b><span></span><small>Layer ${designElements.length - reverseIndex}</small>`;
    row.querySelector('span').textContent = elementLabel(element);
    row.addEventListener('click', () => selectElement(element.id));
    layers.appendChild(row);
  });
  $('layerCount').textContent = String(designElements.length);
  $('elementEmpty').hidden = designElements.length > 0;
}

function renderElementInspector() {
  const element = selectedElement();
  $('elementInspector').hidden = !element;
  $('selectionStatus').textContent = element ? `${elementLabel(element)} selected` : 'Nothing selected';
  if (!element) return;
  const hasContent = element.type === 'text' || element.type === 'emoji';
  $('elementContentField').hidden = !hasContent;
  $('textStyleFields').hidden = element.type !== 'text';
  $('shapeField').hidden = element.type !== 'shape';
  $('elementContent').value = element.content || '';
  $('elementFont').value = element.fontFamily || 'editorial';
  $('elementWeight').value = String(element.fontWeight || 700);
  $('elementShape').value = element.shape || 'rectangle';
  $('elementColor').value = element.color || '#ffffff';
  $('elementX').value = String(element.x ?? 50);
  $('elementY').value = String(element.y ?? 50);
  $('elementSize').value = String(element.size ?? 14);
  $('elementSize').max = element.type === 'image' ? '100' : '60';
  $('elementRotation').value = String(element.rotation || 0);
  $('elementOpacity').value = String(element.opacity ?? 100);
  $('elementSizeValue').textContent = String(element.size ?? 14);
  $('elementRotationValue').textContent = `${element.rotation || 0}°`;
  $('elementOpacityValue').textContent = `${element.opacity ?? 100}%`;
}

function renderElementStudio() {
  renderLayers();
  renderElementInspector();
  renderCanvasElements();
}

function selectElement(id) {
  selectedElementId = id;
  renderElementStudio();
}

function addElement(type, value, extra = {}) {
  if (designElements.length >= 40) { $('status').textContent = 'A design can contain up to 40 elements.'; return; }
  remember();
  const defaults = {
    id: makeElementId(), type,
    content: type === 'image' || type === 'shape' ? '' : value,
    src: type === 'image' ? value : '',
    x: 50, y: 20 + (designElements.length % 7) * 10,
    size: type === 'text' ? 12 : type === 'shape' ? 24 : 14,
    rotation: 0, opacity: 100, color: '#ffffff',
    fontFamily: 'editorial', fontWeight: 700, shape: 'rectangle',
  };
  const element = { ...defaults, ...extra };
  designElements.push(element);
  selectedElementId = element.id;
  $('status').textContent = '';
  renderElementStudio();
  showPane('layers');
}

function updateSelectedElement() {
  const element = selectedElement(); if (!element) return;
  if (element.type === 'text' || element.type === 'emoji') element.content = $('elementContent').value;
  if (element.type === 'text') { element.fontFamily = $('elementFont').value; element.fontWeight = Number($('elementWeight').value); }
  if (element.type === 'shape') element.shape = $('elementShape').value;
  element.color = $('elementColor').value;
  element.x = Number($('elementX').value);
  element.y = Number($('elementY').value);
  element.size = Number($('elementSize').value);
  element.rotation = Number($('elementRotation').value);
  element.opacity = Number($('elementOpacity').value);
  $('elementSizeValue').textContent = String(element.size);
  $('elementRotationValue').textContent = `${element.rotation}°`;
  $('elementOpacityValue').textContent = `${element.opacity}%`;
  renderCanvasElements();
  renderLayers();
  $('selectionStatus').textContent = `${elementLabel(element)} · X ${element.x} · Y ${element.y}`;
  setSaveState('Unsaved changes');
}

function updatePreview() {
  const design = formData();
  const preview = $('designPreview');
  preview.style.setProperty('--preview-bg', design.bg);
  preview.style.setProperty('--preview-ink', design.ink);
  preview.style.setProperty('--preview-accent', design.accent);
  preview.style.setProperty('--preview-border', design.border);
  preview.className = `mini-strip ${design.pattern} ${design.photoEffect}`;
  preview.style.padding = `${Math.max(8, design.padding / 4)}px`;
  preview.style.gap = `${Math.max(4, design.gap / 3)}px`;
  preview.style.borderWidth = `${Math.min(10, Math.max(0, design.borderWidth))}px`;
  preview.style.fontFamily = design.fontStyle === 'modern' ? 'Segoe UI, sans-serif' : 'Georgia, serif';
  $('previewTagline').textContent = design.tagline || 'THE AGENT OF TRUTH · BISUCANDIJAY CAMPUS';
  $('previewLogo').hidden = !design.showLogo;
  $('previewDate').hidden = !design.showDate;
  $('previewDate').textContent = new Date().toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }).toUpperCase();
  $('documentTitle').textContent = design.name || 'Untitled';
  $('canvasLabel').textContent = design.name || 'Untitled design';
  setSaveState('Unsaved changes');
  renderCanvasElements();
}

function resetHistory() {
  undoStack = []; redoStack = []; pendingInspectorSnapshot = null; updateHistoryButtons();
}

function resetForm() {
  editingId = null;
  $('formTitle').textContent = 'New design';
  $('designForm').reset();
  $('designCategory').value = activeDesignTab === 'all' ? 'General' : activeDesignTab;
  $('designBg').value = '#43d9e7'; $('designInk').value = '#030522'; $('designAccent').value = '#b9f5f6'; $('designBorder').value = '#f1ffff';
  $('designPattern').value = 'solid'; $('designEffect').value = 'original'; $('designFont').value = 'editorial'; $('designPadding').value = '64'; $('designGap').value = '26'; $('designBorderWidth').value = '5'; $('designFooter').value = '230';
  $('designTagline').value = 'THE AGENT OF TRUTH · BISUCANDIJAY CAMPUS'; $('designShowLogo').checked = true; $('designShowDate').checked = true;
  designElements = []; selectedElementId = null; resetHistory(); renderElementStudio();
  $('status').textContent = ''; updatePreview(); setSaveState('Unsaved design'); renderDesigns();
}

function editDesign(design) {
  editingId = design.id;
  $('formTitle').textContent = `Edit design`;
  $('designName').value = design.name; $('designNote').value = design.note || ''; $('designCategory').value = design.category || 'General';
  $('designBg').value = design.bg; $('designInk').value = design.ink; $('designAccent').value = design.accent; $('designBorder').value = design.border;
  $('designPattern').value = design.pattern || (design.checker ? 'checker' : 'solid'); $('designEffect').value = design.photoEffect || 'original'; $('designFont').value = design.fontStyle || 'editorial';
  $('designPadding').value = String(design.padding || 64); $('designGap').value = String(design.gap || 26); $('designBorderWidth').value = String(design.borderWidth ?? 5); $('designFooter').value = String(design.footerHeight || 230);
  $('designTagline').value = design.tagline || 'THE AGENT OF TRUTH · BISUCANDIJAY CAMPUS'; $('designShowLogo').checked = design.showLogo !== false; $('designShowDate').checked = design.showDate !== false;
  designElements = clone(design.elements || []); selectedElementId = designElements.at(-1)?.id || null; resetHistory();
  renderElementStudio(); updatePreview(); renderDesigns(); setSaveState('Saved design');
}

function renderDesigns() {
  const grid = $('designGrid'); grid.replaceChildren(); $('designCount').textContent = designs.length;
  const categories = [...new Set(designs.map((design) => design.category || 'General'))].sort((a, b) => a.localeCompare(b));
  if (activeDesignTab !== 'all' && !categories.includes(activeDesignTab)) activeDesignTab = 'all';
  $('designTabs').replaceChildren(...['all', ...categories].map((category) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `collection-tab ${activeDesignTab === category ? 'active' : ''}`;
    button.textContent = category === 'all' ? 'All' : category; button.addEventListener('click', () => { activeDesignTab = category; renderDesigns(); }); return button;
  }));
  $('categoryOptions').replaceChildren(...categories.map((category) => { const option = document.createElement('option'); option.value = category; return option; }));
  const visible = activeDesignTab === 'all' ? designs : designs.filter((design) => (design.category || 'General') === activeDesignTab);
  visible.forEach((design) => {
    const card = document.createElement('article'); card.className = `design-card ${editingId === design.id ? 'active' : ''}`;
    card.innerHTML = '<div class="design-swatch"><i></i><i></i><i></i><i></i><b></b></div><span class="category-badge"></span><h3></h3><p></p><div class="card-actions"><button class="secondary edit" type="button">Use</button><button class="danger delete" type="button" title="Delete">×</button></div>';
    const swatch = card.querySelector('.design-swatch'); swatch.style.setProperty('--bg', design.bg); swatch.style.setProperty('--accent', design.accent); swatch.style.setProperty('--border', design.border); swatch.classList.add(design.pattern || 'solid');
    card.querySelector('h3').textContent = design.name; card.querySelector('.category-badge').textContent = design.category || 'General'; card.querySelector('p').textContent = design.note || 'Custom design';
    card.querySelector('.edit').addEventListener('click', () => editDesign(design)); card.querySelector('.delete').addEventListener('click', () => deleteDesign(design)); grid.appendChild(card);
  });
}

async function loadDesigns() {
  const response = await fetch('/api/designs', { cache:'no-store' });
  if (!response.ok) throw new Error('Could not load designs');
  designs = await response.json(); renderDesigns();
}

async function deleteDesign(design) {
  if (!confirm(`Delete “${design.name}”?`)) return;
  const response = await fetch(`/api/designs/${encodeURIComponent(design.id)}`, { method:'DELETE' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { $('status').textContent = result.error || 'Could not delete design.'; return; }
  if (editingId === design.id) resetForm();
  await loadDesigns();
}

function showPane(name) {
  document.querySelectorAll('.sidebar-tab').forEach((button) => button.classList.toggle('active', button.dataset.pane === name));
  document.querySelectorAll('.tool-pane').forEach((pane) => pane.classList.toggle('active', pane.id === `${name}Pane`));
}

function applyZoom(next, focalPoint = null) {
  const viewport = $('canvasViewport');
  const previousZoom = zoom;
  const focusX = focalPoint?.x ?? viewport.clientWidth / 2;
  const focusY = focalPoint?.y ?? viewport.clientHeight / 2;
  const contentX = viewport.scrollLeft + focusX;
  const contentY = viewport.scrollTop + focusY;
  zoom = Math.max(.4, Math.min(3, next));
  $('designPreview').style.transform = `scale(${zoom})`;
  $('canvasStage').style.width = `${220 * zoom}px`; $('canvasStage').style.height = `${650 * zoom}px`;
  $('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
  if (previousZoom !== zoom) {
    requestAnimationFrame(() => {
      const ratio = zoom / previousZoom;
      viewport.scrollLeft = contentX * ratio - focusX;
      viewport.scrollTop = contentY * ratio - focusY;
    });
  }
}

function alignSelected(alignment) {
  const element = selectedElement(); if (!element) return;
  remember();
  if (alignment === 'left') element.x = 5;
  if (alignment === 'center') element.x = 50;
  if (alignment === 'right') element.x = 95;
  if (alignment === 'top') element.y = 5;
  if (alignment === 'middle') element.y = 50;
  if (alignment === 'bottom') element.y = 95;
  renderElementStudio();
}

function duplicateSelected() {
  const element = selectedElement(); if (!element) return;
  remember(); const copy = { ...clone(element), id:makeElementId(), x:Math.min(100, element.x + 5), y:Math.min(100, element.y + 5) };
  designElements.push(copy); selectedElementId = copy.id; renderElementStudio();
}

function removeSelected() {
  if (!selectedElement()) return;
  remember(); designElements = designElements.filter((item) => item.id !== selectedElementId); selectedElementId = designElements.at(-1)?.id || null; renderElementStudio();
}

function moveLayer(direction) {
  const index = designElements.findIndex((element) => element.id === selectedElementId); if (index < 0) return;
  const target = index + direction; if (target < 0 || target >= designElements.length) return;
  remember(); [designElements[index], designElements[target]] = [designElements[target], designElements[index]]; renderElementStudio();
}

async function loadPhotos() {
  const list = await (await fetch('/api/photos')).json(); $('photoCount').textContent = list.length;
  const grid = $('photoGrid'); grid.replaceChildren();
  if (!list.length) { grid.innerHTML = '<p class="empty-state">No saved strips yet.</p>'; return; }
  list.forEach((photo) => {
    const figure = document.createElement('figure'); const open = document.createElement('button'); open.type = 'button'; open.className = 'photo-open';
    const image = document.createElement('img'); image.src = photo.url; image.loading = 'lazy'; image.alt = '';
    const caption = document.createElement('figcaption'); const label = document.createElement('span'); label.textContent = photo.name.replace('strip-', '').replace('.jpg', '');
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
    remove.addEventListener('click', async () => { if (confirm('Delete this strip?')) { await fetch(`/api/photos/${encodeURIComponent(photo.name)}`, { method:'DELETE' }); loadPhotos(); } });
    open.addEventListener('click', () => { $('photoPreviewImage').src = photo.url; $('photoPreviewName').textContent = label.textContent; $('photoPreview').showModal(); });
    open.appendChild(image); caption.append(label, remove); figure.append(open, caption); grid.appendChild(figure);
  });
}

$('developerPreviewToggle').checked = localStorage.getItem(DEVELOPER_PREVIEW_KEY) === 'true';
$('developerPreviewToggle').addEventListener('change', (event) => localStorage.setItem(DEVELOPER_PREVIEW_KEY, String(event.target.checked)));
document.querySelectorAll('.sidebar-tab').forEach((button) => button.addEventListener('click', () => showPane(button.dataset.pane)));
document.querySelectorAll('[data-text-preset]').forEach((button) => button.addEventListener('click', () => {
  const presets = { heading:{ content:'Add a heading', size:17, fontWeight:900, fontFamily:'display', y:18 }, subheading:{ content:'Add a subheading', size:11, fontWeight:700, y:27 }, body:{ content:'Add body text', size:8, fontWeight:400, fontFamily:'modern', y:35 } };
  const preset = presets[button.dataset.textPreset]; addElement('text', preset.content, preset);
}));
document.querySelectorAll('[data-shape]').forEach((button) => button.addEventListener('click', () => addElement('shape', '', { shape:button.dataset.shape, color:$('designAccent').value, size:button.dataset.shape === 'line' ? 35 : 24 })));
document.querySelectorAll('[data-sticker]').forEach((button) => button.addEventListener('click', () => addElement('emoji', button.dataset.sticker)));
$('elementUpload').addEventListener('change', (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2000000) { $('status').textContent = 'Use a PNG, JPG, or WebP image smaller than 2 MB.'; event.target.value = ''; return; }
  const reader = new FileReader(); reader.onload = () => { addElement('image', reader.result, { size:25 }); event.target.value = ''; }; reader.readAsDataURL(file);
});
$('canvaImport').addEventListener('change', (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2000000) {
    $('status').textContent = 'Export the Canva design as a PNG, JPG, or WebP smaller than 2 MB.';
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const ratio = image.naturalWidth / image.naturalHeight;
      addElement('image', reader.result, { size:100, x:50, y:50, rotation:0, opacity:100 });
      $('status').textContent = Math.abs(ratio - (2 / 6)) < .08
        ? 'Canva overlay imported at full-strip size.'
        : 'Imported. For a full-strip fit, export from Canva using a 2:6 page ratio.';
      event.target.value = '';
    };
    image.onerror = () => { $('status').textContent = 'Could not read that Canva export.'; event.target.value = ''; };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

$('designForm').addEventListener('input', updatePreview);
$('designForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = editingId ? `/api/designs/${encodeURIComponent(editingId)}` : '/api/designs';
  $('status').textContent = 'Saving…';
  const response = await fetch(url, { method:editingId ? 'PUT' : 'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(formData()) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { $('status').textContent = result.error || 'Could not save design.'; return; }
  editingId = result.id; designElements = clone(result.elements || []); selectedElementId = designElements.at(-1)?.id || null; resetHistory();
  $('status').textContent = 'Saved'; setSaveState('Saved design'); $('formTitle').textContent = 'Edit design'; await loadDesigns(); renderElementStudio();
});

const inspectorInputs = ['elementContent','elementFont','elementWeight','elementShape','elementColor','elementX','elementY','elementSize','elementRotation','elementOpacity'];
inspectorInputs.forEach((id) => {
  $(id).addEventListener('focus', () => { if (!pendingInspectorSnapshot) pendingInspectorSnapshot = elementSnapshot(); });
  $(id).addEventListener('input', updateSelectedElement);
  $(id).addEventListener('change', () => { if (pendingInspectorSnapshot) { remember(pendingInspectorSnapshot); pendingInspectorSnapshot = null; } renderElementStudio(); });
});
document.querySelectorAll('[data-align]').forEach((button) => button.addEventListener('click', () => alignSelected(button.dataset.align)));
$('elementBack').addEventListener('click', () => moveLayer(-1)); $('elementForward').addEventListener('click', () => moveLayer(1));
$('elementDuplicate').addEventListener('click', duplicateSelected); $('elementRemove').addEventListener('click', removeSelected);
$('newDesign').addEventListener('click', resetForm); $('cancelEdit').addEventListener('click', resetForm);
$('undoBtn').addEventListener('click', undo); $('redoBtn').addEventListener('click', redo);
$('zoomIn').addEventListener('click', () => applyZoom(zoom + .1)); $('zoomOut').addEventListener('click', () => applyZoom(zoom - .1)); $('zoomFit').addEventListener('click', () => applyZoom(.82));
$('toggleGrid').addEventListener('click', () => { gridEnabled = !gridEnabled; $('canvasViewport').classList.toggle('show-grid', gridEnabled); $('toggleGrid').setAttribute('aria-pressed', String(gridEnabled)); });
$('elementOverlay').addEventListener('click', (event) => { if (event.target === $('elementOverlay')) { selectedElementId = null; renderElementStudio(); } });
$('photoPreviewClose').addEventListener('click', () => $('photoPreview').close()); $('photoPreview').addEventListener('click', (event) => { if (event.target === $('photoPreview')) $('photoPreview').close(); });

$('canvasViewport').addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const bounds = $('canvasViewport').getBoundingClientRect();
    applyZoom(zoom + (event.deltaY < 0 ? .1 : -.1), { x:event.clientX - bounds.left, y:event.clientY - bounds.top });
  } else if (event.shiftKey) {
    event.preventDefault();
    $('canvasViewport').scrollLeft += event.deltaY || event.deltaX;
  }
}, { passive:false });

$('canvasViewport').addEventListener('pointerdown', (event) => {
  const emptyCanvas = event.target === $('canvasViewport') || event.target === $('canvasStage');
  if (!(event.button === 1 || spacePressed || (event.button === 0 && emptyCanvas))) return;
  event.preventDefault();
  const viewport = $('canvasViewport');
  canvasPanning = true;
  viewport.classList.add('panning');
  viewport.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = viewport.scrollLeft;
  const startTop = viewport.scrollTop;
  let moved = false;
  const pan = (moveEvent) => {
    moved = true;
    viewport.scrollLeft = startLeft - (moveEvent.clientX - startX);
    viewport.scrollTop = startTop - (moveEvent.clientY - startY);
  };
  const finishPan = () => {
    viewport.removeEventListener('pointermove', pan);
    viewport.removeEventListener('pointerup', finishPan);
    viewport.removeEventListener('pointercancel', finishPan);
    viewport.classList.remove('panning');
    canvasPanning = false;
    if (!spacePressed) viewport.classList.remove('pan-ready');
    if (!moved && emptyCanvas) { selectedElementId = null; renderElementStudio(); }
  };
  viewport.addEventListener('pointermove', pan);
  viewport.addEventListener('pointerup', finishPan);
  viewport.addEventListener('pointercancel', finishPan);
});

document.addEventListener('keydown', (event) => {
  const editingText = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (event.code === 'Space' && !editingText) { spacePressed = true; $('canvasViewport').classList.add('pan-ready'); event.preventDefault(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
  if (editingText || !selectedElement()) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected(); return; }
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); return; }
  const movement = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[event.key];
  if (movement) { event.preventDefault(); const before = elementSnapshot(); const element = selectedElement(); const step = event.shiftKey ? 5 : 1; element.x = Math.max(0, Math.min(100, element.x + movement[0] * step)); element.y = Math.max(0, Math.min(100, element.y + movement[1] * step)); remember(before); renderElementStudio(); }
});
document.addEventListener('keyup', (event) => { if (event.code === 'Space') { spacePressed = false; if (!canvasPanning) $('canvasViewport').classList.remove('pan-ready'); } });
window.addEventListener('blur', () => { spacePressed = false; canvasPanning = false; $('canvasViewport').classList.remove('pan-ready', 'panning'); });

resetForm();
applyZoom(.82);
loadDesigns().catch(() => { $('status').textContent = 'Could not load designs. Restart the booth server.'; });
loadPhotos().catch(() => { $('photoCount').textContent = '—'; });
