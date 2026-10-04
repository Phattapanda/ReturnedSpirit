const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let stored = JSON.stringify({ musicVolume: 35, sfxVolume: 60, haptics: 'strong' });
let failWrite = false;
const storage = {
  getItem: async () => stored,
  setItem: async (_, value) => { if (failWrite) throw Error('write failed'); stored = value; },
};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/settings/game-settings.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(() => storage, loaded, loaded.exports);
(async () => {
  const { loadGameSettings, normalizeGameSettings, updateGameSettings } = loaded.exports;
  assert.equal((await loadGameSettings()).language, 'en');
  assert.equal(normalizeGameSettings({ language: 'fr' }).language, 'en');
  assert.equal(normalizeGameSettings({ language: 'de' }).language, 'en');
  assert.deepEqual(loaded.exports.AVAILABLE_GAME_LANGUAGES, ['en']);
  stored = JSON.stringify({ language: 'de', musicVolume: 35, sfxVolume: 60, haptics: 'strong' });
  assert.equal((await loadGameSettings()).language, 'en');
  await updateGameSettings({ language: 'de' });
  assert.deepEqual(await loadGameSettings(), { language: 'en', musicVolume: 35, sfxVolume: 60, haptics: 'strong' });
  await Promise.all([updateGameSettings({ musicVolume: 15 }), updateGameSettings({ language: 'en' })]);
  assert.equal((await loadGameSettings()).musicVolume, 15);
  assert.equal((await loadGameSettings()).language, 'en');
  failWrite = true;
  await assert.rejects(updateGameSettings({ language: 'de' }));
  failWrite = false;
  await updateGameSettings({ language: 'de' });
  assert.equal((await loadGameSettings()).language, 'en');
  console.log('Language settings tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
