/**
 * Strict, eval-free subset of Handlebars for Cloudflare Workers.
 * Supports escaped variables, #each, #if/#unless, {{else}}, and named partials.
 * The runtime never generates executable source strings.
 */
const MAX_TEMPLATE_CHARS = 500_000;
const MAX_OUTPUT_CHARS = 2_000_000;
const MAX_NODES = 35_000;
const MAX_DEPTH = 32;
const SAFE_PATH = /^(?:@root\.|\.\.\/|this\.|@index$|@first$|@last$|[\w-])[^\s{}]*$/u;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SAFE_PARTIAL_NAME = /^[a-z][a-z0-9_-]{0,40}$/i;

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;')
  .replace(/`/g, '&#x60;');

function syntax(message) {
  throw new Error('Template tidak didukung: ' + message);
}

function parseTemplate(source) {
  if (typeof source !== 'string' || source.length > MAX_TEMPLATE_CHARS) syntax('ukuran template terlalu besar');
  const tokens = source.matchAll(/\{\{\{?[\s\S]*?\}\}\}?/g);
  const base = [];
  const frames = [{ type: 'root', name: null, current: base }];
  let last = 0;
  let count = 0;
  const append = item => {
    if (++count > MAX_NODES) syntax('terlalu banyak node');
    frames[frames.length - 1].current.push(item);
  };
  for (const match of tokens) {
    if (match.index > last) append({ kind: 'text', value: source.slice(last, match.index) });
    const raw = match[0];
    if (raw.startsWith('{{{')) syntax('raw/unescaped expressions tidak diperbolehkan');
    const token = raw.slice(2, -2).trim();
    if (!token) syntax('ekspresi kosong');
    if (token.startsWith('!')) {
      // Handlebars comments are ignored; HTML remains unmodified.
    } else if (token.startsWith('#')) {
      const parts = token.slice(1).trim().split(/\s+/);
      if (parts.length !== 2 || !['each','if','unless'].includes(parts[0])) syntax('block helper ' + parts[0]);
      if (frames.length > MAX_DEPTH) syntax('nesting terlalu dalam');
      const block = { kind: 'block', name: parts[0], path: parts[1], main: [], inverse: [] };
      append(block);
      frames.push({ type: 'block', name: parts[0], current: block.main, block, hasElse: false });
    } else if (token === 'else' || token === '^') {
      const frame = frames[frames.length - 1];
      if (!frame.block || frame.hasElse) syntax('else tanpa block atau duplikat');
      frame.current = frame.block.inverse;
      frame.hasElse = true;
    } else if (token.startsWith('/')) {
      const name = token.slice(1).trim();
      const frame = frames[frames.length - 1];
      if (!frame.block || name !== frame.name) syntax('penutup block tidak cocok: ' + name);
      frames.pop();
    } else if (token.startsWith('>')) {
      const name = token.slice(1).trim();
      if (!SAFE_PARTIAL_NAME.test(name)) syntax('nama partial invalid');
      append({ kind: 'partial', name });
    } else if (token.startsWith('&')) {
      syntax('ekspresi tidak di-escape tidak diperbolehkan');
    } else {
      if (/\s/.test(token) || token.includes('(') || token.includes(')') || !SAFE_PATH.test(token)) syntax('helper atau path invalid: ' + token.slice(0, 30));
      append({ kind: 'value', path: token });
    }
    last = match.index + raw.length;
  }
  if (last < source.length) append({ kind: 'text', value: source.slice(last) });
  if (frames.length !== 1) syntax('block tidak ditutup');
  return base;
}

function get(obj, segments) {
  let current = obj;
  for (const key of segments) {
    if (!key) continue;
    if (UNSAFE_KEYS.has(key) || !current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function resolvePath(path, frame, root) {
  if (path === 'this' || path === '.') return frame.value;
  if (path === '@index') return frame.index ?? undefined;
  if (path === '@first') return frame.index === 0;
  if (path === '@last') return frame.index === frame.count - 1;
  if (path.startsWith('@root.')) return get(root, path.slice(6).split('.'));
  let f = frame;
  while (path.startsWith('../')) {
    f = f.parent || f;
    path = path.slice(3);
  }
  if (path.startsWith('this.')) return get(f.value, path.slice(5).split('.'));
  let value = get(f.value, path.split('.'));
  // Header partials are shared across all pages, so allow binding roots to resolve.
  if (value === undefined && f !== root) value = get(root, path.split('.'));
  return value;
}

function truthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return !!value;
}

export function renderSafeTemplate(source, root, partials = {}) {
  const program = parseTemplate(source);
  if (!root || typeof root !== 'object' || Array.isArray(root)) syntax('binding root harus object');
  if (!partials || typeof partials !== 'object' || Array.isArray(partials)) syntax('partials invalid');
  const astPartials = new Map();
  for (const [name, text] of Object.entries(partials)) {
    if (!SAFE_PARTIAL_NAME.test(name)) syntax('nama partial tidak aman');
    astPartials.set(name, parseTemplate(text));
  }
  const frameRoot = { value: root, parent: null };
  const emit = (nodes, frame, depth = 0) => {
    if (depth > MAX_DEPTH) syntax('rekursi template terlalu dalam');
    let out = '';
    for (const node of nodes) {
      switch (node.kind) {
        case 'text': out += node.value; break;
        case 'value': {
          const value = resolvePath(node.path, frame, root);
          if (value !== undefined && value !== null && typeof value !== 'object' && typeof value !== 'function') out += escapeHtml(value);
          break;
        }
        case 'partial': {
          const part = astPartials.get(node.name);
          if (!part) syntax('partial tidak ditemukan: ' + node.name);
          out += emit(part, frame, depth + 1);
          break;
        }
        case 'block': {
          const value = resolvePath(node.path, frame, root);
          if (node.name === 'each') {
            if (!Array.isArray(value)) {
              if (value !== undefined && value !== null) syntax('each memerlukan array');
              out += emit(node.inverse, frame, depth + 1);
            } else if (!value.length) {
              out += emit(node.inverse, frame, depth + 1);
            } else {
              if (value.length > 1000) syntax('perulangan terlalu panjang');
              for (let i = 0; i < value.length; i++) out += emit(node.main, { value: value[i], parent: frame, index: i, count: value.length }, depth + 1);
            }
          } else {
            const selected = node.name === 'if' ? truthy(value) : !truthy(value);
            out += emit(selected ? node.main : node.inverse, frame, depth + 1);
          }
          break;
        }
        default: syntax('node tidak didukung');
      }
      if (out.length > MAX_OUTPUT_CHARS) syntax('HTML terlalu besar');
    }
    return out;
  };
  return emit(program, frameRoot);
}