function extractSingleJsonObject(text) {
    const objects=[];
    let start=-1,depth=0,quoted=false,escaped=false;
    for(let index=0;index<text.length;index++) {
        const char=text[index];
        if(start<0) { if(char==='{') {start=index;depth=1;} continue; }
        if(quoted) {
            if(escaped)escaped=false;
            else if(char==='\\')escaped=true;
            else if(char==='"')quoted=false;
        } else if(char==='"')quoted=true;
        else if(char==='{')depth++;
        else if(char==='}') {
            depth--;
            if(depth===0) { objects.push(text.slice(start,index+1));start=-1; }
        }
    }
    if(start>=0)throw new Error('JSON 객체가 끝나지 않았습니다.');
    if(objects.length!==1)throw new Error(objects.length?'JSON 객체가 여러 개라 결과를 특정할 수 없습니다.':'JSON 객체를 찾지 못했습니다.');
    return objects[0];
}

export function parseReasonerReply(content) {
    let value = content;
    for (let depth = 0; depth < 5; depth++) {
        if (Array.isArray(value)) {
            value = value.map(part => typeof part === 'string' ? part : part?.text || '').join('');
        } else if (value && typeof value === 'object') {
            if (typeof value.text === 'string') value = value.text;
            else if (Array.isArray(value.parts)) value = value.parts;
            else if (typeof value.content === 'string' || Array.isArray(value.content)) value = value.content;
            else if (typeof value.output === 'string') value = value.output;
            else break;
        } else break;
    }
    if (typeof value === 'string') {
        const raw = value.replace(/^\uFEFF/, '').trim();
        if (!raw) throw new Error('모델 응답이 비어 있습니다.');
        const fences = [...raw.matchAll(/```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)```/gi)];
        if (fences.length > 1) throw new Error('JSON 코드 블록이 여러 개라 결과를 특정할 수 없습니다.');
        const text = fences.length ? fences[0][1].trim() : extractSingleJsonObject(raw);
        try { value = JSON.parse(text); }
        catch (error) { throw new Error(`JSON 문법이 불완전합니다: ${error.message}`); }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('모델이 JSON 객체를 반환하지 않았습니다.');
    return value;
}
