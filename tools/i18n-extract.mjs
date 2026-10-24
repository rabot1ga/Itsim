/**
 * Кодмод i18n (P2.5, docs/PROPOSALS-2026-10-23-i18n.md).
 *
 * Оборачивает кириллические строки в `t('...')` (gettext-стиль: ключ = исходная
 * русская строка). Шаблоны с интерполяцией → `t('...{p}...', { p: expr })`.
 * Пропускает тесты, импорты/экспорты, ключи объектов, имена свойств, строковые
 * типы, enum-инициализаторы и `case`-метки (они попадают в отчёт — править
 * вручную). JsxText с краевыми пробелами сохраняет пробелы отдельными узлами.
 *
 * Использование:
 *   node tools/i18n-extract.mjs <dir> [--write]
 *
 * Без --write только отчёт. Инструмент переиспользуем на сервере (этап 2).
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';

const CYRILLIC = /[А-Яа-яЁё]/;
const args = process.argv.slice(2);
const write = args.includes('--write');
const importExt = (args.find((a) => a.startsWith('--import-ext=')) ?? '--import-ext=').split('=')[1] ?? '';
const root = args.find((a) => !a.startsWith('--'));
if (!root) {
  console.error('usage: node tools/i18n-extract.mjs <dir> [--write]');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'dist' || name === 'generated') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'i18n.ts') {
      out.push(p);
    }
  }
  return out;
}

const report = { files: 0, wrapped: 0, templates: 0, jsx: 0, skippedCase: [], skippedOther: [] };

for (const file of walk(root)) {
  const sourceText = readFileSync(file, 'utf-8');
  const kind = extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.ESNext, true, kind);

  let touched = false;

  const isSkippedContext = (node) => {
    const p = node.parent;
    if (!p) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
    if (ts.isImportTypeNode(p)) return true;
    if (ts.isLiteralTypeNode(p)) return true;
    if (ts.isEnumMember(p)) return true;
    if (ts.isPropertyAssignment(p) && p.name === node) return true;
    if (
      ts.isPropertySignature(p) ||
      ts.isMethodSignature(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isMethodDeclaration(p)
    ) {
      if (p.name === node) return true;
    }
    if (ts.isCaseClause(p)) return true; // отчёт ниже
    if (ts.isModuleDeclaration(p)) return true;
    return false;
  };

  const keyLiteral = (text) => {
    const lit = ts.factory.createStringLiteral(text);
    // Не экранировать кириллицу в \uXXXX — читаемый исходник
    ts.setEmitFlags(lit, ts.EmitFlags.NoAsciiEscaping);
    return lit;
  };
  const wrap = (text, paramsNode) => {
    const args = [keyLiteral(text)];
    if (paramsNode) args.push(paramsNode);
    return ts.factory.createCallExpression(ts.factory.createIdentifier('t'), undefined, args);
  };

  const visitor = (node) => {
    // case-метки с кириллицей — в отчёт (нельзя оборачивать)
    if (
      ts.isCaseClause(node) &&
      node.expression &&
      ts.isStringLiteralLike(node.expression) &&
      CYRILLIC.test(node.expression.text)
    ) {
      report.skippedCase.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }

    // Шаблон с интерполяцией: `Мне ${n} лет` → t('Мне {n} лет', { n })
    if (ts.isTemplateExpression(node) && CYRILLIC.test(node.getText())) {
      touched = true;
      report.templates += 1;
      let key = node.head.text;
      const props = [];
      let argIndex = 0;
      for (const span of node.templateSpans) {
        const expr = span.expression;
        const name = ts.isIdentifier(expr) ? expr.text : `p${argIndex++}`;
        key += `{${name}}` + span.literal.text;
        props.push(
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier(name),
            ts.isIdentifier(expr) ? ts.factory.createIdentifier(name) : expr
          )
        );
      }
      return wrap(key, ts.factory.createObjectLiteralExpression(props));
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!CYRILLIC.test(node.text) || isSkippedContext(node)) return node;
      // уже обёрнуто: t('...') — идемпотентность
      const pp = node.parent;
      if (
        pp &&
        ts.isCallExpression(pp) &&
        ts.isIdentifier(pp.expression) &&
        pp.expression.text === 't' &&
        pp.arguments.includes(node)
      ) {
        return node;
      }
      touched = true;
      report.wrapped += 1;
      const call = wrap(node.text);
      // Значение JSX-атрибута должно остаться выражением в фигурных скобках
      if (node.parent && ts.isJsxAttribute(node.parent) && node.parent.initializer === node) {
        return ts.factory.createJsxExpression(undefined, call);
      }
      return call;
    }

    // JSX-текст: сохранить краевые пробелы отдельными узлами
    if (ts.isJsxText(node)) {
      if (!CYRILLIC.test(node.text)) return node;
      const normalized = node.text.replace(/\s+/g, ' ').trim();
      if (!CYRILLIC.test(normalized)) return node;
      touched = true;
      report.jsx += 1;
      const lead = node.text.match(/^\s*/)[0];
      const tail = node.text.match(/\s*$/)[0];
      const parts = [];
      if (lead) parts.push(ts.factory.createJsxText(lead, false));
      parts.push(ts.factory.createJsxExpression(undefined, wrap(normalized)));
      if (tail) parts.push(ts.factory.createJsxText(tail, false));
      return parts;
    }

    return ts.visitEachChild(node, visitor, undefined);
  };

  const transformed = ts.visitNode(source, visitor);
  if (!touched) continue;

  report.files += 1;

  // Добавить импорт t, если его ещё нет
  let printed = ts.createPrinter().printFile(transformed);
  const hasTImport = /import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]/.test(printed) || /import\s+t\s+from/.test(printed);
  if (!hasTImport) {
    const rel = relative(dirname(file), join(root, 'lib', 'i18n'))
      .split('\\')
      .join('/');
    const importPath = rel.startsWith('.') ? rel : './' + rel;
    printed = `import { t } from '${importPath.replace(/\.ts$/, '')}${importExt}';\n` + printed;
  }

  if (write) writeFileSync(file, printed);
}

console.log(`файлов обработано: ${report.files}`);
console.log(`литералов обёрнуто: ${report.wrapped}, шаблонов: ${report.templates}, jsx-текстов: ${report.jsx}`);
if (report.skippedCase.length) console.log('case-метки (править вручную):', report.skippedCase.join(', '));
if (report.skippedOther.length) console.log('прочее (вручную):', report.skippedOther.join(', '));
if (!write) console.log('режим отчёта; чтобы записать — добавьте --write');
