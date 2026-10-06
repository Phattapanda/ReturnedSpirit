const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id.startsWith('./') ? load(path.resolve(path.dirname(file), id + '.ts')) : {}, m, m.exports);
  return m.exports;
}
const { translateDisplay } = load(path.join(root, 'src/i18n/use-language.ts'));
const files = ['app/dining.tsx', 'app/coachman-escort.tsx', 'app/dormitory.tsx', 'src/KitchenScreenBase.tsx', 'src/GardenScreenBase.tsx', 'src/game/rupert-item-hints.ts'];
let missing = 0;
for (const file of files) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const seen = new Set();
  function visit(node) {
    if (ts.isStringLiteral(node) && !node.text.startsWith('[Dining]') && (node.text.split(/\s+/).length >= 5 || /^["“]/.test(node.text)) && !seen.has(node.text)) {
      seen.add(node.text);
      if (translateDisplay(node.text, 'de') === node.text && /[a-z]/i.test(node.text)) {
        console.log(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${JSON.stringify(node.text)}`);
        missing++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
console.log(`Missing candidate translations: ${missing}`);
if (process.argv.includes('--check') && missing) process.exitCode = 1;
