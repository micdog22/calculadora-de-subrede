// Cálculos de IPv4 com inteiros sem sinal de 32 bits (sempre normalizados com >>> 0).

export class IpError extends Error {}

const ORDINAL = ['1º', '2º', '3º', '4º'];

export function parseIp(text) {
  const s = String(text ?? '').trim();
  if (!s) throw new IpError('Informe um endereço IPv4, como 192.168.1.10.');
  const parts = s.split('.');
  if (parts.length !== 4) {
    throw new IpError(`«${s}» não é um IPv4: são 4 números de 0 a 255 separados por ponto (ex.: 192.168.1.10).`);
  }
  let value = 0;
  parts.forEach((part, i) => {
    if (part === '') throw new IpError(`Falta o ${ORDINAL[i]} octeto em «${s}».`);
    if (!/^\d+$/.test(part)) throw new IpError(`O ${ORDINAL[i]} octeto de «${s}» («${part}») não é um número.`);
    if (part.length > 1 && part[0] === '0') {
      throw new IpError(`O octeto «${part}» tem zero à esquerda, o que é ambíguo (alguns sistemas leem como octal). Escreva ${Number(part)}.`);
    }
    const n = Number(part);
    if (n > 255) throw new IpError(`O ${ORDINAL[i]} octeto de «${s}» vale ${n}, mas o máximo é 255.`);
    value = value * 256 + n;
  });
  return value >>> 0;
}

