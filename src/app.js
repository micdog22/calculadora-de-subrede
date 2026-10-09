import {
  parseCidr, subnetInfo, formatIp, toBinary, planSplit, listSubnets, parseRequirements, vlsm, checkMembership,
  parseNetworkList, summarize, prefixToMask, IpError,
} from './ipv4.js';

const $ = (id) => document.getElementById(id);
const addressInput = $('address');
const calcError = $('calc-error');
const calcResult = $('calc-result');
const splitBase = $('split-base');
const splitCount = $('split-count');
const splitPrefix = $('split-prefix');
const splitResult = $('split-result');
const vlsmBase = $('vlsm-base');
const vlsmInput = $('vlsm-input');
const vlsmResult = $('vlsm-result');
const memberIp = $('member-ip');
const memberNet = $('member-net');
const memberResult = $('member-result');
const sumInput = $('sum-input');
const sumResult = $('sum-result');

const STORAGE_KEY = 'calculadora-de-subrede:estado';
const DEFAULTS = {
  address: '192.168.1.10/24',
  splitMode: 'count',
  splitCount: '4',
  splitPrefix: '26',
  vlsm: 'Vendas 100\nTI 50\nRH 20\nLink com a filial 2',
  memberIp: '192.168.1.77',
  memberNet: '192.168.1.0/24',
  sum: '192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24',
};
const MAX_ROWS = 256;
const int = new Intl.NumberFormat('pt-BR');
let base = null; // { network, prefix }

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

const message = (err) => (err instanceof IpError ? err.message : 'Não foi possível calcular com esses dados.');
const cidrText = (network, prefix) => `${formatIp(network)}/${prefix}`;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      address: addressInput.value,
      splitMode: document.querySelector('input[name="split-mode"]:checked').value,
      splitCount: splitCount.value,
      splitPrefix: splitPrefix.value,
      vlsm: vlsmInput.value,
      memberIp: memberIp.value,
      memberNet: memberNet.value,
      sum: sumInput.value,
    }));
  } catch {
    // sem armazenamento disponível
  }
}

// Calculadora principal --------------------------------------------------------

function stat(label, value, small = null, highlight = false) {
  return el('div', { class: `stat${highlight ? ' highlight' : ''}` }, el('dt', {}, label), el('dd', {}, value, small ? el('small', {}, small) : null));
}

function binaryRow(label, value, prefix) {
  const bits = toBinary(value);
  const cell = el('td');
  for (let i = 0; i < 32; i++) {
    if (i > 0 && i % 8 === 0) cell.append(el('span', { class: 'dot' }, '.'));
    if (i === prefix && prefix > 0 && prefix < 32) cell.append(el('span', { class: 'cut', title: `limite do prefixo /${prefix}` }));
    cell.append(el('span', { class: `bit ${i < prefix ? 'net' : 'host'}` }, bits[i]));
  }
  return el('tr', {}, el('th', { scope: 'row' }, label), cell);
}

