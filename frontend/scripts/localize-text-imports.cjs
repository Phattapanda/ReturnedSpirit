// Mechanical migration of presentation Text imports. No game data is rewritten.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'src'))]) {
  if (!file.endsWith('.tsx') || file.includes(`${path.sep}i18n${path.sep}`)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react-native') continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    if (!bindings.elements.some(e => e.name.text === 'Text' && !e.propertyName && !e.isTypeOnly)) continue;
    const others = bindings.elements.filter(e => e.name.text !== 'Text').map(e => e.getText(ast));
    const defaultName = statement.importClause.name?.text;
    const clause = [defaultName, others.length ? `{ ${others.join(', ')} }` : null].filter(Boolean).join(', ');
    edits.push({ start: statement.getStart(ast), end: statement.end,
      text: (clause ? `import ${clause} from "react-native";\n` : '') + 'import { Text } from "@/src/i18n/localized-text";' });
  }
  let result = source;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  if (result !== source) fs.writeFileSync(file, result);
}
