// Bounded transport receipts only; no stored chat data or new execution state.
export function createRequestOwnership(limit=6) {
    const entries=new Map();let epoch=0;
    return {
        get epoch(){return epoch;},
        get pending(){return entries.size>0;},
        get:key=>entries.get(key),
        remember(key,owner,owned){
            entries.delete(key);entries.set(key,{owner,owned,epoch,cancelled:false});
            while(entries.size>limit)entries.delete(entries.keys().next().value);
        },
        reset(){
            for(const [key,entry] of entries){
                if(entry.owner.requestSent)entries.delete(key);
                else entry.cancelled=true;
            }
            epoch++;
        },
    };
}
