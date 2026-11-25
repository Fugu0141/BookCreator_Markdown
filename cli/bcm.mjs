#!/usr/bin/env node
import {open,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {scanDocument,indexBlockIds,validateScannedBlocks} from '../dist/index.js';
const LIMIT=4*1024*1024, TOTAL=16*1024*1024;
async function read(path){
  const file=await open(path,'r');
  try{
    const s=await file.stat();
    if(!s.isFile()||s.size>LIMIT)throw Error('Expected regular file up to 4 MiB');
    const bytes=Buffer.alloc(LIMIT+1);let used=0;
    while(used<bytes.length){const {bytesRead}=await file.read(bytes,used,bytes.length-used,null);if(!bytesRead)break;used+=bytesRead;}
    if(used>LIMIT)throw Error('Input too large');
    return bytes.subarray(0,used);
  }finally{await file.close();}
}
async function main(){
  const [command,...paths]=process.argv.slice(2);
  if(!['parse','validate','ids'].includes(command)||!paths.length||paths.length>64||paths.some(p=>p.startsWith('-')))throw Error('Usage: bcm <parse|validate|ids> <file> [...]');
  const documents=[];let total=0;
  for(const path of paths){
    const documentId=await realpath(path),bytes=await read(documentId);
    if((total+=bytes.length)>TOTAL)throw Error('Total input exceeds 16 MiB');
    const source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    const revision=createHash('sha256').update(bytes).digest('hex');
    documents.push({documentId,revision,parsed:scanDocument(source)});
  }
  const ids=indexBlockIds(documents);
  const validation=documents.map(d=>({documentId:d.documentId,...validateScannedBlocks(d.parsed)}));
  const errors=validation.some(v=>v.diagnostics.length)||ids.diagnostics.length>0;
  const result={schemaVersion:1,scope:'experimental-block-scan',complete:false,publicationReady:false,diagnostics:validation,duplicateIds:ids.diagnostics,
    ...(command==='parse'?{documents}:{}),...(command==='ids'?{ids:[...ids.byId.entries()]}:{})};
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  process.exitCode=errors?1:0;
}
main().catch(e=>{process.stderr.write(String(e.message??e)+'\n');process.exitCode=2;});