function renderCalculation(info) {
  const { prefix } = info;
  const noBroadcast = prefix === 31 ? 'não se aplica (/31, RFC 3021)' : 'não se aplica (/32)';
  const classSmall = info.ipClass.defaultPrefix
    ? `histórica; máscara padrão /${info.ipClass.defaultPrefix}`
    : info.ipClass.name === 'D' ? 'histórica; multicast' : 'histórica; reservada';
  const stats = el('dl', { class: 'stats' },
    stat('Rede', cidrText(info.network, prefix), null, true),
    stat('Broadcast', info.broadcast === null ? noBroadcast : formatIp(info.broadcast), null, true),
    stat('Primeiro host', formatIp(info.first)),
    stat('Último host', formatIp(info.last)),
    stat('Hosts utilizáveis', int.format(info.usable)),
    stat('Total de endereços', int.format(info.total)),
    stat('Máscara', formatIp(info.mask), `/${prefix}`),
    stat('Curinga (wildcard)', formatIp(info.wildcard)),
    stat('Classe', info.ipClass.name, classSmall),
  );
  const notes = [];
  if (info.isNetworkAddress) notes.push(`${formatIp(info.ip)} é o próprio endereço da rede: não pode ser usado por um host.`);
  if (info.isBroadcastAddress) notes.push(`${formatIp(info.ip)} é o endereço de broadcast: não pode ser usado por um host.`);
  if (prefix === 31) notes.push('Em uma /31 não há endereço de rede nem de broadcast: os dois endereços ficam com as pontas de um enlace ponto a ponto (RFC 3021).');
  if (prefix === 32) notes.push('Uma /32 representa um único endereço, como em uma rota para um host.');

  const typeBox = el('div', { class: 'type-box' },
    el('strong', {}, `Tipo do endereço: ${info.type.label}`),
    el('p', { class: 'small' }, info.type.range ? `${info.type.detail} Faixa ${info.type.range}.` : info.type.detail));

  const lastLabel = prefix <= 30 ? 'Broadcast' : 'Último endereço';
  const binary = el('div', { class: 'binary-wrap', tabindex: '0', role: 'region', 'aria-label': 'Visão binária' },
    el('table', { class: 'binary' },
      el('caption', { class: 'visually-hidden' }, `Endereços em binário; os ${prefix} primeiros bits são da rede`),
      el('tbody', {},
        binaryRow('Endereço', info.ip, prefix),
        binaryRow('Máscara', info.mask, prefix),
        binaryRow('Rede', info.network, prefix),
        binaryRow(lastLabel, info.lastAddress, prefix))));
  const legend = el('p', { class: 'legend' },
    el('span', { class: 'l-net' }, `bits de rede (${prefix})`),
    el('span', { class: 'l-host' }, `bits de host (${32 - prefix})`));

  const notesList = notes.length ? el('ul', { class: 'notes small' }, ...notes.map((n) => el('li', {}, n))) : null;
  calcResult.replaceChildren(...[stats, typeBox, notesList, binary, legend].filter(Boolean));
}

function updateCalculation() {
  try {
    const { ip, prefix } = parseCidr(addressInput.value);
    const info = subnetInfo(ip, prefix);
    base = { network: info.network, prefix };
    addressInput.setAttribute('aria-invalid', 'false');
    calcError.textContent = '';
    renderCalculation(info);
  } catch (err) {
    base = null;
    addressInput.setAttribute('aria-invalid', 'true');
    calcError.textContent = message(err);
    calcResult.replaceChildren();
  }
  const baseText = base ? cidrText(base.network, base.prefix) : '-';
  splitBase.textContent = baseText;
  vlsmBase.textContent = baseText;
  updateSplit();
  updateVlsm();
  saveState();
}

// Divisão ----------------------------------------------------------------------

function hostRange(info) {
  return info.first === info.last ? formatIp(info.first) : `${formatIp(info.first)}-${formatIp(info.last)}`;
}

