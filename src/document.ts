import {parseDirectiveHeader, type Directive, type Diagnostic, type Range} from './index.js';
export type Block = {kind:'raw'|'code'|'math'|'heading'|'blank'; range:Range; level?:number} | {kind:'directive'; header:Directive; range:Range; children:Block[]; closed:boolean};
export interface DocumentResult {source:string; blocks:Block[]; diagnostics:Diagnostic[]}
const known = new Set(['pagebreak','blank-page','figure','layout','callout','component','slot','canvas','toc','list-of','bibliography']);
// Lossless block scanning PoC; raw Markdown is opaque, not a CommonMark AST.
type Checkpoint={offset:number;blocks:number;diagnostics:number};
type ScanState={result:DocumentResult;checkpoints:Checkpoint[]};
export interface DocumentScanSnapshot {readonly kind:'document-scan-snapshot'}
export interface IncrementalDocumentScan {
  result:DocumentResult;
  snapshot?:DocumentScanSnapshot;
  /** Scanner-consumed UTF-16 units only. Excludes source comparison and copying. */
  scannedCharacters:number;
  reusedPrefixCharacters:number;
  reusedSuffixCharacters:number;
}
const snapshots=new WeakMap<DocumentScanSnapshot,ScanState>();
const MAX_SOURCE=250000,MAX_BLOCKS=20000;
const shiftRange=(r:Range,delta:number):Range=>({start:r.start+delta,end:r.end+delta});
function copyBlock(b:Block,delta:number):Block{
  if(b.kind!=='directive')return {...b,range:shiftRange(b.range,delta)};
  return {...b,range:shiftRange(b.range,delta),header:{...b.header,range:shiftRange(b.header.range,delta),
    attributes:b.header.attributes.map(a=>({...a,range:shiftRange(a.range,delta)}))},
    children:b.children.map(c=>copyBlock(c,delta))};
}
const copyDiagnostic=(d:Diagnostic,delta:number):Diagnostic=>({...d,range:shiftRange(d.range,delta)});
function validCut(source:string,offset:number){
  return offset===0||((source[offset-1]==='\\n'||source[offset-1]==='\\r')&&!(source[offset-1]==='\\r'&&source[offset]==='\\n'));
}
export function scanDocument(source:string):DocumentResult {
  return scanFrom(source,0).result;
}
/** Resume only at a scanner-proven root blank-line boundary. Stop only after
 * reaching another such boundary with an exactly identical remaining source. */
