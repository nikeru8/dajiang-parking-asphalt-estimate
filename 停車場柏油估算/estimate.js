// Thickness and allowance are editable estimation assumptions. The density
// starts at the value used in Tainan's November 2026 public budget worksheet.
const asphaltEstimateDefaults = Object.freeze({
  thicknessCm: 5,
  densityTonnesM3: 2.3,
  allowancePercent: 3
});

function calculateAsphaltEstimate(input = {}) {
  const errors = {};

  function readNumber(value, key, {required = false, positive = false} = {}) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      if (required) errors[key] = '請填入數值';
      return null;
    }
    const number = typeof value === 'string' ? Number(value.trim()) : value;
    if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) {
      errors[key] = positive ? '請填入大於 0 的數值' : '請填入 0 以上的數值';
      return null;
    }
    return number;
  }

  function product(key, ...values) {
    if (values.includes(null)) return null;
    const result = values.reduce((total, value) => total * value, 1);
    if (Number.isFinite(result)) return result;
    errors[key] = '數值過大，請確認輸入單位';
    return null;
  }

  // Undefined selects the example preset. An intentionally cleared field
  // remains missing, so stale estimates cannot appear under a blank input.
  const {
    areaM2: areaInput,
    thicknessCm: thicknessInput = asphaltEstimateDefaults.thicknessCm,
    densityTonnesM3: densityInput = asphaltEstimateDefaults.densityTonnesM3,
    allowancePercent: allowanceInput = asphaltEstimateDefaults.allowancePercent,
    truckPayloadTonnes: truckInput,
    millingAreaM2: millingInput,
    rates = {}
  } = input;
  const areaM2 = readNumber(areaInput, 'areaM2', {required: true});
  const thicknessCm = readNumber(thicknessInput, 'thicknessCm', {required: true, positive: true});
  const densityTonnesM3 = readNumber(densityInput, 'densityTonnesM3', {required: true, positive: true});
  const allowancePercent = readNumber(allowanceInput, 'allowancePercent', {required: true});
  const truckPayloadTonnes = readNumber(truckInput, 'truckPayloadTonnes', {positive: true});
  const volumeM3 = product('volumeM3', areaM2, thicknessCm === null ? null : thicknessCm / 100);
  const theoreticalTonnes = product('theoreticalTonnes', volumeM3, densityTonnesM3);
  const allowanceTonnes = product('allowanceTonnes', theoreticalTonnes, allowancePercent === null ? null : allowancePercent / 100);
  const orderTonnes = product('orderTonnes', theoreticalTonnes, allowancePercent === null ? null : 1 + allowancePercent / 100);

  let truckTrips = null;
  if (orderTonnes !== null && truckPayloadTonnes !== null) {
    const loads = orderTonnes / truckPayloadTonnes;
    const nearest = Math.round(loads);
    const tolerance = 4 * Number.EPSILON * Math.max(1, loads);
    if (Number.isSafeInteger(nearest)) {
      // A calculation yielding 3.0000000000000004 still needs three trips.
      truckTrips = nearest > 0 && Math.abs(loads - nearest) <= tolerance ? nearest : Math.ceil(loads);
    } else {
      errors.truckTrips = '車次超出可計算範圍，請確認每車載重';
    }
  }

  // A blank milling quantity follows the selected worked area. A supplied
  // smaller quantity represents partial milling within this paving estimate.
  const millingBlank = millingInput == null || (typeof millingInput === 'string' && millingInput.trim() === '');
  let millingAreaM2 = millingBlank ? areaM2 : readNumber(millingInput, 'millingAreaM2');
  if (millingAreaM2 !== null && areaM2 !== null && millingAreaM2 > areaM2 + 0.005) {
    errors.millingAreaM2 = '刨除面積超過本次鋪設範圍';
    millingAreaM2 = null;
  }
  const fixedQuantity = areaM2 === null ? null : Number(areaM2 > 0);
  const workItems = [
    {key: 'material', label: '瀝青混凝土材料', unit: '噸', quantity: orderTonnes},
    {key: 'haul', label: '混合料運費', unit: '噸', quantity: orderTonnes},
    {key: 'tack', label: '黏層噴灑', unit: 'm²', quantity: areaM2},
    {key: 'lay', label: '攤鋪與滾壓', unit: 'm²', quantity: areaM2},
    {key: 'milling', label: '既有路面刨除', unit: 'm²', quantity: areaM2 === null ? null : millingAreaM2},
    {key: 'fixed', label: '進退場等固定費', unit: '式', quantity: fixedQuantity}
  ];
  const items = workItems.map(item => {
    const key = 'rates.' + item.key;
    const rate = readNumber(rates?.[item.key], key);
    const amount = product(key, item.quantity, rate);
    // Each Taiwan-dollar line is rounded to the nearest dollar. Its displayed
    // subtotal therefore agrees with the sum of the displayed line amounts.
    return {...item, rate, amount: amount === null ? null : Math.round(amount)};
  });
  const priced = items.filter(item => item.amount !== null);
  const subtotal = priced.length ? priced.reduce((sum, item) => sum + item.amount, 0) : null;
  const complete = priced.length === items.length;
  const costs = {
    items,
    pricedCount: priced.length,
    pendingKeys: items.filter(item => item.amount === null).map(item => item.key),
    status: complete ? 'complete' : priced.length ? 'partial' : 'empty',
    subtotal,
    total: complete ? subtotal : null
  };
  return {areaM2, volumeM3, theoreticalTonnes, allowanceTonnes, orderTonnes, truckTrips, costs, errors};
}

