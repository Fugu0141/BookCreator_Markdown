import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDocument,validateScannedBlocks,indexBlockIds,parseReferenceToken,resolveExplicitReferences} from '../dist/index.js';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const validate=s=>validateScannedBlocks(scanDocument(s));
test('figure width, lexical path, crop and margin validation',()=>{
  assert.deepEqual(validate('::figure{src="../a.png" width="75%" crop-x="0.1" crop-y="0" crop-width="0.9" crop-height="1"}\n').diagnostics,[]);
  const r=validate('::figure{src="https://x/a.png" width="101%" crop-x="0" margin-left="1mm" margin-inner="1mm" extra="x"}\n');
  assert.deepEqual(r.diagnostics.map(d=>d.code),['BCM_ATTRIBUTE_VALUE','BCM_ATTRIBUTE_VALUE','BCM_UNKNOWN_ATTRIBUTE','BCM_ATTRIBUTE_CONFLICT','BCM_CROP']);
  assert.equal(r.complete,false);
});
test('required attribute and nested root command',()=>{
  assert.equal(validate('::figure{}\n').diagnostics[0].code,'BCM_REQUIRED_ATTRIBUTE');
  const r=validate(':::layout{}\n::pagebreak{side="diagonal"}\n:::\n');
  assert.deepEqual(r.diagnostics.map(d=>d.code),['BCM_BLOCK_POSITION','BCM_ATTRIBUTE_VALUE']);assert.deepEqual(r.unchecked,['layout']);
});
test('explicit isolated references resolve uniquely or report missing/ambiguous',()=>{
  const doc=(id)=>({documentId:id,revision:'1',parsed:scanDocument('::figure{#fig src="a.png"}\n')});
  const r=parseReferenceToken(':ref{target="fig" format="page"}','a',4);assert.equal(r.reference.range.start,4);
  assert.equal(resolveExplicitReferences([r.reference],indexBlockIds([doc('a')]).byId)[0].status,'resolved');
  assert.equal(resolveExplicitReferences([r.reference],indexBlockIds([doc('a'),doc('b')]).byId)[0].status,'ambiguous');
  assert.equal(resolveExplicitReferences([r.reference],new Map())[0].status,'missing');
  assert.equal(parseReferenceToken(':ref{target="fig" format="oops"}','a').diagnostics.length,1);
});
test('CLI emits JSON, diagnoses invalid input and never edits files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bcm-'));try{
    const p=join(dir,'book.md');const source='::figure{#fig src="a.png" width="75%"}\r\n';writeFileSync(p,source);
    const run=(...args)=>spawnSync(process.execPath,['cli/bcm.mjs',...args],{encoding:'utf8'});
    const r=run('ids',p);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).ids[0][0],'fig');assert.equal(JSON.parse(r.stdout).complete,false);assert.equal(readFileSync(p,'utf8'),source);
    writeFileSync(p,'::figure{width="bad"}\n');assert.equal(run('validate',p).status,1);
    assert.equal(run('validate',join(dir,'missing.md')).status,2);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('leaf and container require a following boundary; parent close is allowed',()=>{
  assert.equal(validate('::figure{src="a.png"}\nText\n').diagnostics[0].code,'BCM_BLOCK_BOUNDARY');
  assert.equal(validate(':::layout{}\nText\n:::\nText\n').diagnostics[0].code,'BCM_BLOCK_BOUNDARY');
  assert.deepEqual(validate(':::layout{}\n::figure{src="a.png"}\n:::\n').diagnostics,[]);
});
test('CLI rejects named pipe without blocking on POSIX', {skip:process.platform==='win32'},()=>{
  const dir=mkdtempSync(join(tmpdir(),'bcm-fifo-'));try{
    const p=join(dir,'pipe');const mk=spawnSync('mkfifo',[p]);assert.equal(mk.status,0);
    const r=spawnSync(process.execPath,['cli/bcm.mjs','validate',p],{encoding:'utf8',timeout:3000});
    assert.equal(r.status,2,r.error?.message??r.stderr);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
