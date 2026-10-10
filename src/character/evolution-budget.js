const chars=text=>Array.from(text).length;
const bytes=text=>new TextEncoder().encode(text).length;

// The immutable original is a writing target, not an exact replacement cap.
// Only abnormal per-item payloads need review. Never compound this ceiling
// from an already expanded current version on subsequent analysis cycles.
export function evolutionRuleBudget(original){
 const rule=String(original?.rule||''),targetChars=chars(rule),targetUtf8=bytes(rule);
 const maxChars=Math.max(4000,targetChars),maxUtf8=Math.max(12000,targetUtf8);
 return {targetChars,targetUtf8,maxChars,maxUtf8,maxJsonStringUtf8:maxUtf8*2+2};
}
