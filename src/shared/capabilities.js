// Copy only declared capabilities. No shared mutable dependency registry.
export function selectCapabilities(source,names) {
    const selected={};
    for(const name of names) {
        Object.defineProperty(selected,name,{enumerable:true,get:()=>source[name],set:value=>{
            let owner=source;
            while(!Object.hasOwn(owner,name)&&Object.getPrototypeOf(owner))owner=Object.getPrototypeOf(owner);
            if(!Object.hasOwn(owner,name))owner=source;
            owner[name]=value;
        }});
    }
    return selected;
}
