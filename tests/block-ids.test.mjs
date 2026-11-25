import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,indexBlockIds} from '../dist/index.js';
const doc=(documentId,source)=>({documentId,revision:'1',parsed:scanDocument(source)});
test('block IDs indexed in nested and multiple documents; duplicate positions retained',()=>{
  const a=doc('a',':::layout{}\n::figure{#fig src="a.png"}\n:::\n');
  const b=doc('b','::figure{#fig src="b.png"}\n');
  const r=indexBlockIds([a,b]);assert.equal(r.byId.get('fig').length,2);assert.equal(r.diagnostics.length,1);
  assert.equal(r.diagnostics[0].first.documentId,'a');assert.equal(r.diagnostics[0].occurrence.documentId,'b');
  const range=r.diagnostics[0].first.range;assert.equal(a.parsed.source.slice(range.start,range.end),'::figure{#fig src="a.png"}');
});
test('protected fenced code and HTML block do not create block IDs',()=>{
  const a=doc('a','~~~md\n::figure{#ignored}\n~~~\n\n<div>\n::figure{#hidden}\n</div>\n\n::figure{#actual}\n');
  assert.deepEqual([...indexBlockIds([a]).byId.keys()],['actual']);
});
test('duplicate document identity rejected',()=>assert.throws(()=>indexBlockIds([doc('a',''),doc('a','')])));
