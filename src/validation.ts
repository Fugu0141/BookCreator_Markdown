import {parseDirectiveHeader,type Range,type Diagnostic} from './index.js';
import type {Block,DocumentResult} from './document.js';
import type {BlockIdOccurrence} from './block-ids.js';

const oneOf=(...values:string[]) => (v:string)=>values.includes(v);
const bool=oneOf('true','false');
const positiveInt=(v:string)=>/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>0;
const length=(v:string)=>/^\d+(?:\.\d+)?(?:mm|pt|in)$/.test(v)&&Number.isFinite(parseFloat(v))&&parseFloat(v)>=0;
const positiveLength=(v:string)=>length(v)&&parseFloat(v)>0;
const fraction=(v:string)=>/^\d+(?:\.\d+)?$/.test(v)&&Number(v)>=0&&Number(v)<=1;
const width=(v:string)=>positiveLength(v)||oneOf('auto','fill')(v)||(/^\d+(?:\.\d+)?%$/.test(v)&&parseFloat(v)>0&&parseFloat(v)<=100);
const relativePath=(v:string)=>v.trim().length>0&&!/^[\/]|^[A-Za-z][A-Za-z0-9+.-]*:|[\\\u0000-\u001f\u007f]/.test(v);
const text=(_:string)=>true;
type Rule=(value:string)=>boolean;
const common:Record<string,Rule>={
  variant:v=>v.length>0,'start-position':oneOf('flow','page-top','spread-start-top','spread-end-top'),
  'split-policy':oneOf('allow','avoid','strict'),'keep-with-next':bool,'keep-with-previous':bool,
  'min-following-space':length,'margin-top':length,'margin-bottom':length,'margin-left':length,'margin-right':length,
  'margin-inner':length,'margin-outer':length,'margin-at-page-top':oneOf('keep','suppress'),'margin-at-page-bottom':oneOf('keep','suppress'),
  align:oneOf('left','center','right','inner','outer','stretch'),width,'font-size':v=>positiveLength(v)&&/(mm|pt)$/.test(v)
};
const schemas:Record<string,{rules:Record<string,Rule>;required?:string[];root?:boolean}>={
  pagebreak:{rules:{side:oneOf('any','left','right')},root:true},
  'blank-page':{rules:{count:positiveInt,numbered:bool},root:true},
  figure:{rules:{...common,src:relativePath,alt:text,caption:text,title:text,height:v=>v==='auto'||positiveLength(v),
    fit:oneOf('contain','cover','stretch'),'crop-x':fraction,'crop-y':fraction,'crop-width':v=>fraction(v)&&Number(v)>0,'crop-height':v=>fraction(v)&&Number(v)>0,rotation:oneOf('0','90','180','270'),numbered:bool},required:['src']}
};
// Only validate schemas whose applicable attributes are settled for this subset.
export function validateScannedBlocks(parsed:DocumentResult):{diagnostics:Diagnostic[];unchecked:string[];complete:false} {
  const diagnostics=[...parsed.diagnostics], unchecked=new Set<string>();
  const issue=(code:string,range:Range,message:string)=>diagnostics.push({code,range,message});
  function visit(blocks:readonly Block[],depth:number){
    for(const block of blocks){
      if(block.kind!=='directive')continue;
      const h=block.header,schema=Object.hasOwn(schemas,h.name)?schemas[h.name]:undefined;
      if(!schema){unchecked.add(h.name);visit(block.children,depth+1);continue;}
      if(h.kind!=='leaf')issue('BCM_BLOCK_KIND',h.range,'Expected a leaf directive');
      if(schema.root&&depth!==0)issue('BCM_BLOCK_POSITION',h.range,'Root directive required');
      const attrs=new Map(h.attributes.map(a=>[a.key,a]));
      for(const key of schema.required??[])if(!attrs.has(key))issue('BCM_REQUIRED_ATTRIBUTE',h.range,'Missing '+key);
      for(const attr of h.attributes){
        const rule=Object.hasOwn(schema.rules,attr.key)?schema.rules[attr.key]:undefined;
        if(!rule)issue('BCM_UNKNOWN_ATTRIBUTE',attr.range,'Unknown attribute '+attr.key);
        else if(!rule(attr.value))issue('BCM_ATTRIBUTE_VALUE',attr.range,'Invalid value for '+attr.key);
      }
      if((attrs.has('margin-left')||attrs.has('margin-right'))&&(attrs.has('margin-inner')||attrs.has('margin-outer')))issue('BCM_ATTRIBUTE_CONFLICT',h.range,'Mixed margin coordinate systems');
      const crop=['crop-x','crop-y','crop-width','crop-height'];
      const count=crop.filter(k=>attrs.has(k)).length;
      if(count&&count!==4)issue('BCM_CROP',h.range,'All four crop attributes required');
      else if(count===4){
        const [x,y,w,ht]=crop.map(k=>Number(attrs.get(k)!.value));
        if(x+w>1+Number.EPSILON||y+ht>1+Number.EPSILON)issue('BCM_CROP',h.range,'Crop exceeds normalized bounds');
      }
      visit(block.children,depth+1);
    }
  }
  visit(parsed.blocks,0);
  return {diagnostics,unchecked:[...unchecked],complete:false};
}
export interface ExplicitReference {target:string;format:'label-number'|'number'|'title'|'page';documentId:string;range:Range}
// Caller must supply an isolated inline token from an already established inline context.
// The existing header lexer can parse the same attributes with a synthetic extra colon.
export function parseReferenceToken(token:string,documentId:string,offset=0):{reference?:ExplicitReference;diagnostics:Diagnostic[]} {
  const range={start:offset,end:offset+token.length};
  const fail=(message:string)=>({diagnostics:[{code:'BCM_REF_TOKEN',range,message}]});
  if(!documentId||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(range.end)||!token.startsWith(':ref{')||/[\r\n]/.test(token))return fail('Expected isolated reference token');
  const p=parseDirectiveHeader(':'+token);
  const h=p.directives[0];
  if(!h||p.diagnostics.length||h.id||h.attributes.some(a=>a.key!=='target'&&a.key!=='format'))return fail('Invalid reference attributes');
  const target=h.attributes.find(a=>a.key==='target')?.value,format=h.attributes.find(a=>a.key==='format')?.value??'label-number';
  if(!target||!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(target)||!oneOf('label-number','number','title','page')(format))return fail('Invalid reference target or format');
  return {reference:{target,format:format as ExplicitReference['format'],documentId,range},diagnostics:[]};
}
// Does not infer target kind, assigned numbers, or document completeness.
export function resolveExplicitReferences(references:readonly ExplicitReference[],index:ReadonlyMap<string,readonly BlockIdOccurrence[]>){
  return references.map(reference=>{
    const matches=index.get(reference.target)??[];
    return {reference,status:matches.length===1?'resolved' as const:matches.length?'ambiguous' as const:'missing' as const,matches};
  });
}
