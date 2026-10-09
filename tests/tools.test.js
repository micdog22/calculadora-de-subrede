import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIp, formatIp, planSplit, listSubnets, bitsForCount, parseRequirements, vlsm, checkMembership, parseNetworkList, summarize, IpError,
} from '../src/ipv4.js';

const cidr = (info) => `${formatIp(info.network)}/${info.prefix}`;

test('dividir em N sub-redes iguais', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 8, 9].map(bitsForCount), [0, 1, 2, 2, 3, 3, 4]);
  const four = planSplit(parseIp('192.168.0.77'), 24, { count: 4 });
  assert.equal(four.newPrefix, 26);
  assert.equal(four.count, 4);
  assert.deepEqual(listSubnets(four).map(cidr), ['192.168.0.0/26', '192.168.0.64/26', '192.168.0.128/26', '192.168.0.192/26']);
  const subnets = listSubnets(four);
  assert.equal(formatIp(subnets[1].first), '192.168.0.65');
  assert.equal(formatIp(subnets[1].broadcast), '192.168.0.127');
  assert.equal(subnets[1].usable, 62);
  const five = planSplit(parseIp('192.168.0.0'), 24, { count: 5 });
  assert.equal(five.newPrefix, 27);
  assert.equal(five.count, 8);
});

test('dividir por novo prefixo e limites', () => {
  const plan = planSplit(parseIp('10.0.0.0'), 8, { newPrefix: 16 });
  assert.equal(plan.count, 256);
  const list = listSubnets(plan, 3);
  assert.deepEqual(list.map(cidr), ['10.0.0.0/16', '10.1.0.0/16', '10.2.0.0/16']);
  const huge = planSplit(0, 0, { newPrefix: 32 });
  assert.equal(huge.count, 4294967296);
  assert.equal(listSubnets(huge, 2).length, 2);
  const same = planSplit(parseIp('10.0.0.0'), 8, { newPrefix: 8 });
  assert.equal(same.count, 1);
  assert.throws(() => planSplit(parseIp('10.0.0.0'), 24, { newPrefix: 23 }), /entre \/24 e \/32/);
  assert.throws(() => planSplit(parseIp('10.0.0.0'), 24, { newPrefix: 33 }), /entre \/24 e \/32/);
  assert.throws(() => planSplit(parseIp('10.0.0.0'), 30, { count: 8 }), /\/33/);
  assert.throws(() => planSplit(parseIp('10.0.0.0'), 24, { count: 0 }), /a partir de 1/);
  assert.throws(() => planSplit(parseIp('10.0.0.0'), 24, { count: 2.5 }), /inteiro/);
});

test('lista de necessidades do VLSM', () => {
  const { requirements, errors } = parseRequirements('Vendas 100\nTI: 50\n\nDiretoria = 10 hosts\n12\nSala 2 30\nSem número\nZero 0');
  assert.deepEqual(requirements, [
    { name: 'Vendas', hosts: 100 }, { name: 'TI', hosts: 50 }, { name: 'Diretoria', hosts: 10 },
    { name: 'Sub-rede 4', hosts: 12 }, { name: 'Sala 2', hosts: 30 },
  ]);
  assert.deepEqual(errors, [
    'Linha 7: informe o nome e a quantidade de hosts (ex.: Vendas 50).',
    'Linha 8: a quantidade de hosts precisa ser pelo menos 1.',
  ]);
});

test('VLSM aloca da maior para a menor e respeita o alinhamento', () => {
  const { requirements } = parseRequirements('Link 2\nVendas 100\nRH 20\nTI 50');
  const result = vlsm(parseIp('192.168.10.0'), 24, requirements);
  assert.equal(result.fits, true);
  assert.deepEqual(result.allocations.map((a) => [a.name, cidr(a), a.usable]), [
    ['Vendas', '192.168.10.0/25', 126],
    ['TI', '192.168.10.128/26', 62],
    ['RH', '192.168.10.192/27', 30],
    ['Link', '192.168.10.224/30', 2],
  ]);
  assert.equal(result.used, 228);
  assert.equal(result.free, 28);
  assert.equal(formatIp(result.allocations[1].broadcast), '192.168.10.191');
});

test('VLSM: necessidade exata de potência de 2 e host bits na rede base', () => {
  const { requirements } = parseRequirements('A 126\nB 62\nC 1');
  const result = vlsm(parseIp('10.1.2.99'), 24, requirements);
  assert.deepEqual(result.allocations.map(cidr), ['10.1.2.0/25', '10.1.2.128/26', '10.1.2.192/30']);
  const big = vlsm(parseIp('10.1.2.0'), 24, [{ name: 'X', hosts: 127 }]);
  assert.deepEqual(big.allocations.map(cidr), ['10.1.2.0/24']);
});