export function scanDocumentIncremental(source:string,previous?:DocumentScanSnapshot):IncrementalDocumentScan{
  const old=previous?snapshots.get(previous):undefined;
  let prefix:Checkpoint={offset:0,blocks:0,diagnostics:0};
  let suffix:Checkpoint|undefined;
  let delta=0;
  const retain=source.length<=MAX_SOURCE;
  if(retain&&old){
    const before=old.result.source;
    let common=0,tail=0;
    while(common<before.length&&common<source.length&&before[common]===source[common])common++;
    while(tail<before.length-common&&tail<source.length-common&&before[before.length-1-tail]===source[source.length-1-tail])tail++;
    delta=source.length-before.length;
    for(const cp of old.checkpoints){
      if(cp.offset>common)break;
      if(validCut(source,cp.offset))prefix=cp;
    }
    // Matching suffix checkpoints, indexed by their new source offsets.
    const candidates=new Map<number,Checkpoint>();
    for(const cp of old.checkpoints){
      if(cp.offset>=before.length-tail&&cp.offset>=prefix.offset&&cp.offset<before.length&&validCut(source,cp.offset+delta))
        candidates.set(cp.offset+delta,cp);
    }
    const middle=scanFrom(source,prefix.offset,offset=>{
      const candidate=candidates.get(offset);
      if(!candidate)return false;
      suffix=candidate;return true;
    },true);
    const blocks=old.result.blocks.slice(0,prefix.blocks).map(b=>copyBlock(b,0));
    const diagnostics=old.result.diagnostics.slice(0,prefix.diagnostics).map(d=>copyDiagnostic(d,0));
    const checkpoints=old.checkpoints.filter(cp=>cp.offset<prefix.offset).map(cp=>({...cp}));
    for(const cp of middle.checkpoints)checkpoints.push({offset:cp.offset,blocks:cp.blocks+blocks.length,diagnostics:cp.diagnostics+diagnostics.length});
    blocks.push(...middle.result.blocks);diagnostics.push(...middle.result.diagnostics);
    if(suffix){
      const cut:Checkpoint=suffix;
      const blockDelta=blocks.length-cut.blocks,diagnosticDelta=diagnostics.length-cut.diagnostics;
      blocks.push(...old.result.blocks.slice(cut.blocks).map(b=>copyBlock(b,delta)));
      diagnostics.push(...old.result.diagnostics.slice(cut.diagnostics).map(d=>copyDiagnostic(d,delta)));
      for(const cp of old.checkpoints)if(cp.offset>cut.offset)checkpoints.push({offset:cp.offset+delta,blocks:cp.blocks+blockDelta,diagnostics:cp.diagnostics+diagnosticDelta});
    }
    return finish({source,blocks,diagnostics},checkpoints,middle.end-prefix.offset,prefix.offset,suffix?before.length-suffix.offset:0);
  }
  const full=scanFrom(source,0,undefined,retain);
  return finish(full.result,full.checkpoints,source.length,0,0);
}
function finish(result:DocumentResult,checkpoints:Checkpoint[],scannedCharacters:number,reusedPrefixCharacters:number,reusedSuffixCharacters:number):IncrementalDocumentScan{
  let snapshot:DocumentScanSnapshot|undefined;
  if(result.source.length<=MAX_SOURCE&&result.blocks.length<=MAX_BLOCKS&&checkpoints.length<=MAX_BLOCKS){
    snapshot=Object.freeze({kind:'document-scan-snapshot' as const});
    snapshots.set(snapshot,{result:{source:result.source,blocks:result.blocks.map(b=>copyBlock(b,0)),diagnostics:result.diagnostics.map(d=>copyDiagnostic(d,0))},checkpoints});
  }
  return {result,snapshot,scannedCharacters,reusedPrefixCharacters,reusedSuffixCharacters};
}
function scanFrom(source:string,offset:number,stop?:(offset:number)=>boolean,collect=false){
  const blocks:Block[]=[], diagnostics:Diagnostic[]=[], stack:Extract<Block,{kind:'directive'}>[]=[];
  const checkpoints:Checkpoint[]=collect?[{offset,blocks:0,diagnostics:0}]:[];
  // One line lookahead, not an eagerly materialized array of the entire file.
  const pattern=/[^\\r\\n]*(?:\\r\\n|\\r|\\n|$)/g;
  pattern.lastIndex=offset;
  const lines=source.matchAll(pattern);
  const read=()=>{const next=lines.next();return next.done||!next.value[0].length?undefined:next.value;};
  let m=read(),next=read(),endOffset=offset;
  const target=()=>stack.at(-1)?.children??blocks;
  const warn=(code:string,range:Range,message:string)=>diagnostics.push({code,range,message});
  let protectedBlock:{kind:'code'|'math'|'raw';start:number;end:number;close:(line:string)=>boolean}|undefined;
  let boundary=true;
  for(;m;m=next,next=read()){
    const nextLine=next?.[0].replace(/(?:\\r\\n|\\r|\\n)$/,'');
    const validAfter=(parentFence?:number)=>nextLine===undefined||/^[ \t]*$/.test(nextLine)||(parentFence!==undefined&&nextLine.replace(/[ \t]+$/,'')===':'.repeat(parentFence));
    const start=m.index!,end=start+m[0].length,line=m[0].replace(/(?:\r\n|\r|\n)$/,'');
    endOffset=end;
    const range={start,end};
    if(protectedBlock){protectedBlock.end=end;if(protectedBlock.close(line)){target().push({kind:protectedBlock.kind,range:{start:protectedBlock.start,end}});protectedBlock=undefined;boundary=true;}continue;}
    const fence=/^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if(fence && !(fence[1][0]==='`'&&fence[2].includes('`'))){const token=fence[1];protectedBlock={kind:'code',start,end,close:l=>new RegExp('^ {0,3}'+token[0]+'{'+token.length+',}[ \\t]*$').test(l)};continue;}
    if(boundary&&/^\$\$[ \t]*$/.test(line)){protectedBlock={kind:'math',start,end,close:l=>/^\$\$[ \t]*$/.test(l)};continue;}
    if(/^ {0,3}<!--/.test(line)&&!line.includes('-->')){protectedBlock={kind:'raw',start,end,close:l=>l.includes('-->')};continue;}
    if(/^ {0,3}<(?:script|style|pre|textarea)(?:\s|>|$)/i.test(line)){const tag=/^ {0,3}<([a-z]+)/i.exec(line)![1];const close=(l:string)=>new RegExp('</'+tag+'\\s*>','i').test(l);if(!close(line)){protectedBlock={kind:'raw',start,end,close};continue;}}
    if(boundary&&/^ {0,3}<[A-Za-z!/]/.test(line)&&!line.startsWith('<!--')){protectedBlock={kind:'raw',start,end,close:l=>/^\s*$/.test(l)};continue;}
    const closing=/^(:{3,})[ \t]*$/.exec(line);
    const top=stack.at(-1);
    if(closing&&top){if(closing[1].length===top.header.fence){top.range.end=end;top.closed=true;stack.pop();if(!validAfter(stack.at(-1)?.header.fence))warn('BCM_BLOCK_BOUNDARY',range,'Expected blank line or parent boundary after container');boundary=true;continue;}warn('BCM_FENCE',range,'Mismatched closing fence');}
    if(boundary&&/^:{2,}[a-z][a-z0-9-]*\{/.test(line)){
      const parsed=parseDirectiveHeader(line,start);diagnostics.push(...parsed.diagnostics);const header=parsed.directives[0];
      if(header){
        if(header.kind==='container'&&((top&&header.fence>=top.header.fence)||stack.length>=64)){warn('BCM_NESTING',range,'Invalid nesting or depth limit');}
        else {const block:Extract<Block,{kind:'directive'}>={kind:'directive',header,range:{...range},children:[],closed:header.kind==='leaf'};target().push(block);if(!known.has(header.name))warn('BCM_UNKNOWN',range,'Unknown directive; preserved');if(header.kind==='container')stack.push(block);else if(!validAfter(top?.header.fence))warn('BCM_BLOCK_BOUNDARY',range,'Expected blank line or parent boundary after leaf');boundary=header.kind==='container';continue;}
      }
    }
    const heading=/^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(line);
    const blank=/^[ \t]*$/.test(line);
    target().push({kind:blank?'blank':heading?'heading':/^ {4}|^\t/.test(line)?'code':'raw',range,...(heading?{level:heading[1].length}:{})});boundary=blank;
    if(blank&&!stack.length&&validCut(source,end)){
      if(collect)checkpoints.push({offset:end,blocks:blocks.length,diagnostics:diagnostics.length});
      if(stop?.(end))return {result:{source,blocks,diagnostics},checkpoints,end:endOffset};
    }
  }
  if(protectedBlock){target().push({kind:protectedBlock.kind,range:{start:protectedBlock.start,end:source.length}});if(protectedBlock.kind==='math')warn('BCM_MATH', {start:protectedBlock.start,end:source.length},'Unclosed math block');}
  for(const block of stack){block.range.end=source.length;warn('BCM_UNCLOSED',block.range,'Unclosed container');}
  return {result:{source,blocks,diagnostics},checkpoints,end:endOffset};
}