export function formatIp(value) {
  const n = value >>> 0;
  return `${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

export function prefixToMask(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

// Máscara → prefixo, ou null se os bits 1 não forem contíguos.
export function maskToPrefix(mask) {
  for (let p = 0; p <= 32; p++) if (prefixToMask(p) === mask >>> 0) return p;
  return null;
}

export function parseMask(text) {
  const mask = parseIp(text);
  const prefix = maskToPrefix(mask);
  if (prefix === null) {
    const inverted = maskToPrefix((~mask) >>> 0);
    const hint = inverted !== null
      ? ` Parece uma máscara curinga (wildcard); a máscara correspondente é ${formatIp((~mask) >>> 0)} (/${inverted}).`
      : '';
    throw new IpError(`A máscara ${formatIp(mask)} não é válida: os bits 1 precisam vir todos juntos, à esquerda (ex.: 255.255.255.0).${hint}`);
  }
  return { mask, prefix };
}

// Aceita "192.168.1.10/24", "192.168.1.10/255.255.255.0" e "192.168.1.10 255.255.255.0".
export function parseCidr(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!s) throw new IpError('Informe um endereço com prefixo, como 192.168.1.10/24.');
  let m = /^([^/ ]+) ?\/ ?(\S+)$/.exec(s);
  if (!m) m = /^(\S+) (\S+)$/.exec(s);
  const ip = parseIp(m ? m[1] : s);
  if (!m) throw new IpError('Informe também o prefixo ou a máscara: 192.168.1.10/24 ou 192.168.1.10 255.255.255.0.');
  const maskText = m[2];
  let prefix;
  if (/^\/?\d{1,2}$/.test(maskText)) {
    prefix = Number(maskText.replace('/', ''));
    if (prefix > 32) throw new IpError(`O prefixo /${prefix} não existe: ele vai de /0 a /32.`);
  } else if (maskText.includes('.')) {
    prefix = parseMask(maskText).prefix;
  } else {
    throw new IpError(`«${maskText}» não é um prefixo (de 0 a 32) nem uma máscara (como 255.255.255.0).`);
  }
  return { ip, prefix };
}

export function ipClass(ip) {
  const first = ip >>> 24;
  if (first < 128) return { name: 'A', defaultPrefix: 8 };
  if (first < 192) return { name: 'B', defaultPrefix: 16 };
  if (first < 224) return { name: 'C', defaultPrefix: 24 };
  if (first < 240) return { name: 'D', defaultPrefix: null };
  return { name: 'E', defaultPrefix: null };
}

// Faixas especiais, da mais específica para a mais geral.
const SPECIAL_RANGES = [
  ['255.255.255.255/32', 'broadcast', 'Broadcast limitado', 'Enviado a todos os dispositivos da rede local; não passa por roteadores.'],
  ['0.0.0.0/8', 'this-network', 'Esta rede ("this network")', 'Usado, por exemplo, como origem antes de o dispositivo ter um endereço. Não é endereço de host.'],
  ['10.0.0.0/8', 'private', 'Privado (RFC 1918)', 'Uso em redes internas; não é roteado na internet.'],
  ['172.16.0.0/12', 'private', 'Privado (RFC 1918)', 'Uso em redes internas; não é roteado na internet.'],
  ['192.168.0.0/16', 'private', 'Privado (RFC 1918)', 'Uso em redes internas; não é roteado na internet.'],
  ['100.64.0.0/10', 'cgnat', 'CGNAT, espaço compartilhado (RFC 6598)', 'Usado por provedores entre o equipamento do cliente e o NAT da operadora.'],
  ['127.0.0.0/8', 'loopback', 'Loopback', 'O próprio computador (localhost).'],
  ['169.254.0.0/16', 'link-local', 'Link-local (RFC 3927)', 'Endereço automático quando não há DHCP (o APIPA do Windows).'],
  ['192.0.2.0/24', 'documentation', 'Documentação (RFC 5737)', 'Reservado para exemplos em documentação (TEST-NET-1).'],
  ['198.51.100.0/24', 'documentation', 'Documentação (RFC 5737)', 'Reservado para exemplos em documentação (TEST-NET-2).'],
  ['203.0.113.0/24', 'documentation', 'Documentação (RFC 5737)', 'Reservado para exemplos em documentação (TEST-NET-3).'],
  ['198.18.0.0/15', 'benchmarking', 'Benchmarking (RFC 2544)', 'Reservado para testes de desempenho de equipamentos de rede.'],
  ['224.0.0.0/4', 'multicast', 'Multicast', 'Envio de um para muitos (antiga classe D).'],
  ['240.0.0.0/4', 'reserved', 'Reservado', 'Reservado para uso futuro (antiga classe E).'],
].map(([cidr, id, label, detail]) => {
  const [ip, prefix] = cidr.split('/');
  return { cidr, id, label, detail, network: parseIp(ip), mask: prefixToMask(Number(prefix)) };
});

export function addressType(ip) {
  const n = ip >>> 0;
  const range = SPECIAL_RANGES.find((r) => ((n & r.mask) >>> 0) === r.network);
  if (range) return { id: range.id, label: range.label, detail: range.detail, range: range.cidr };
  return { id: 'public', label: 'Público', detail: 'Fora das faixas especiais: pode ser usado na internet.', range: null };
}

export function subnetInfo(ip, prefix) {
  const mask = prefixToMask(prefix);
  const wildcard = (~mask) >>> 0;
  const network = (ip & mask) >>> 0;
  const lastAddress = (network | wildcard) >>> 0;
  const total = 2 ** (32 - prefix);
  let first;
  let last;
  let usable;
  if (prefix === 32) {
    first = network;
    last = network;
    usable = 1;
  } else if (prefix === 31) {
    // RFC 3021: enlace ponto a ponto, os dois endereços são de hosts e não há broadcast.
    first = network;
    last = lastAddress;
    usable = 2;
  } else {
    first = (network + 1) >>> 0;
    last = (lastAddress - 1) >>> 0;
    usable = total - 2;
  }
  return {
    ip: ip >>> 0,
    prefix,
    mask,
    wildcard,
    network,
    broadcast: prefix <= 30 ? lastAddress : null,
    lastAddress,
    first,
    last,
    total,
    usable,
    ipClass: ipClass(ip),
    type: addressType(ip),
    isNetworkAddress: prefix <= 30 && ip >>> 0 === network,
    isBroadcastAddress: prefix <= 30 && ip >>> 0 === lastAddress,
  };
}

export function calculate(text) {
  const { ip, prefix } = parseCidr(text);
  return subnetInfo(ip, prefix);
}

export function toBinary(value) {
  return (value >>> 0).toString(2).padStart(32, '0');
}

// Divisão em sub-redes iguais ------------------------------------------------

export function bitsForCount(count) {
  let bits = 0;
  while (2 ** bits < count) bits++;
  return bits;
}

// options: { count } (quantidade desejada) ou { newPrefix }.
export function planSplit(network, prefix, options) {
  let newPrefix;
  if (options.count !== undefined) {
    const { count } = options;
    if (!Number.isInteger(count) || count < 1) throw new IpError('Informe a quantidade de sub-redes como um número inteiro a partir de 1.');
    newPrefix = prefix + bitsForCount(count);
    if (newPrefix > 32) {
      throw new IpError(`Não dá para dividir uma rede /${prefix} em ${count} sub-redes: seria preciso um prefixo /${newPrefix}, e o máximo é /32.`);
    }
  } else {
    newPrefix = options.newPrefix;
    if (!Number.isInteger(newPrefix) || newPrefix < prefix || newPrefix > 32) {
      throw new IpError(`O novo prefixo precisa estar entre /${prefix} e /32.`);
    }
  }
  return { network: (network & prefixToMask(prefix)) >>> 0, prefix, newPrefix, count: 2 ** (newPrefix - prefix) };
}

export function listSubnets(plan, limit = 256) {
  const size = 2 ** (32 - plan.newPrefix);
  const shown = Math.min(plan.count, limit);
  const list = [];
  for (let i = 0; i < shown; i++) list.push(subnetInfo((plan.network + i * size) >>> 0, plan.newPrefix));
  return list;
}

// VLSM -----------------------------------------------------------------------

// Uma necessidade por linha: "Vendas 50", "TI: 20" ou só "12".
export function parseRequirements(text) {
  const requirements = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^(.*?)[\s:=,;-]*(\d+)\s*(?:hosts?)?\s*$/i.exec(line.trim());
    if (!m) {
      errors.push(`Linha ${i + 1}: informe o nome e a quantidade de hosts (ex.: Vendas 50).`);
      return;
    }
    const hosts = Number(m[2]);
    if (!Number.isSafeInteger(hosts) || hosts < 1) {
      errors.push(`Linha ${i + 1}: a quantidade de hosts precisa ser pelo menos 1.`);
      return;
    }
    requirements.push({ name: m[1].trim() || `Sub-rede ${requirements.length + 1}`, hosts });
  });
  return { requirements, errors };
}

// Aloca da maior para a menor necessidade. Cada sub-rede reserva os endereços de rede e de broadcast (mínimo /30).
export function vlsm(network, prefix, requirements) {
  const base = (network & prefixToMask(prefix)) >>> 0;
  const available = 2 ** (32 - prefix);
  const items = requirements.map((r, index) => {
    let bits = 2;
    while (bits <= 32 && 2 ** bits < r.hosts + 2) bits++;
    return { ...r, index, bits, blockSize: 2 ** bits };
  });
  const order = [...items].sort((a, b) => b.blockSize - a.blockSize || a.index - b.index);
  let cursor = 0;
  const allocations = [];
  const unallocated = [];
  for (const item of order) {
    if (item.bits <= 32 && cursor + item.blockSize <= available) {
      const info = subnetInfo((base + cursor) >>> 0, 32 - item.bits);
      allocations.push({ name: item.name, hosts: item.hosts, ...info });
      cursor += item.blockSize;
    } else {
      unallocated.push({ name: item.name, hosts: item.hosts, blockSize: item.blockSize });
    }
  }
  const needed = items.reduce((sum, item) => sum + item.blockSize, 0);
  return { base, prefix, available, needed, used: cursor, free: available - cursor, fits: unallocated.length === 0, allocations, unallocated };
}

// Pertence à rede? -----------------------------------------------------------

export function checkMembership(ipText, networkText) {
  const ip = parseIp(ipText);
  const { ip: given, prefix } = parseCidr(networkText);
  const info = subnetInfo(given, prefix);
  const inside = ((ip & info.mask) >>> 0) === info.network;
  let role = null;
  if (inside) {
    if (prefix <= 30 && ip === info.network) role = 'network';
    else if (prefix <= 30 && ip === info.lastAddress) role = 'broadcast';
    else role = 'host';
  }
  return { ip, inside, role, network: info.network, prefix, hostBitsSet: given !== info.network };
}

// Sumarização ----------------------------------------------------------------

export function parseNetworkList(text) {
  const networks = [];
  const errors = [];
  String(text ?? '').split(/[\r\n,;]+/).forEach((item) => {
    const entry = item.trim();
    if (!entry) return;
    try {
      const { ip, prefix } = parseCidr(entry);
      const network = (ip & prefixToMask(prefix)) >>> 0;
      networks.push({ text: entry, network, prefix, hostBitsSet: network !== ip });
    } catch (err) {
      errors.push(`«${entry}»: ${err.message}`);
    }
  });
  return { networks, errors };
}

// Menor super-rede que cobre todas as redes da lista.
export function summarize(networks) {
  if (!networks.length) throw new IpError('Informe pelo menos uma rede, como 192.168.0.0/24.');
  let start = Infinity;
  let end = -Infinity;
  const intervals = networks.map(({ network, prefix }) => {
    const from = (network & prefixToMask(prefix)) >>> 0;
    const to = from + 2 ** (32 - prefix) - 1;
    start = Math.min(start, from);
    end = Math.max(end, to);
    return [from, to];
  });
  const diff = (start ^ end) >>> 0;
  const prefix = diff === 0 ? 32 : Math.clz32(diff);
  const network = (start & prefixToMask(prefix)) >>> 0;
  const size = 2 ** (32 - prefix);

  // Endereços realmente cobertos pela lista (sem contar sobreposições).
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let currentFrom = -1;
  let currentTo = -2;
  for (const [from, to] of intervals) {
    if (from > currentTo + 1) {
      if (currentTo >= currentFrom) covered += currentTo - currentFrom + 1;
      currentFrom = from;
      currentTo = to;
    } else if (to > currentTo) {
      currentTo = to;
    }
  }
  covered += currentTo - currentFrom + 1;
  return { network, prefix, size, covered, extra: size - covered, exact: covered === size };
}
