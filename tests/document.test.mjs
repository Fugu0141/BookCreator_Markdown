import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument} from '../dist/index.js';
test('nested containers and exact source ranges',()=>{const s='::::layout{}\r\n:::callout{}\r\n# 日本😀\r\n:::\r\n\r\n::::\r\n';const r=scanDocument(s);assert.equal(r.diagnostics.length,0);const outer=r.blocks[0];assert.equal(outer.closed,true);assert.equal(outer.children[0].children[0].level,1);assert.equal(s.slice(outer.range.start,outer.range.end),s);});
test('code math and comments protect directive markers',()=>{const s='~~~md\n::pagebreak{}\n~~~\n\n$$\n::pagebreak{}\n$$\n\n<!--\n::pagebreak{}\n-->\n\n::pagebreak{}\n';const r=scanDocument(s);assert.equal(r.blocks.filter(b=>b.kind==='directive').length,1);assert.equal(r.source,s);});
test('unclosed and mismatched fences diagnose without dropping content',()=>{const s='::::layout{}\ntext\n:::\n';const r=scanDocument(s);assert.deepEqual(r.diagnostics.map(d=>d.code),['BCM_FENCE','BCM_UNCLOSED']);assert.equal(r.blocks[0].range.end,s.length);});
test('unknown directive retained and paragraph adjacent directive stays raw',()=>{const r=scanDocument('text\n::pagebreak{}\n\n::future{}\n');assert.equal(r.blocks[1].kind,'raw');assert.equal(r.blocks[3].header.name,'future');assert.equal(r.diagnostics[0].code,'BCM_UNKNOWN');});