const zoneData = {"stalls":{"name":"設計區車格","help":"一般 37 格、婦幼 1 格、無障礙 1 格","swatch":"s-stalls","area":544.75,"optional":false},"aisle":{"name":"場內車道","help":"兩排車位間淨寬 7.00 m，長約 54.39 m","swatch":"s-aisle","area":380.7013040843515,"optional":false},"entry":{"name":"界內入口及銜接","help":"含兩側圓弧收邊，從用地界線接至中央車道","swatch":"s-entry","area":83.46718514674683,"optional":false},"flare":{"name":"界外道路銜接","help":"用地界外約 1 m 深，確認屬本標案再計入","swatch":"s-entry","area":12.412518800508886,"optional":true},"existing":{"name":"既有區完整車格","help":"四列共 172 格，每格 2.50 × 5.50 m","swatch":"s-existing","area":2365.0,"optional":true},"existingAisles":{"name":"既有區列間空帶","help":"依兩對車列邊線推估，現場確認用途與材質","swatch":"s-bands","area":906.6146009952978,"optional":true}};
const zoneKeys = Object.keys(zoneData);
const commonScopes = {
  design: ['stalls', 'aisle', 'entry'],
  both: ['stalls', 'aisle', 'entry', 'existing', 'existingAisles']
};
const scopeButtons = [...document.querySelectorAll('[data-scope]')];
const rateKeys = ['material', 'haul', 'tack', 'lay', 'milling', 'fixed'];
const basicKeys = ['add', 'deduct', 'thickness', 'density', 'allowance', 'payload', 'milling-area'];
const formIds = [...basicKeys, ...rateKeys.map(key => 'rate-' + key)];
const storageKey = 'parking-estimate-l01-05-v1';
const $ = id => document.getElementById(id);
const numberFormat = new Intl.NumberFormat('zh-TW', {minimumFractionDigits:2,maximumFractionDigits:2});
const moneyFormat = new Intl.NumberFormat('zh-TW', {maximumFractionDigits:0});
function qty(value) { return Number.isFinite(value) ? numberFormat.format(value) : '—'; }
function money(value) { return Number.isFinite(value) ? moneyFormat.format(value) : '—'; }
function concise(value) { return Number.isFinite(value) ? String(Number(value.toFixed(4))) : '—'; }
function show(id, value) { $(id).textContent = value; }
function raw(id) { return $(id).validity.badInput ? NaN : $(id).value.trim(); }
function feedback(id, message) {
  $(id).setAttribute('aria-invalid', message ? 'true' : 'false');
  const label = $(id + '-err');
  if (label) label.textContent = message || '';
}
let view = 'design';
let current = null;
function setView(name) {
  view = name;
  for (const key of ['design', 'context']) {
    $('plan-' + key).hidden = key !== name;
    $('legend-' + key).hidden = key !== name;
    $('tab-' + key).setAttribute('aria-pressed', String(key === name));
  }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved !== 'object') return;
    for (const id of formIds) {
      if (typeof saved[id] === 'string') $(id).value = saved[id];
    }
    for (const key of zoneKeys) {
      if (typeof saved[key] === 'boolean') $('check-' + key).checked = saved[key];
    }
    if (zoneKeys.some(key => zoneData[key].optional && $('check-' + key).checked)) $('extra-list').open = true;
    if (saved.view === 'context') setView('context');
  } catch { /* The estimator also works with browser storage disabled. */ }
}
function save() {
  const values = {view};
  for (const id of formIds) values[id] = $(id).value;
  for (const key of zoneKeys) values[key] = $('check-' + key).checked;
  try {
    localStorage.setItem(storageKey, JSON.stringify(values));
    show('save-note', '已記住這台裝置上的輸入。');
  } catch {
    show('save-note', '本次輸入保留到關閉網頁，也可以列印。');
  }
}
function getScope() {
  const checked = zoneKeys.filter(key => $('check-' + key).checked);
  const base = checked.reduce((sum,key) => sum + zoneData[key].area,0);
  const errors = {};
  function adjustment(id) {
    const value = raw(id);
    if (value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {errors[id] = '請填入 0 以上的面積';return null;}
    return n;
  }
  const add = adjustment('add');
  const deduct = adjustment('deduct');
  const available = base + (add ?? 0);
  const displayedAvailable = Math.round(available * 100) / 100;
  const deductsDisplayedArea = deduct > 0 && deduct === displayedAvailable;
  if (deduct !== null && deduct > available && !deductsDisplayedArea) errors.deduct = '扣除量大於已勾選與追加的面積';
  const area = Object.keys(errors).length ? null : deductsDisplayedArea ? 0 : Math.max(0, available - deduct);
  return {checked,base,add,deduct,area,errors};
}
function scopeDescription(s) {
  if (s.area === null) return '請打開「調整面積和用料條件」，檢查追加和扣除的面積。';
  if (!s.checked.length && !s.add) return '尚未選取鋪設範圍。可勾選圖面區域，或填入現場丈量的追加面積。';
  if (s.add || s.deduct) return '已計入現場追加或扣除的面積。';
  if (s.checked.join(',') === 'stalls,aisle,entry') return '含設計區 39 個車位、場內車道和入口。實際鋪設材質待確認。';
  if (s.checked.join(',') === 'aisle,entry') return '目前只計設計區場內車道及界內入口。若 39 個車格改鋪其他材質，可採這組面積估料。';
  if (s.checked.includes('existing') || s.checked.includes('existingAisles')) return '含對面停車區所選的範圍。對面的外圈、兩端和入口要再現場量。';
  return '目前按下方勾選範圍估算。正式報價前請對照鋪面材質圖及現場收邊位置。';
}
function readEstimate(s) {
  const rates = Object.fromEntries(rateKeys.map(k => [k, raw('rate-' + k)]));
  return calculateAsphaltEstimate({areaM2:s.area,thicknessCm:raw('thickness'),densityTonnesM3:raw('density'),
    allowancePercent:raw('allowance'),truckPayloadTonnes:raw('payload'),millingAreaM2:raw('milling-area'),rates});
}
function update() {
  const s = getScope();
  const e = readEstimate(s);
  current = {s,e};
  feedback('add',s.errors.add);
  feedback('deduct',s.errors.deduct);
  const aliases = {thickness:'thicknessCm',density:'densityTonnesM3',allowance:'allowancePercent',payload:'truckPayloadTonnes','milling-area':'millingAreaM2'};
  for (const [id,key] of Object.entries(aliases)) feedback(id,e.errors[key]);
  show('qty-general-error',[e.errors.volumeM3,e.errors.theoreticalTonnes,e.errors.allowanceTonnes,e.errors.orderTonnes,e.errors.truckTrips].filter(Boolean).join('。'));
  show('hero-area',qty(s.area)); show('scope-total',qty(s.area)); show('hero-ping',qty(s.area === null ? null : s.area * .3025));
  show('selection-desc',scopeDescription(s));
  const validThickness = !e.errors.thicknessCm && raw('thickness') !== '';
  const validAllowance = !e.errors.allowancePercent && raw('allowance') !== '';
  const validDensity = !e.errors.densityTonnesM3 && raw('density') !== '';
  show('hero-condition', validDensity && validAllowance
    ? '每立方公尺按 ' + concise(Number(raw('density'))) + ' 噸估算，含 ' + concise(Number(raw('allowance'))) + '% 備用量。'
    : '請在「調整面積和用料條件」填妥密度和備用比例。');
  show('order-tonnes',qty(e.orderTonnes)); show('volume',qty(e.volumeM3)); show('theoretical',qty(e.theoreticalTonnes)); show('allowance-tonnes',qty(e.allowanceTonnes));
  show('trips', e.truckTrips === null ? (raw('payload') === '' ? '待填每車載重' : '—') : e.truckTrips + ' 車次');
  $('trips').classList.toggle('waiting',e.truckTrips === null);
  for (const key of zoneKeys) {
    const active = s.checked.includes(key);
    for (const path of document.querySelectorAll('.plan-view [data-area="' + key + '"]')) {
      path.classList.toggle('off',!active);
      path.classList.toggle('included',active);
    }
  }
  $('legend-context').classList.toggle('has-existing',s.checked.includes('existing'));
  $('legend-context').classList.toggle('has-bands',s.checked.includes('existingAisles'));
  show('extra-count',s.checked.filter(k => zoneData[k].optional).length + ' 項計入');
  for (const button of scopeButtons) {
    const keys = commonScopes[button.dataset.scope];
    const active = s.checked.length === keys.length && keys.every(key => s.checked.includes(key));
    button.setAttribute('aria-pressed', String(active));
  }
  for (const btn of document.querySelectorAll('[data-scenario]')) {
    const t = Number(btn.dataset.scenario);
    const scenario = calculateAsphaltEstimate({areaM2:s.area,thicknessCm:t,densityTonnesM3:raw('density'),allowancePercent:raw('allowance')});
    btn.querySelector('span').textContent = qty(scenario.orderTonnes);
    btn.setAttribute('aria-pressed',String(validThickness && Number(raw('thickness')) === t));
  }
  for (const item of e.costs.items) {
    if (item.key !== 'milling') show('q-' + item.key,item.unit === '式' ? (item.quantity === null ? '—' : item.quantity) : qty(item.quantity));
    else {
      $('milling-area').placeholder = item.quantity === null ? '同鋪設面積' : qty(item.quantity);
      $('milling-area').title = '可另填刨除面積，留白時採本次鋪設面積';
    }
    feedback('rate-' + item.key,e.errors['rates.' + item.key]);
    show('amt-' + item.key,money(item.amount));
  }
  show('price-state',e.costs.pricedCount + ' / 6 項已計價');
  show('cost-caption',e.costs.status === 'partial' ? '已填項目小計（未稅）' : '未稅工程成本');
  show('cost-amount', e.costs.status === 'empty' ? (rateKeys.some(k => raw('rate-' + k) !== '') ? '待確認數量或單價' : '待填單價') : money(e.costs.subtotal));
}
function clonedPlan(name,prefix) {
  const svg = $('plan-' + name).querySelector('svg').cloneNode(true);
  const refs = new Map();
  for (const el of svg.querySelectorAll('[id]')) {
    const old = el.id; el.id = prefix + old; refs.set(old,el.id);
  }
  for (const el of svg.querySelectorAll('*')) {
    for (const attribute of ['fill','stroke','clip-path','mask']) {
      const old = el.getAttribute(attribute); if (!old) continue;
      for (const [from,to] of refs) if (old === 'url(#' + from + ')') el.setAttribute(attribute,'url(#' + to + ')');
    }
  }
  if (name === 'design') for (const g of svg.querySelectorAll('.grass-pattern')) g.style.fill = 'url(#' + prefix + 'grasshatch)';
  return svg;
}
function formatInput(id,unit) {
  if (raw(id) === '' || $(id).getAttribute('aria-invalid') === 'true') return '待填';
  const n = Number(raw(id));
  return Number.isFinite(n) ? concise(n) + ' ' + unit : '待確認';
}
function buildPrint() {
  update();
  const {s,e} = current;
  const rangeRows = zoneKeys.map(key => {
    const z=zoneData[key]; const checked=s.checked.includes(key);
    return '<tr><td>' + z.name + '</td><td>' + qty(z.area) + ' m²</td><td>' + (checked ? '計入' : '未選') + '</td></tr>';
  }).join('');
  const costRows=e.costs.items.map(item=>'<tr><td>'+item.label+'</td><td>'+(item.unit==='式'?(item.quantity??'—'):qty(item.quantity))+' '+item.unit+'</td><td>'+(item.rate===null?'待填':Number(item.rate).toLocaleString('zh-TW',{maximumFractionDigits:8}))+'</td><td>'+money(item.amount)+'</td></tr>').join('');
  const date=new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit'});
  const cap=e.costs.status==='complete'?'未稅工程成本':e.costs.status==='partial'?'已填項目未稅小計':'未稅工程成本';
  const val=e.costs.subtotal===null?'待確認單價或數量':'NT$ '+money(e.costs.subtotal);
  const combined=s.checked.includes('existing')||s.checked.includes('existingAisles');
  $('print-doc').innerHTML='<article class="paper-sheet"><header><span>桃園中壢 · 大江購物中心北側</span><span>L01-05　｜　'+date+'</span></header><h1>停車場柏油估算</h1><h2>鋪設範圍與面積</h2><div class="print-metric">本次估算 <b>'+qty(s.area)+'</b> m²　<span>約 '+qty(s.area===null?null:s.area*.3025)+' 坪</span></div><p>'+scopeDescription(s)+'</p><div class="print-map" id="print-map"></div><table><thead><tr><th>計量區域</th><th>圖面面積</th><th>本次範圍</th></tr></thead><tbody>'+rangeRows+'</tbody></table><p>現場追加 '+qty(s.add)+' m²　／　現場扣除 '+qty(s.deduct)+' m²</p><h3>圖面與界線</h3><p>設計停車場用地圖註 1,524 m²，界線實量 1,511.76 m²。車格、車道及界內入口共 1,008.92 m²。界外道路銜接約 12.41 m² 另列。</p><p>既有區有 172 個完整車格，共 2,365.00 m²。相對車格間的兩條空帶推估 906.61 m²。兩區可辨識部分約 4,280.53 m²，既有區外圈、端部及出入口仍待丈量。</p><footer>圖源　L01-05全區平面配置圖-2000.dwg、LA-baseplan.dwg<span>1 / 2</span></footer></article>'
    +'<article class="paper-sheet"><header><span>桃園中壢 · 大江購物中心北側</span><span>L01-05　｜　'+date+'</span></header><h1>柏油用量與成本</h1><h2>備料條件</h2><table><tbody><tr><td>本次鋪設面積</td><td>'+qty(s.area)+' m²</td><td>壓實厚度</td><td>'+formatInput('thickness','cm')+'</td></tr><tr><td>壓實密度</td><td>'+formatInput('density','t/m³')+'</td><td>備料加成率</td><td>'+formatInput('allowance','%')+'</td></tr><tr><td>每車實載</td><td>'+formatInput('payload','t')+'</td><td>運輸車次</td><td>'+(e.truckTrips===null?'待確認':e.truckTrips+' 車次')+'</td></tr></tbody></table>'
    +'<div class="print-metric">估算備料 <b>'+qty(e.orderTonnes)+'</b> 噸</div><p>壓實體積 '+qty(e.volumeM3)+' m³　／　理論用量 '+qty(e.theoreticalTonnes)+' 噸　／　備料加成 '+qty(e.allowanceTonnes)+' 噸</p><h2>工程成本明細（新臺幣）</h2><table><thead><tr><th>工項</th><th>數量</th><th>未稅單價</th><th>金額</th></tr></thead><tbody>'+costRows+'</tbody></table>'
    +'<div class="print-metric">'+cap+'　<b class="print-price">'+val+'</b></div><p>'+e.costs.pricedCount+' / 6 項已計價。材料及運費按備料重量估算，刨除可另填實作面積。基層、標線及另約工項另計。</p><h3>報價前核對</h3><p>請確認車格與車道的鋪面材質、壓實厚度、界外道路銜接及既有區外圍的施工界線。5 cm 與 3% 為示例，密度請採拌和廠提供的壓實單位重。</p><footer>面積 × 壓實厚度（公尺）× 壓實密度 × 備料加成係數<span>2 / 2</span></footer></article>';
  $('print-map').append(clonedPlan(combined?'context':'design','print-'));
}
for (const id of formIds) $(id).addEventListener('input',()=>{update();save();});
for (const key of zoneKeys) $('check-' + key).addEventListener('change',()=>{update();save();});
for (const name of ['design','context']) $('tab-' + name).addEventListener('click',()=>{setView(name);save();});
for (const button of scopeButtons) {
  button.addEventListener('click', () => {
    const choice = button.dataset.scope;
    for (const key of zoneKeys) $('check-' + key).checked = commonScopes[choice].includes(key);
    $('extra-list').open = choice === 'both';
    setView(choice === 'both' ? 'context' : 'design');
    update();
    save();
  });
}
for(const btn of document.querySelectorAll('[data-scenario]')) btn.addEventListener('click',()=>{$('thickness').value=btn.dataset.scenario;update();save();});
$('expand').addEventListener('click',()=>{
  show('zoom-title',view==='design'?'設計區詳圖':'兩區位置');
  $('zoom-stage').replaceChildren(clonedPlan(view,'zoom-')); $('zoom-dialog').showModal();
});
$('close-zoom').addEventListener('click',()=>$('zoom-dialog').close());
$('zoom-dialog').addEventListener('click',event=>{
  if(event.target===$('zoom-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) event.target.close();}});
$('print').addEventListener('click',()=>{buildPrint();window.print();});
window.addEventListener('beforeprint',buildPrint);
function openLinkedSection() {
  const section = document.getElementById(window.location.hash.slice(1));
  if (!section) return;
  const fold = section.closest('details');
  if (fold) fold.open = true;
  requestAnimationFrame(() => section.scrollIntoView());
}
restore();
update();
openLinkedSection();
window.addEventListener('hashchange', openLinkedSection);
