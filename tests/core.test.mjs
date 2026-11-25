import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDirectiveHeader, applyPatches} from '../dist/index.js';
test('header, ID, quoted braces, UTF-16 offsets', () => {
  const r = parseDirectiveHeader('::figure{#fig-a caption="日本{語}😀" width="75%"}', 10);
  assert.equal(r.diagnostics.length,0); const d=r.directives[0];
  assert.equal(d.id,'fig-a'); assert.equal(d.attributes[0].value,'日本{語}😀'); assert.equal(d.range.start,10);
});
test('nested container header', () => assert.equal(parseDirectiveHeader('::::layout{}').directives[0].fence,4));
test('duplicates and invalid escapes are errors', () => {
  for(const s of ['::figure{a="1" a="2"}','::figure{#a #b}','::figure{a="\\b"}','::figure{a="\\uD800"}','::figure{a="x}','::figure{a="x"b="y"}']) assert.equal(parseDirectiveHeader(s).diagnostics.length,1,s);
});
test('patch preserves CRLF, BOM, Japanese and emoji outside range', () => {
  const s='\uFEFF日本😀\r\nwidth="75%"\r\n'; const start=s.indexOf('75%');
  assert.equal(applyPatches(s,[{range:{start,end:start+3},expected:'75%',replacement:'50%'}]),s.replace('75%','50%'));
  assert.throws(()=>applyPatches(s,[{range:{start,end:start+3},expected:'bad',replacement:''}]));
  const i=s.indexOf('😀')+1; assert.throws(()=>applyPatches(s,[{range:{start:i,end:i},expected:'',replacement:'x'}]));
});
test('patch rejects splitting combining characters and CRLF',()=>{for(const s of ['e\u0301','\r\n']) assert.throws(()=>applyPatches(s,[{range:{start:1,end:1},expected:'',replacement:'x'}]));});
