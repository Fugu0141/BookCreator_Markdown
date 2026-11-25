import type { Block, DocumentResult } from './document.js';
import type { Range } from './index.js';

export interface ScannedDocument {documentId:string; revision:string; parsed:DocumentResult}
export interface BlockIdOccurrence {id:string; documentId:string; revision:string; range:Range}
export interface BlockIdDiagnostic {code:'BCM_DUPLICATE_BLOCK_ID'; occurrence:BlockIdOccurrence; first:BlockIdOccurrence}
// Block directive IDs only; no inline reference resolution or publication validation.
export function indexBlockIds(documents:readonly ScannedDocument[]) {
  const byId=new Map<string,BlockIdOccurrence[]>();
  const diagnostics:BlockIdDiagnostic[]=[];
  const documentIds=new Set<string>();
  function visit(doc:ScannedDocument,blocks:readonly Block[]) {
    for(const block of blocks)if(block.kind==='directive'){
      if(block.closed&&block.header.id){
        const entry={id:block.header.id,documentId:doc.documentId,revision:doc.revision,range:{...block.header.range}};
        const entries=byId.get(entry.id);
        if(entries){diagnostics.push({code:'BCM_DUPLICATE_BLOCK_ID',occurrence:entry,first:entries[0]});entries.push(entry);}
        else byId.set(entry.id,[entry]);
      }
      visit(doc,block.children);
    }
  }
  for(const doc of documents){
    if(!doc.documentId||!doc.revision||documentIds.has(doc.documentId))throw new Error('Invalid or duplicate document identity');
    documentIds.add(doc.documentId);
    visit(doc,doc.parsed.blocks);
  }
  return {byId,diagnostics};
}
