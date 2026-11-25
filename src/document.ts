import {parseDirectiveHeader, type Directive, type Diagnostic, type Range} from './index.js';
export type Block = {kind:'raw'|'code'|'math'|'heading'|'blank'; range:Range; level?:number} | {kind:'directive'; header:Directive; range:Range; children:Block[]; closed:boolean};
export interface DocumentResult {source:string; blocks:Block[]; diagnostics:Diagnostic[]}
const known = new Set(['pagebreak','blank-page','figure','layout','callout','component','slot','canvas','toc','list-of','bibliography']);
// Lossless block scanning PoC; raw Markdown is opaque, not a CommonMark AST.
export function scanDocument(source:string):DocumentResult {
  const blocks:Block[]=[], diagnostics:Diagnostic[]=[], stack:Extract<Block,{kind:'directive'}>[]=[];
  const lines=Array.from(source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)).filter(m=>m[0].length>0);
  const target=()=>stack.at(-1)?.children??blocks;
  const warn=(code:string,range:Range,message:string)=>diagnostics.push({code,range,message});
  let protectedBlock:{kind:'code'|'math'|'raw';start:number;end:number;close:(line:string)=>boolean}|undefined;
  let boundary=true;
  for(const m of lines){
    const start=m.index!,end=start+m[0].length,line=m[0].replace(/(?:\r\n|\r|\n)$/,'');
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
    if(closing&&top){if(closing[1].length===top.header.fence){top.range.end=end;top.closed=true;stack.pop();boundary=true;continue;}warn('BCM_FENCE',range,'Mismatched closing fence');}
    if(boundary&&/^:{2,}[a-z][a-z0-9-]*\{/.test(line)){
      const parsed=parseDirectiveHeader(line,start);diagnostics.push(...parsed.diagnostics);const header=parsed.directives[0];
      if(header){
        if(header.kind==='container'&&((top&&header.fence>=top.header.fence)||stack.length>=64)){warn('BCM_NESTING',range,'Invalid nesting or depth limit');}
        else {const block:Extract<Block,{kind:'directive'}>={kind:'directive',header,range:{...range},children:[],closed:header.kind==='leaf'};target().push(block);if(!known.has(header.name))warn('BCM_UNKNOWN',range,'Unknown directive; preserved');if(header.kind==='container')stack.push(block);boundary=header.kind==='container';continue;}
      }
    }
    const heading=/^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(line);
    const blank=/^[ \t]*$/.test(line);
    target().push({kind:blank?'blank':heading?'heading':/^ {4}|^\t/.test(line)?'code':'raw',range,...(heading?{level:heading[1].length}:{})});boundary=blank;
  }
  if(protectedBlock){target().push({kind:protectedBlock.kind,range:{start:protectedBlock.start,end:source.length}});if(protectedBlock.kind==='math')warn('BCM_MATH', {start:protectedBlock.start,end:source.length},'Unclosed math block');}
  for(const block of stack){block.range.end=source.length;warn('BCM_UNCLOSED',block.range,'Unclosed container');}
  return {source,blocks,diagnostics};
}
