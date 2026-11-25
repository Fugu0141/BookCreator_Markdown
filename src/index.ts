export interface Range { start: number; end: number }
export interface Diagnostic { code: string; range: Range; message: string }
export interface Attribute { key: string; value: string; range: Range }
export interface Directive { kind: 'leaf' | 'container'; name: string; fence: number; id?: string; attributes: Attribute[]; range: Range }
export interface ScanResult { directives: Directive[]; diagnostics: Diagnostic[] }
// First PoC: isolated directive headers, not a CommonMark parser.
export function parseDirectiveHeader(line: string, offset = 0): ScanResult {
  const directives: Directive[] = [], diagnostics: Diagnostic[] = [];
  const m = /^(:{2,})([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\{/.exec(line);
  if (!m) return { directives, diagnostics };
  let i = m[0].length;
  const fail = (message: string): ScanResult => ({ directives: [], diagnostics: [{ code: 'BCM_HEADER', message, range: { start: offset + i, end: offset + line.length } }] });
  const attributes: Attribute[] = [];
  const seen = new Set<string>();
  let id: string | undefined;
  const skip = () => { while (line[i] === ' ' || line[i] === '\t') i++; };
  skip();
  while (line[i] !== '}') {
    const start = i;
    if (line[i] === '#') {
      const match = /^#([A-Za-z][A-Za-z0-9_.-]{0,127})/.exec(line.slice(i));
      if (!match || id !== undefined) return fail('Invalid or duplicate ID');
      id = match[1]; i += match[0].length;
    } else {
      const key = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)="/.exec(line.slice(i));
      if (!key || key[1] === 'id' || seen.has(key[1])) return fail('Invalid or duplicate attribute');
      i += key[0].length;
      const quote = i - 1;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\') {
          i++;
          if (!['"', '\\', 'n', 't', 'r', 'u'].includes(line[i])) return fail('Unsupported escape');
        }
        i++;
      }
      if (i >= line.length) return fail('Unclosed attribute value');
      let value: string;
      try { value = JSON.parse(line.slice(quote, ++i)) as string; } catch { return fail('Invalid escape'); }
      for (let j = 0; j < value.length; j++) {
        const n = value.charCodeAt(j);
        if (n >= 0xd800 && n <= 0xdbff) { const next = value.charCodeAt(++j); if (!(next >= 0xdc00 && next <= 0xdfff)) return fail('Lone surrogate'); }
        else if (n >= 0xdc00 && n <= 0xdfff) return fail('Lone surrogate');
      }
      seen.add(key[1]); attributes.push({ key: key[1], value, range: { start: offset + start, end: offset + i } });
    }
    if (line[i] !== '}' && line[i] !== ' ' && line[i] !== '\t') return fail('Expected attribute separator');
    skip();
  }
  i++;
  if (!/^[ \t]*$/.test(line.slice(i))) return fail('Unexpected text after directive');
  directives.push({ kind: m[1].length === 2 ? 'leaf' : 'container', name: m[2], fence: m[1].length, id, attributes, range: { start: offset, end: offset + i } });
  return { directives, diagnostics };
}
export interface Patch { range: Range; expected: string; replacement: string }
export function applyPatches(source: string, patches: readonly Patch[]): string {
  const sorted = [...patches].sort((a,b) => a.range.start - b.range.start || a.range.end - b.range.end);
  let last = 0, previousStart = -1;
  const boundaries = new Set([0, source.length]);
  for (const segment of new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(source)) boundaries.add(segment.index);
  const boundary = (i: number) => boundaries.has(i);
  for (const {range:{start,end},expected} of sorted) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < last || start === previousStart || end < start || end > source.length || !boundary(start) || !boundary(end) || source.slice(start,end) !== expected) throw new Error('Invalid or stale patch');
    last = end; previousStart = start;
  }
  let result = source;
  for (const p of sorted.reverse()) result = result.slice(0,p.range.start) + p.replacement + result.slice(p.range.end);
  return result;
}
export {scanDocument, type Block, type DocumentResult} from './document.js';
