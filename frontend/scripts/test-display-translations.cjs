const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const file = path.join(__dirname, relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, result, result.exports);
  return result.exports;
}
const catalog = load('../src/i18n/de-game.ts');
const dialogues = load('../src/i18n/de-dialogues.ts');
const messages = load('../src/i18n/de-messages.ts');
const items = load('../src/i18n/de-items.ts');
const { translateDisplay: t } = load('../src/i18n/use-language.ts', { './de-game': catalog, './de-dialogues': dialogues, './de-messages': messages, './de-items': items });
let checkedDescriptions = 0;
for (const file of ['src/game/item-system.ts', 'src/game/city-system.ts', 'app/next-city.tsx']) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function checkDescription(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'description' && ts.isStringLiteral(node.initializer)) {
      const english = node.initializer.text;
      const german = t(english, 'de');
      assert.notEqual(german, english, `Missing description: ${english}`);
      assert.ok(!/\b(Restores|Grants|Durability|Seeds for|A small bag)\b/.test(german), `Untranslated fragment: ${german}`);
      assert.deepEqual((german.match(/\d+/g) ?? []).sort(), (english.match(/\d+/g) ?? []).sort(), `Changed numbers: ${english}`);
      assert.equal(t(english, 'en'), english);
      checkedDescriptions++;
    }
    ts.forEachChild(node, checkDescription);
  }
  checkDescription(ast);
}
console.log(`Verified ${checkedDescriptions} item, supporter and building descriptions.`);
assert.equal(t('Ember Rooster hits me for 4 physical damage and 3 fire damage. I catch fire.', 'de'), 'Gluthahn trifft mich für 4 physischen Schaden und 3 Feuerschaden. Ich fange Feuer.');
assert.equal(t('Burning deals 1 fire damage. The flames go out.', 'de'), 'Die Verbrennung verursacht 1 Feuerschaden. Die Flammen erlöschen.');
assert.equal(t('Quest complete: 1 Silver Coin · 5 Copper Coins and 3 Guild Reputation awarded.', 'de'), 'Quest abgeschlossen: 1 Silbermünzen · 5 Kupfermünzen und 3 Gildenansehen erhalten.');
assert.equal(t('I found 3× Herbs in the Wild Herb Patch.', 'de'), 'Ich habe 3× Kräuter gefunden (Wildkräuterstelle).');
assert.equal(t('2 days remaining', 'de'), 'Noch 2 Tage');
assert.equal(t('1 day remaining', 'de'), 'Noch 1 Tag');
assert.equal(t('2/5 available', 'de'), '2/5 verfügbar');
assert.equal(t('2/5 available this week', 'de'), '2/5 diese Woche verfügbar');
assert.equal(t('Under construction · 1 day(s) remaining', 'de'), 'Im Bau · noch 1 Tag');
assert.equal(t('"My favorite dish is Herb Soup."', 'de'), '„Mein Lieblingsgericht ist Kräutersuppe.“');
assert.equal(t('"I don\'t like cold meals."', 'de'), '„Kalte Gerichte mag ich nicht.“');
assert.equal(t('"A Standard Ale sounds good. Thank you."', 'de'), '„Einfaches Ale klingt gut. Danke.“');
assert.equal(t('Do not show this message again', 'de'), 'Diese Nachricht nicht mehr anzeigen');
assert.equal(t('Only if you would like a reply', 'de'), 'Nur wenn du eine Antwort möchtest');
const exploreFile = path.join(__dirname, '../src/game/outside-exploration.ts');
const exploreAst = ts.createSourceFile(exploreFile, fs.readFileSync(exploreFile, 'utf8'), ts.ScriptTarget.Latest, true);
let stories = 0;
function checkStories(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(exploreAst) === 'text' && ts.isStringLiteral(node.initializer)) {
    const english = node.initializer.text;
    assert.notEqual(t(english, 'de'), english);
    assert.equal(t(english, 'en'), english);
    stories++;
  }
  ts.forEachChild(node, checkStories);
}
checkStories(exploreAst);
assert.equal(stories, 31);
assert.equal(t('Herb Soup', 'en'), 'Herb Soup');
assert.equal(t('Herb Soup', 'de'), 'Kräutersuppe');
assert.equal(t('3× Herb Soup', 'de'), '3× Kräutersuppe');
assert.equal(t('Stamina: 20/100', 'de'), 'Ausdauer: 20/100');
assert.equal(t('  Garden Storage  ', 'de'), '  Gartenlager  ');
assert.equal(t('welcometraveller', 'de'), 'welcometraveller');
assert.equal(t('seed_herb', 'de'), 'seed_herb');
assert.equal(t('Unknown text', 'de'), 'Unknown text');
assert.equal(t('"Nice to meet you, my name is Ada."', 'de'), '„Freut mich, mein Name ist Ada.“');
assert.equal(t('"Ada will be staying here for the time being."', 'de'), '„Ada wohnt vorerst hier.“');
// Cover complete requested city-dialog functions and named dialogue arrays.
let verified = 0;
for (const [file, names] of [
  ['app/next-city.tsx', ['guildIntroductionLines', 'merchantGuildIntroductionLines', 'arrivalLines', 'promotionLines', 'cityGuardLines', 'minstrelIntroductionLines', 'carpenterDialogLines', 'guestRoomUpgradeDialogLines']],
  ['app/dining.tsx', ['coachmanMealReaction', 'coachmanTalkLine', 'farmerMealReaction', 'farmerTalkLine']],
]) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function check(node) {
    if (ts.isStringLiteral(node) && (
      (ts.isPropertyAssignment(node.parent) && node.parent.name.getText(ast) === 'text') ||
      (ts.isCallExpression(node.parent) && ['receptionist', 'player'].includes(node.parent.expression.getText(ast))) ||
      ts.isReturnStatement(node.parent)
    )) {
      assert.notEqual(t(node.text, 'de'), node.text, `Missing dialogue: ${node.text}`);
      assert.equal(t(node.text, 'en'), node.text);
      verified++;
    }
    ts.forEachChild(node, check);
  }
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && names.includes(node.name.getText(ast))) check(node);
    else ts.forEachChild(node, visit);
  }
  visit(ast);
}
assert.ok(verified > 70);
console.log(`Verified ${verified} city and guest dialogue lines in both languages.`);
assert.equal(t('Serve 50 guests', 'de'), 'Bediene 50 Gäste');
assert.equal(t('Wow, it’s really gotten livelier. That reminds me of the old days.', 'de'), 'Wow, hier ist es wirklich lebhafter geworden. Das erinnert mich an die alten Zeiten.');
console.log(`Display translation tests passed; ${Object.keys(catalog.germanGame).length} game translations.`);
