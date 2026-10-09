import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIp, formatIp, prefixToMask, maskToPrefix, parseMask, parseCidr, calculate, ipClass, addressType, toBinary, IpError,
} from '../src/ipv4.js';

const show = (info) => ({
  network: formatIp(info.network),
  broadcast: info.broadcast === null ? null : formatIp(info.broadcast),
  first: formatIp(info.first),
  last: formatIp(info.last),
  mask: formatIp(info.mask),
  wildcard: formatIp(info.wildcard),
  total: info.total,
  usable: info.usable,
});

test('IPv4 ↔ inteiro sem sinal', () => {
  assert.equal(parseIp('0.0.0.0'), 0);
  assert.equal(parseIp('255.255.255.255'), 4294967295);
  assert.equal(parseIp('192.168.1.10'), 3232235786);
  assert.equal(parseIp(' 10.0.0.1 '), 167772161);
  assert.equal(formatIp(3232235786), '192.168.1.10');
  assert.equal(formatIp(4294967295), '255.255.255.255');
  assert.equal(formatIp(-1), '255.255.255.255');
  for (let i = 0; i < 200; i++) {
    const n = (Math.imul(i, 2654435761) >>> 0);
    assert.equal(parseIp(formatIp(n)), n);
  }
});

test('máscaras e prefixos', () => {
  assert.equal(prefixToMask(0), 0);
  assert.equal(formatIp(prefixToMask(1)), '128.0.0.0');
  assert.equal(formatIp(prefixToMask(23)), '255.255.254.0');
  assert.equal(formatIp(prefixToMask(32)), '255.255.255.255');
  for (let p = 0; p <= 32; p++) assert.equal(maskToPrefix(prefixToMask(p)), p);
  assert.deepEqual(parseMask('255.255.255.0'), { mask: prefixToMask(24), prefix: 24 });
  assert.equal(parseMask('255.255.255.128').prefix, 25);
  assert.equal(parseMask('0.0.0.0').prefix, 0);
  assert.equal(parseMask('255.255.255.255').prefix, 32);
});

test('máscaras não contíguas são recusadas, com dica para curinga', () => {
  assert.throws(() => parseMask('255.0.255.0'), /bits 1 precisam vir todos juntos/);
  assert.throws(() => parseMask('255.255.255.129'), /não é válida/);
  assert.throws(() => parseMask('0.0.0.255'), /máscara curinga \(wildcard\); a máscara correspondente é 255\.255\.255\.0 \(\/24\)/);
  assert.throws(() => parseMask('255.255.256.0'), /máximo é 255/);
});

test('formatos aceitos de entrada', () => {
  const expected = { ip: parseIp('192.168.1.10'), prefix: 24 };
  for (const text of ['192.168.1.10/24', ' 192.168.1.10 / 24 ', '192.168.1.10/255.255.255.0', '192.168.1.10 255.255.255.0', '192.168.1.10   255.255.255.0', '192.168.1.10 /24', '192.168.1.10 24']) {
    assert.deepEqual(parseCidr(text), expected, text);
  }
});

test('entradas inválidas geram mensagens claras', () => {
  const cases = [
    ['', /Informe um endereço/],
    ['192.168.1.300/24', /4º octeto .* vale 300, mas o máximo é 255/],
    ['256.1.1.1/8', /1º octeto .* vale 256/],
    ['192.168.1/24', /são 4 números/],
    ['1.2.3.4.5/24', /são 4 números/],
    ['192.168..1/24', /Falta o 3º octeto/],
    ['abc/24', /são 4 números/],
    ['a.b.c.d/24', /1º octeto .* não é um número/],
    ['192.168.01.1/24', /zero à esquerda/],
    ['-1.2.3.4/8', /não é um número/],
    ['192.168.1.10', /Informe também o prefixo ou a máscara/],
    ['192.168.1.10/33', /prefixo \/33 não existe/],
    ['192.168.1.10/100', /não é um prefixo/],
    ['192.168.1.10/abc', /não é um prefixo/],
    ['192.168.1.10/24/8', /não é um prefixo/],
    ['192.168.1.10 255.0.255.0', /não é válida/],
    ['lixo qualquer aqui', /são 4 números|não é um IPv4/],
  ];
  for (const [text, message] of cases) {
    assert.throws(() => parseCidr(text), (err) => err instanceof IpError && message.test(err.message), JSON.stringify(text));
  }
});

test('/0, /1 e /8', () => {
  assert.deepEqual(show(calculate('0.0.0.0/0')), {
    network: '0.0.0.0', broadcast: '255.255.255.255', first: '0.0.0.1', last: '255.255.255.254',
    mask: '0.0.0.0', wildcard: '255.255.255.255', total: 4294967296, usable: 4294967294,
  });
  assert.deepEqual(show(calculate('192.168.1.10/1')), {
    network: '128.0.0.0', broadcast: '255.255.255.255', first: '128.0.0.1', last: '255.255.255.254',
    mask: '128.0.0.0', wildcard: '127.255.255.255', total: 2147483648, usable: 2147483646,
  });
  assert.deepEqual(show(calculate('10.20.30.40/8')), {
    network: '10.0.0.0', broadcast: '10.255.255.255', first: '10.0.0.1', last: '10.255.255.254',
    mask: '255.0.0.0', wildcard: '0.255.255.255', total: 16777216, usable: 16777214,
  });
});

