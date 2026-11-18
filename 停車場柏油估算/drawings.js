(() => {
  'use strict';

  // The bounds are measured in the original drawing, relative to the full image.
  const sheets = {
    base: { width: 5400, height: 4017 },
    layout: { width: 5500, height: 3885 }
  };
  const views = {
    design: { sheet: 'base', bounds: [.501201, .202313, .669538, .339559], label: '設計停車場的 39 個車位及入口' },
    existing: { sheet: 'base', bounds: [.649816, .35374, .798119, .765609], label: '道路對面的 172 個車位' },
    layout: { sheet: 'layout', bounds: null, label: '全區配置原圖，標示設計停車場用地及道路兩側的位置' }
  };
  const stage = document.getElementById('drawing-stage');
  const image = document.getElementById('drawing-image');
  const status = document.getElementById('drawing-status');
  const colors = document.getElementById('original-colors');
  const larger = document.getElementById('zoom-in');
  const smaller = document.getElementById('zoom-out');
  const reset = document.getElementById('reset-view');
  const tabs = [...document.querySelectorAll('[data-drawing]')];
  const pointers = new Map();
  const maxZoom = 16;
  let selected = 'design';
  let position = { x: .5, y: .5, zoom: 1 };
  let custom = false;
  let source = '';
  let frame = 0;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }
  function sizeAt(zoom) {
    const sheet = sheets[views[selected].sheet];
    const scale = Math.min((stage.clientWidth - 8) / sheet.width, (stage.clientHeight - 8) / sheet.height) * zoom;
    return { width: sheet.width * scale, height: sheet.height * scale };
  }
  function centerWithin(value, size, viewport) {
    if (size <= viewport) return .5;
    const half = viewport / (2 * size);
    return clamp(value, half, 1 - half);
  }
  function draw() {
    frame = 0;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const size = sizeAt(position.zoom);
    position.x = centerWithin(position.x, size.width, width);
    position.y = centerWithin(position.y, size.height, height);
    image.style.width = size.width + 'px';
    image.style.height = size.height + 'px';
    image.style.transform = `translate(${width / 2 - position.x * size.width}px, ${height / 2 - position.y * size.height}px)`;
    stage.dataset.zoomed = String(position.zoom > 1.001);
    stage.dataset.manual = String(custom);
    larger.disabled = position.zoom >= maxZoom;
    smaller.disabled = position.zoom <= 1;
    reset.hidden = !custom;
  }
  function redraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function fitSelection() {
    custom = false;
    const bounds = views[selected].bounds;
    position = { x: .5, y: .5, zoom: 1 };
    if (bounds) {
      const [left, top, right, bottom] = bounds;
      const size = sizeAt(1);
      const zoom = Math.min(stage.clientWidth * .9 / ((right - left) * size.width), stage.clientHeight * .83 / ((bottom - top) * size.height));
      position = { x: (left + right) / 2, y: (top + bottom) / 2, zoom: clamp(zoom, 1, maxZoom) };
    }
    redraw();
  }
  function loadImage() {
    const path = `./assets/${views[selected].sheet}-${colors.checked ? 'original' : 'paper'}.webp`;
    image.alt = views[selected].label;
    if (source === path) return;
    source = path;
    status.hidden = false;
    status.textContent = '正在開啟原圖…';
    image.style.visibility = 'hidden';
    image.onload = () => {
      stage.dataset.ready = 'true';
      image.style.visibility = '';
      status.hidden = true;
      redraw();
    };
    image.onerror = () => {
      source = '';
      status.textContent = '原圖暫時無法開啟，可點「列印原圖」看圖檔。';
    };
    image.src = path;
  }
  function chooseView(name) {
    selected = name;
    pointers.clear();
    stage.dataset.dragging = 'false';
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.drawing === name));
    loadImage();
    fitSelection();
  }
  function relativePoint(event) {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function zoomAt(factor, before, after = before) {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const old = sizeAt(position.zoom);
    const zoom = clamp(position.zoom * factor, 1, maxZoom);
    const next = sizeAt(zoom);
    position = {
      x: position.x + (before.x - width / 2) / old.width - (after.x - width / 2) / next.width,
      y: position.y + (before.y - height / 2) / old.height - (after.y - height / 2) / next.height,
      zoom
    };
    custom = true;
    redraw();
  }
  function zoomCenter(factor) {
    zoomAt(factor, { x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
  }
  function pan(dx, dy) {
    if (position.zoom <= 1 || (!dx && !dy)) return;
    const size = sizeAt(position.zoom);
    position.x -= dx / size.width;
    position.y -= dy / size.height;
    custom = true;
    redraw();
  }
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  for (const tab of tabs) tab.addEventListener('click', () => chooseView(tab.dataset.drawing));
  colors.addEventListener('change', loadImage);
  larger.addEventListener('click', () => zoomCenter(1.5));
  smaller.addEventListener('click', () => zoomCenter(1 / 1.5));
  reset.addEventListener('click', () => { fitSelection(); tabs.find(tab => tab.dataset.drawing === selected).focus(); });
  stage.addEventListener('dblclick', event => zoomAt(1.5, relativePoint(event)));
  stage.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    zoomAt(Math.exp(-clamp(pixels, -200, 200) * .008), relativePoint(event));
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || pointers.size >= 2) return;
    pointers.set(event.pointerId, relativePoint(event));
    stage.setPointerCapture(event.pointerId);
    stage.dataset.dragging = 'true';
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const prior = [...pointers.values()];
    const previous = pointers.get(event.pointerId);
    const point = relativePoint(event);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) {
      pan(point.x - previous.x, point.y - previous.y);
    } else {
      const next = [...pointers.values()];
      const span = distance(...prior);
      if (span > 1) zoomAt(distance(...next) / span, midpoint(...prior), midpoint(...next));
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) stage.dataset.dragging = 'false';
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, release);
  stage.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const keyActions = {
      '+': () => zoomCenter(1.5), '=': () => zoomCenter(1.5), '-': () => zoomCenter(1 / 1.5),
      Home: fitSelection, '0': fitSelection,
      ArrowLeft: () => pan(54, 0), ArrowRight: () => pan(-54, 0),
      ArrowUp: () => pan(0, 54), ArrowDown: () => pan(0, -54)
    };
    if (keyActions[event.key]) { event.preventDefault(); keyActions[event.key](); }
  });
  const resize = () => { if (custom) redraw(); else fitSelection(); };
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);
  chooseView('design');
})();
