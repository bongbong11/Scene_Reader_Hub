// Only review answers pass here; RP, original JSON and other extensions stay untouched.
const wrappers=new Set('p div span b strong i em u s small br hr ul ol li blockquote pre code answer response'.split(' '));
const breaks=new Set('p div br hr li blockquote pre'.split(' '));
const voids=new Set('br hr img input meta link wbr'.split(' '));
export function cleanReviewText(value){
 const text=String(value??'').replace(/&lt;|&#0*60;|&#x0*3c;/gi,'<').replace(/&gt;|&#0*62;|&#x0*3e;/gi,'>');
 const tags=/<!--[\s\S]*?(?:-->|$)|<\?[\s\S]*?\?>|<![^>]*>|<\/?([a-z][\w:.-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/gi;
 const stack=[];let end=0,out='';
 const hidden=()=>stack.some(item=>item.hidden);
 for(const match of text.matchAll(tags)){
  if(!hidden())out+=text.slice(end,match.index);
  end=match.index+match[0].length;
  const name=match[1]?.toLowerCase();if(!name)continue;
  if(/^<\//.test(match[0])){
   const index=stack.findLastIndex(item=>item.name===name);
   if(index>=0)stack.splice(index);
  }else if(!/\/\s*>$/.test(match[0])&&!voids.has(name))stack.push({name,hidden:!wrappers.has(name)});
  if(!hidden()&&breaks.has(name))out+='\n';
 }
 if(!hidden())out+=text.slice(end);
 return out.replace(/<[a-z][^>]*$/i,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