test('VLSM que não cabe informa o que ficou de fora', () => {
  const { requirements } = parseRequirements('Matriz 50\nFilial 20\nDepósito 20');
  const result = vlsm(parseIp('172.16.0.0'), 26, requirements);
  assert.equal(result.fits, false);
  assert.equal(result.available, 64);
  assert.equal(result.needed, 128);
  assert.deepEqual(result.allocations.map((a) => a.name), ['Matriz']);
  assert.deepEqual(result.unallocated.map((u) => u.name), ['Filial', 'Depósito']);

  // Um bloco grande falha, mas os menores ainda cabem no espaço que sobrou
  const mixed = vlsm(parseIp('10.0.0.0'), 24, [{ name: 'A', hosts: 100 }, { name: 'B', hosts: 100 }, { name: 'C', hosts: 100 }, { name: 'D', hosts: 2 }]);
  assert.deepEqual(mixed.allocations.map((a) => a.name), ['A', 'B']);
  assert.deepEqual(mixed.unallocated.map((u) => u.name), ['C', 'D']);
  const tooBig = vlsm(0, 0, [{ name: 'Gigante', hosts: 2 ** 32 }]);
  assert.deepEqual(tooBig.unallocated.map((u) => u.name), ['Gigante']);
});

test('este IP pertence à rede?', () => {
  assert.deepEqual(checkMembership('192.168.1.77', '192.168.1.0/24'), {
    ip: parseIp('192.168.1.77'), inside: true, role: 'host', network: parseIp('192.168.1.0'), prefix: 24, hostBitsSet: false,
  });
  assert.equal(checkMembership('192.168.2.1', '192.168.1.0/24').inside, false);
  assert.equal(checkMembership('192.168.1.0', '192.168.1.0/24').role, 'network');
  assert.equal(checkMembership('192.168.1.255', '192.168.1.0/24').role, 'broadcast');
  assert.equal(checkMembership('192.168.1.255', '192.168.0.0/23').role, 'broadcast');
  assert.equal(checkMembership('192.168.1.0', '192.168.0.0/23').role, 'host');
  assert.equal(checkMembership('8.8.8.8', '0.0.0.0/0').inside, true);
  assert.equal(checkMembership('10.0.0.1', '10.0.0.1/32').role, 'host');
  assert.equal(checkMembership('10.0.0.2', '10.0.0.1/32').inside, false);
  assert.equal(checkMembership('10.0.0.7', '10.0.0.6/31').role, 'host');
  const hostBits = checkMembership('172.16.5.4', '172.16.5.200 255.255.255.0');
  assert.equal(hostBits.hostBitsSet, true);
  assert.equal(formatIp(hostBits.network), '172.16.5.0');
  assert.throws(() => checkMembership('300.1.1.1', '10.0.0.0/8'), IpError);
  assert.throws(() => checkMembership('10.0.0.1', '10.0.0.0'), /prefixo ou a máscara/);
});

test('sumarização em uma super-rede', () => {
  const sum = (text) => {
    const { networks, errors } = parseNetworkList(text);
    assert.deepEqual(errors, []);
    const r = summarize(networks);
    return [`${formatIp(r.network)}/${r.prefix}`, r.exact, r.extra];
  };
  assert.deepEqual(sum('192.168.0.0/24\n192.168.1.0/24'), ['192.168.0.0/23', true, 0]);
  assert.deepEqual(sum('192.168.0.0/24, 192.168.1.0/24; 192.168.2.0/24\n192.168.3.0/24'), ['192.168.0.0/22', true, 0]);
  assert.deepEqual(sum('192.168.1.0/24\n192.168.2.0/24'), ['192.168.0.0/22', false, 512]);
  assert.deepEqual(sum('10.0.0.0/8\n11.0.0.0/8'), ['10.0.0.0/7', true, 0]);
  assert.deepEqual(sum('172.16.4.0/24'), ['172.16.4.0/24', true, 0]);
  assert.deepEqual(sum('10.0.0.0/16\n10.0.1.0/24\n10.0.0.0/16'), ['10.0.0.0/16', true, 0]);
  assert.deepEqual(sum('0.0.0.0/1\n128.0.0.0/1'), ['0.0.0.0/0', true, 0]);
  assert.deepEqual(sum('10.0.0.1/32\n10.0.0.2/32'), ['10.0.0.0/30', false, 2]);
  assert.deepEqual(sum('192.168.1.130/25'), ['192.168.1.128/25', true, 0]);
});

test('sumarização: erros na lista', () => {
  const { networks, errors } = parseNetworkList('10.0.0.0/8\n10.0.0.0/40\nxyz');
  assert.equal(networks.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /«10\.0\.0\.0\/40»: O prefixo \/40 não existe/);
  assert.throws(() => summarize([]), /pelo menos uma rede/);
  assert.equal(parseNetworkList('192.168.1.5/24').networks[0].hostBitsSet, true);
});
