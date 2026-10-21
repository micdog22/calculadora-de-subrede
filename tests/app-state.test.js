import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const start = source.indexOf("const STORAGE_KEY = 'calculadora-de-subrede:estado';");
const end = source.indexOf('\nfunction saveState()', start);

function loadSaved(value) {
  const context = {
    localStorage: { getItem: () => value },
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.result = loadState();`, context);
  return JSON.parse(JSON.stringify(context.result));
}

test('loadState descarta armazenamento inválido e preserva apenas texto e modo aceito', () => {
  const defaults = loadSaved(null);

  for (const value of ['"texto"', '42', 'null', '[]', '{']) {
    assert.deepEqual(loadSaved(value), defaults);
  }

  assert.deepEqual(loadSaved(JSON.stringify({
    address: '10.0.0.1/8',
    splitMode: 'prefix',
    splitCount: '8',
    splitPrefix: '11',
    vlsm: 'Filial 20',
    memberIp: '10.0.0.2',
    memberNet: '10.0.0.0/8',
    sum: '10.0.0.0/8',
  })), {
    address: '10.0.0.1/8',
    splitMode: 'prefix',
    splitCount: '8',
    splitPrefix: '11',
    vlsm: 'Filial 20',
    memberIp: '10.0.0.2',
    memberNet: '10.0.0.0/8',
    sum: '10.0.0.0/8',
  });

  assert.deepEqual(loadSaved(JSON.stringify({ address: 12, splitMode: 'outro', splitCount: 4 })), {
    ...defaults,
    splitMode: 'count',
  });
});
