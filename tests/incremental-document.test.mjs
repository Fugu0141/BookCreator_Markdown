import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,scanDocumentIncremental,validateScannedBlocks} from '../dist/index.js';
function check(source,previous){
  const next=scanDocumentIncremental(source,previous);
  const full=scanDocument(source);
  assert.deepEqual(next.result,full);
  assert.deepEqual(validateScannedBlocks(next.result),validateScannedBlocks(full));
  assert.equal(next.scannedCharacters+next.reusedPrefixCharacters+next.reusedSuffixCharacters,source.length);
  return next;
}
test('local edit scans only between proven blank boundaries and shifts nested source ranges',()=>{
  const paras=Array.from({length:100},(_,i)=>'段落'+i+'。本文です。\r\n\r\n');
  const old=paras.join('')+'::::layout{#outer}\r\n:::callout{title="例題"}\r\n本文😀\r\n:::\r\n\r\n::::\r\n';
  const first=check(old);
  const source=old.replace('段落40。','段落40の変更。');
  const next=check(source,first.snapshot);
  assert.ok(next.reusedPrefixCharacters>0&&next.reusedSuffixCharacters>0);
  assert.ok(next.scannedCharacters<50);
  const again=check(source.replace('段落80。','段落80😀。'),next.snapshot);
  assert.ok(again.scannedCharacters<50);
});
test('protected blocks and malformed directives never converge inside an open context',()=>{
  const tails='\n\n::pagebreak{}\n\n後続。\n\n';
  const samples=[
    '前。\n\n$$\nx^2\n\n$$\n'+tails,
    '前。\n\n~~~md\n::pagebreak{}\n\n~~~\n'+tails,
    '前。\n\n<!--\n::pagebreak{}\n\n-->\n'+tails,
    '前。\n\n<script>\nabc\n\n</script>\n'+tails,
    '前。\n\n::::layout{}\n:::callout{}\n本文\n\n:::\n\n::::\n'+tails,
    '前。\n\n::future{title="a"}\n\n::pagebreak{bad="x"}\n'+tails
  ];
  for(const source of samples){
    const first=check(source);
    for(const edit of [
      source.replace('前。','前文。'),
      source.replace('::pagebreak{}','::pagebreak{side="right"}'),
      source.replace(/\$\$\n|~~~\n|-->\n|<\/script>\n|::::\n/,''),
      source.replace('\n\n','\n'),
      source+'末尾'
    ])check(edit,first.snapshot);
  }
});
test('CRLF joining, newline deletion and EOF lookahead preserve exact diagnostics',()=>{
  for(const [a,b] of [
    ['前\r\r後\n\n末尾','前\r\r\n後\n\n末尾'],
    ['::pagebreak{}\n\n後\n','::pagebreak{}\n後\n'],
    ['::pagebreak{}\n','::pagebreak{}\n後\n'],
    ['前\n\n後','前\n\n'],
    ['前\n\n','前\n\n$$\nx'],
    ['前\n \n後','前\n \r\n後'],
    ['前\n\n後','前\n\n後\n\n'],
    ['', '新規\n\n本文'],
    ['本文\n\n','']
  ])check(b,check(a).snapshot);
});
test('snapshot isolation, forged handles and oversized sources',()=>{
  const s='前。\n\n後。\n\n';
  const first=check(s);
  first.result.blocks[0].range.end=999;
  first.result.blocks.length=0;
  assert.ok(check(s,first.snapshot).result.blocks.length);
  assert.equal(check(s,{kind:'document-scan-snapshot'}).scannedCharacters,s.length);
  assert.equal(check('x'.repeat(250001)).snapshot,undefined);
});
test('300 deterministic mixed edits agree with full scanner',()=>{
  let seed=92741;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
  let source='前。\n\n::pagebreak{}\n\n$$\nx^2\n$$\n\n::::layout{}\n:::callout{}\n本文\n:::\n\n::::\n\n末尾。\n';
  const inserts=['a','😀','\r','\n','\r\n','\n\n','$$\n',':::\n','~~~\n','<!--','-->','::future{}\n',''];
  let prev=check(source);
  for(let i=0;i<300;i++){
    const start=random(source.length+1),end=Math.min(source.length,start+random(6));
    source=source.slice(0,start)+inserts[random(inserts.length)]+source.slice(end);
    prev=check(source,prev.snapshot);
  }
});