function updateSplit() {
  if (!base) {
    splitResult.replaceChildren(el('p', { class: 'muted' }, 'Corrija o endereço lá em cima para dividir a rede.'));
    return;
  }
  const mode = document.querySelector('input[name="split-mode"]:checked').value;
  try {
    const value = Number(mode === 'count' ? splitCount.value : splitPrefix.value);
    const plan = planSplit(base.network, base.prefix, mode === 'count' ? { count: value } : { newPrefix: value });
    const subnets = listSubnets(plan, MAX_ROWS);
    const per = subnets[0];
    const summary = mode === 'count' && plan.count !== value
      ? `Para ${int.format(value)} sub-redes iguais é preciso dividir em ${int.format(plan.count)} (potência de 2): `
      : `${int.format(plan.count)} ${plan.count === 1 ? 'sub-rede' : 'sub-redes'}: `;
    const rows = subnets.map((s, i) => el('tr', {},
      el('td', {}, int.format(i + 1)),
      el('td', { class: 'mono' }, cidrText(s.network, s.prefix)),
      el('td', { class: 'mono' }, hostRange(s)),
      el('td', { class: 'mono' }, s.broadcast === null ? '-' : formatIp(s.broadcast)),
      el('td', {}, int.format(s.usable))));
    const table = el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Sub-redes' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...['#', 'Sub-rede', 'Hosts', 'Broadcast', 'Hosts úteis'].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, ...rows)));
    const more = plan.count > subnets.length
      ? el('p', { class: 'muted small' }, `Mostrando as primeiras ${int.format(subnets.length)} de ${int.format(plan.count)} sub-redes.`)
      : null;
    const line = el('p', { class: 'summary-line' }, summary, el('strong', {}, `/${plan.newPrefix}`), ` (máscara ${formatIp(per.mask)}), com ${int.format(per.usable)} hosts úteis em cada.`);
    splitResult.replaceChildren(...[line, table, more].filter(Boolean));
  } catch (err) {
    splitResult.replaceChildren(el('p', { class: 'error-text' }, message(err)));
  }
}

// VLSM ---------------------------------------------------------------------------

