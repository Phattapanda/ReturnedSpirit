const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const storage = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => {
    if (id === '@/src/audio/audioEngine') return { audioEngine: {} };
    if (id === '@react-native-async-storage/async-storage') return {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    };
    if (id.startsWith('@/')) return load(path.join(root, id.slice(2) + '.ts'));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    throw new Error(id);
  }, module, module.exports);
  return module.exports;
}
(async () => {
  const guests = load(path.join(root, 'src/game/guest-system.ts'));
  const results = await Promise.all([
    guests.discoverGuestPreference('old_farmer', () => 0.99),
    guests.discoverGuestPreference('old_farmer', () => 0),
  ]);
  assert.equal(results[0].outcome, 'nothing_learned');
  assert.equal(results[1].outcome, 'already_talked');
  assert.notEqual((await guests.discoverGuestPreference('coachman')).outcome, 'already_talked');
  assert.equal((await guests.discoverGuestPreference('old_farmer')).outcome, 'already_talked');
  const state = await guests.loadGuestState();
  assert.equal(state.talkedDaySerial.old_farmer, state.calendarDaySerial);
  await guests.saveGuestState({ ...state, calendarDaySerial: state.calendarDaySerial + 7 });
  assert.equal((await guests.discoverGuestPreference('old_farmer', () => 0)).outcome, 'learned');
  console.log('Guest talk tests passed: persistence, per-guest limit, rapid taps, next visit.');
})().catch(error => { console.error(error); process.exitCode = 1; });