test('/16, /23 e /24', () => {
  assert.deepEqual(show(calculate('172.16.200.7/16')), {
    network: '172.16.0.0', broadcast: '172.16.255.255', first: '172.16.0.1', last: '172.16.255.254',
    mask: '255.255.0.0', wildcard: '0.0.255.255', total: 65536, usable: 65534,
  });
  assert.deepEqual(show(calculate('192.168.1.10/23')), {
    network: '192.168.0.0', broadcast: '192.168.1.255', first: '192.168.0.1', last: '192.168.1.254',
    mask: '255.255.254.0', wildcard: '0.0.1.255', total: 512, usable: 510,
  });
  assert.deepEqual(show(calculate('192.168.1.10 255.255.255.0')), {
    network: '192.168.1.0', broadcast: '192.168.1.255', first: '192.168.1.1', last: '192.168.1.254',
    mask: '255.255.255.0', wildcard: '0.0.0.255', total: 256, usable: 254,
  });
});

test('/30, /31 (RFC 3021) e /32', () => {
  assert.deepEqual(show(calculate('10.0.0.6/30')), {
    network: '10.0.0.4', broadcast: '10.0.0.7', first: '10.0.0.5', last: '10.0.0.6',
    mask: '255.255.255.252', wildcard: '0.0.0.3', total: 4, usable: 2,
  });
  assert.deepEqual(show(calculate('10.0.0.7/31')), {
    network: '10.0.0.6', broadcast: null, first: '10.0.0.6', last: '10.0.0.7',
    mask: '255.255.255.254', wildcard: '0.0.0.1', total: 2, usable: 2,
  });
  assert.deepEqual(show(calculate('203.0.113.9/32')), {
    network: '203.0.113.9', broadcast: null, first: '203.0.113.9', last: '203.0.113.9',
    mask: '255.255.255.255', wildcard: '0.0.0.0', total: 1, usable: 1,
  });
});

test('endereço digitado igual ao de rede ou ao de broadcast', () => {
  assert.equal(calculate('192.168.1.0/24').isNetworkAddress, true);
  assert.equal(calculate('192.168.1.255/24').isBroadcastAddress, true);
  assert.equal(calculate('192.168.1.10/24').isNetworkAddress, false);
  assert.equal(calculate('10.0.0.6/31').isNetworkAddress, false);
});

test('classes históricas', () => {
  assert.deepEqual(['0.0.0.1', '127.255.255.255', '128.0.0.0', '191.255.0.1', '192.0.0.0', '223.1.1.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255']
    .map((ip) => ipClass(parseIp(ip)).name), ['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E']);
  assert.equal(ipClass(parseIp('10.0.0.1')).defaultPrefix, 8);
  assert.equal(ipClass(parseIp('224.0.0.1')).defaultPrefix, null);
});

test('faixas especiais, inclusive nas bordas', () => {
  const type = (ip) => addressType(parseIp(ip)).id;
  const cases = {
    '10.0.0.0': 'private', '10.255.255.255': 'private', '11.0.0.0': 'public', '9.255.255.255': 'public',
    '172.15.255.255': 'public', '172.16.0.0': 'private', '172.31.255.255': 'private', '172.32.0.0': 'public',
    '192.168.0.0': 'private', '192.168.255.255': 'private', '192.169.0.0': 'public',
    '100.63.255.255': 'public', '100.64.0.0': 'cgnat', '100.127.255.255': 'cgnat', '100.128.0.0': 'public',
    '127.0.0.1': 'loopback', '127.255.255.255': 'loopback', '128.0.0.0': 'public',
    '169.254.0.1': 'link-local', '169.253.255.255': 'public', '169.255.0.0': 'public',
    '224.0.0.1': 'multicast', '239.255.255.255': 'multicast', '223.255.255.255': 'public',
    '192.0.2.10': 'documentation', '198.51.100.1': 'documentation', '203.0.113.255': 'documentation', '192.0.3.0': 'public',
    '198.18.0.0': 'benchmarking', '198.19.255.255': 'benchmarking', '198.17.255.255': 'public', '198.20.0.0': 'public',
    '0.0.0.0': 'this-network', '0.255.255.255': 'this-network', '1.0.0.0': 'public',
    '240.0.0.1': 'reserved', '255.255.255.254': 'reserved', '255.255.255.255': 'broadcast',
    '8.8.8.8': 'public', '200.160.2.3': 'public',
  };
  for (const [ip, expected] of Object.entries(cases)) assert.equal(type(ip), expected, ip);
  assert.equal(addressType(parseIp('192.168.1.1')).label, 'Privado (RFC 1918)');
  assert.equal(addressType(parseIp('100.64.1.1')).range, '100.64.0.0/10');
});

test('visão binária', () => {
  assert.equal(toBinary(parseIp('192.168.1.10')), '11000000101010000000000100001010');
  assert.equal(toBinary(prefixToMask(23)), '11111111111111111111111000000000');
  assert.equal(toBinary(0), '0'.repeat(32));
});