function updateVlsm() {
  if (!base) {
    vlsmResult.replaceChildren(el('p', { class: 'muted' }, 'Corrija o endereço lá em cima para planejar o VLSM.'));
    return;
  }
  const { requirements, errors } = parseRequirements(vlsmInput.value);
  const parts = errors.map((e) => el('p', { class: 'error-text' }, e));
  if (!requirements.length) {
    vlsmResult.replaceChildren(...parts, el('p', { class: 'muted' }, 'Informe pelo menos uma necessidade, como «Vendas 50».'));
    return;
  }
  const result = vlsm(base.network, base.prefix, requirements);
  if (result.allocations.length) {
    const rows = result.allocations.map((a) => el('tr', {},
      el('td', {}, a.name),
      el('td', {}, int.format(a.hosts)),
      el('td', {}, int.format(a.usable)),
      el('td', { class: 'mono' }, cidrText(a.network, a.prefix)),
      el('td', { class: 'mono' }, formatIp(a.mask)),
      el('td', { class: 'mono' }, hostRange(a)),
      el('td', { class: 'mono' }, formatIp(a.broadcast))));
    parts.push(el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Plano VLSM' },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, ...['Nome', 'Pedidos', 'Úteis', 'Sub-rede', 'Máscara', 'Hosts', 'Broadcast'].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, ...rows))));
  }
  const usage = `Usados ${int.format(result.used)} de ${int.format(result.available)} endereços; sobram ${int.format(result.free)}.`;
  if (result.fits) {
    parts.push(el('div', { class: 'answer' }, el('div', { class: 'box yes' }, el('strong', {}, '✓ Tudo coube'), el('p', {}, usage))));
  } else {
    const missing = result.unallocated.map((u) => `${u.name} (${int.format(u.hosts)} ${u.hosts === 1 ? 'host' : 'hosts'})`).join(', ');
    parts.push(el('div', { class: 'answer' }, el('div', { class: 'box no' },
      el('strong', {}, '✗ Não cabe tudo nesta rede'),
      el('p', {}, `As necessidades somam ${int.format(result.needed)} endereços, e a rede /${base.prefix} tem ${int.format(result.available)}. Ficou de fora: ${missing}.`),
      el('p', { class: 'small' }, `${usage} Use uma rede base maior (prefixo menor) ou reduza os pedidos.`))));
  }
  vlsmResult.replaceChildren(...parts);
}

// Pertence à rede? ------------------------------------------------------------------

function updateMembership() {
  try {
    const r = checkMembership(memberIp.value, memberNet.value);
    const ipText = formatIp(r.ip);
    const netText = cidrText(r.network, r.prefix);
    const extra = r.hostBitsSet ? el('p', { class: 'small' }, `A rede informada tinha bits de host ligados; ela foi considerada como ${netText}.`) : null;
    let box;
    if (!r.inside) {
      box = el('div', { class: 'box no' }, el('strong', {}, `✗ Não: ${ipText} não pertence a ${netText}`), extra);
    } else if (r.role === 'host') {
      box = el('div', { class: 'box yes' }, el('strong', {}, `✓ Sim: ${ipText} pertence a ${netText}`), el('p', {}, 'E pode ser usado por um host.'), extra);
    } else {
      const what = r.role === 'network' ? 'o endereço da própria rede' : 'o endereço de broadcast';
      box = el('div', { class: 'box warn' }, el('strong', {}, `Sim, ${ipText} está em ${netText}`), el('p', {}, `Mas é ${what}, que não pode ser usado por um host.`), extra);
    }
    memberResult.replaceChildren(box);
  } catch (err) {
    memberResult.replaceChildren(el('p', { class: 'error-text' }, message(err)));
  }
  saveState();
}

// Sumarização --------------------------------------------------------------------

function updateSummary() {
  const { networks, errors } = parseNetworkList(sumInput.value);
  const parts = errors.map((e) => el('p', { class: 'error-text' }, e));
  if (!networks.length) {
    sumResult.replaceChildren(...parts, el('p', { class: 'muted' }, 'Informe as redes a resumir, como 192.168.0.0/24.'));
    saveState();
    return;
  }
  const r = summarize(networks);
  const result = cidrText(r.network, r.prefix);
  const detail = r.exact
    ? 'Resumo exato: a super-rede cobre só os endereços das redes listadas.'
    : `Atenção: a super-rede também inclui ${int.format(r.extra)} ${r.extra === 1 ? 'endereço que não está' : 'endereços que não estão'} nas redes listadas.`;
  const adjusted = networks.filter((n) => n.hostBitsSet).map((n) => `${n.text} → ${cidrText(n.network, n.prefix)}`);
  parts.push(el('div', { class: `box ${r.exact ? 'yes' : 'warn'}` },
    el('strong', {}, `Super-rede: ${result}`),
    el('p', {}, `${int.format(r.size)} endereços, máscara ${formatIp(prefixToMask(r.prefix))}. ${detail}`),
    adjusted.length ? el('p', { class: 'small' }, `Ajustadas para o endereço de rede: ${adjusted.join('; ')}.`) : null));
  sumResult.replaceChildren(...parts);
  saveState();
}

// Eventos ------------------------------------------------------------------------------

addressInput.addEventListener('input', updateCalculation);
for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    addressInput.value = button.dataset.example;
    updateCalculation();
    addressInput.focus();
  });
}
for (const input of [splitCount, splitPrefix]) {
  input.addEventListener('input', () => {
    const radio = $(input === splitCount ? 'split-by-count' : 'split-by-prefix');
    radio.checked = true;
    updateSplit();
    saveState();
  });
}
for (const radio of document.querySelectorAll('input[name="split-mode"]')) {
  radio.addEventListener('change', () => {
    updateSplit();
    saveState();
  });
}
vlsmInput.addEventListener('input', () => {
  updateVlsm();
  saveState();
});
memberIp.addEventListener('input', updateMembership);
memberNet.addEventListener('input', updateMembership);
sumInput.addEventListener('input', updateSummary);

const state = loadState();
addressInput.value = state.address;
$(state.splitMode === 'prefix' ? 'split-by-prefix' : 'split-by-count').checked = true;
splitCount.value = state.splitCount;
splitPrefix.value = state.splitPrefix;
vlsmInput.value = state.vlsm;
memberIp.value = state.memberIp;
memberNet.value = state.memberNet;
sumInput.value = state.sum;
updateCalculation();
updateMembership();
updateSummary();
