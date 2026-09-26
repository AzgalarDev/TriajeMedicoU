import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

const roots = new Set(['it', 'test', 'describe']);
const focusedAliases = new Set(['fit', 'fdescribe']);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'coverage'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function chainNames(node) {
  const names = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) names.unshift(current.text);
  return names;
}

export function findFocusedTests(sourceText, fileName = 'snippet.ts') {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const failures = [];
  const inspectExpression = (expression) => {
    if (ts.isIdentifier(expression) && focusedAliases.has(expression.text)) return true;
    const names = chainNames(expression);
    return roots.has(names[0]) && names.includes('only');
  };
  const visit = (node) => {
    if ((ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) && inspectExpression(node.expression)) {
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      failures.push(`${fileName}:${pos.line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return failures;
}

function assertSelfTest(name, source, shouldDetect) {
  const detected = findFocusedTests(source, `${name}.test.ts`).length > 0;
  if (detected !== shouldDetect) throw new Error(`${name}: expected detected=${shouldDetect} but got ${detected}`);
}

function runSelfTest() {
  assertSelfTest('it-only', 'it.only("x", () => {})', true);
  assertSelfTest('test-only-each', 'test . only . each([[1]])("x", () => {})', true);
  assertSelfTest('describe-only-each', 'describe.only.each([[1]])("x", () => {})', true);
  assertSelfTest('fit', 'fit("x", () => {})', true);
  assertSelfTest('fdescribe', 'fdescribe("x", () => {})', true);
  assertSelfTest('normal-test', 'it("x", () => {})', false);
  assertSelfTest('comment', '// it.only("x", () => {})', false);
  assertSelfTest('string', 'const text = "test.only(\\"x\\", () => {})";', false);
}

async function runScan() {
  const failures = [];
  for (const file of await walk(process.cwd())) failures.push(...findFocusedTests(await readFile(file, 'utf8'), file));
  if (failures.length) {
    console.error(`Focused tests are forbidden:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

runSelfTest();
await runScan();
console.log('Focused-test self-test and repository scan passed.');
