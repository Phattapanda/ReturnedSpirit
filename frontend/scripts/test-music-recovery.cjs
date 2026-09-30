const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/audio/audioEngine.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {}, __DEV__: false, console, setTimeout, clearTimeout, setInterval, clearInterval,
  require: () => ({}),
};
vm.runInNewContext(code, context);
const engine = context.exports.audioEngine;
let plays = 0;
let seeks = 0;
const player = { isLoaded: true, playing: false, isBuffering: false, duration: 300, currentTime: 80,
  play() { plays++; this.playing = true; }, pause() {}, remove() {},
  async seekTo(time) { seeks++; this.currentTime = time; },
};
function ready() {
  engine.channelA = player;
  engine.activeChannel = 'A';
  engine.currentThemeKey = 'forest';
  engine.gameplayMusicWanted = true;
  engine.appActive = true;
  player.playing = false;
}
(async () => {
  ready();
  await engine.recoverGameplayMusic();
  assert.equal(plays, 1);
  assert.equal(seeks, 0, 'Resume without restarting');
  await engine.recoverGameplayMusic();
  assert.equal(plays, 1, 'Do not touch playing music');
  player.playing = false;
  player.currentTime = 300;
  await engine.recoverGameplayMusic();
  assert.equal(seeks, 1);
  assert.equal(plays, 2, 'Restart at track end');
  player.playing = false;
  engine.setAppActive(false);
  await engine.recoverGameplayMusic();
  assert.equal(plays, 2, 'Never recover in background');
  engine.setAppActive(true);
  assert.equal(plays, 3, 'Resume on foreground');
  engine.stopGameplayMusic(0);
  await engine.recoverGameplayMusic();
  assert.equal(plays, 3, 'Respect intentional stops');
  ready();
  engine.crossfadeIntervalId = 1;
  await engine.recoverGameplayMusic();
  assert.equal(plays, 3, 'Respect transitions');
  engine.crossfadeIntervalId = null;
  player.currentTime = 300;
  player.seekTo = async () => { engine.stopGameplayMusic(0); };
  await engine.recoverGameplayMusic();
  assert.equal(plays, 3, 'Stop during asynchronous seek wins');
  console.log('Music recovery tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
