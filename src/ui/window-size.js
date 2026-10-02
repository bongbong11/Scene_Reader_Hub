const STORAGE_KEY='sceneReader.hubWindowSize.v1';
const DEFAULT_SIZE={width:760,height:820};

export function windowBounds({viewportWidth,viewportHeight,offsetTop=0,offsetLeft=0,anchor=null,...preferred}) {
    const vw=Math.max(1,Number(viewportWidth)||760),vh=Math.max(1,Number(viewportHeight)||820);
    const gap=vw<=600?8:12;
    const availableWidth=Math.max(1,vw-gap*2),availableHeight=Math.max(1,vh-gap*2);
    const left=anchor?Math.max(offsetLeft+gap,Math.min(anchor.left,offsetLeft+vw-gap-Math.min(300,availableWidth))):null;
    const top=anchor?Math.max(offsetTop+gap,Math.min(anchor.top,offsetTop+vh-gap-Math.min(340,availableHeight))):null;
    const maxWidth=anchor?offsetLeft+vw-gap-left:availableWidth,maxHeight=anchor?offsetTop+vh-gap-top:availableHeight;
    const fit=(value,fallback,minimum,maximum)=>Math.max(Math.min(minimum,maximum),Math.min(maximum,Number(value)||fallback));
    const width=fit(preferred.width,760,300,maxWidth),height=fit(preferred.height,820,340,maxHeight);
    return {width,height,left:left??offsetLeft+(vw-width)/2,top:top??offsetTop+(vh-height)/2};
}

export function bindWindowSize({dialog,window}) {
    let preferred={...DEFAULT_SIZE},storage,anchor=null,drag=null;
    const handle=dialog.querySelector('#sr-resize-handle');
    try {
        storage=window.localStorage;
        const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
        if(saved&&Number.isFinite(saved.width)&&Number.isFinite(saved.height))preferred={width:saved.width,height:saved.height};
    } catch {/* Window preferences must never prevent opening the reader. */}
    function render() {
        const viewport=window.visualViewport;
        const frame=windowBounds({viewportWidth:viewport?.width||window.innerWidth,viewportHeight:viewport?.height||window.innerHeight,
            offsetTop:viewport?.offsetTop||0,offsetLeft:viewport?.offsetLeft||0,anchor,...preferred});
        for(const key of ['width','height','left','top'])dialog.style[key]=`${frame[key]}px`;
        dialog.dataset.compactHeight=String(frame.height<450);
        handle?.setAttribute('aria-label',`창 크기 조절 · ${Math.round(frame.width)} × ${Math.round(frame.height)}. 잡아서 끌거나 방향키로 조절합니다. 두 번 누르면 기본 크기로 돌아갑니다.`);
        return frame;
    }
    function save() {
        const frame=render();
        preferred={width:frame.width,height:frame.height};
        try {storage?.setItem(STORAGE_KEY,JSON.stringify(preferred));} catch {/* Browser storage can be unavailable. */}
    }
    function reset() {
        anchor=null;
        preferred={...DEFAULT_SIZE};
        save();
    }
    handle?.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.isPrimary===false||drag)return;
        event.preventDefault();
        const frame=render();
        anchor={left:frame.left,top:frame.top};
        drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:frame.width,height:frame.height};
        dialog.dataset.resizing='true';
        handle.setPointerCapture(event.pointerId);
    });
    handle?.addEventListener('pointermove',event=>{
        if(!drag||event.pointerId!==drag.id)return;
        preferred={width:drag.width+event.clientX-drag.x,height:drag.height+event.clientY-drag.y};
        render();
    });
    function finish(event) {
        if(!drag||event.pointerId!==drag.id)return;
        const id=drag.id;
        drag=null;
        dialog.dataset.resizing='false';
        save();
        if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
    }
    for(const event of ['pointerup','pointercancel','lostpointercapture'])handle?.addEventListener(event,finish);
    handle?.addEventListener('dblclick',reset);
    handle?.addEventListener('keydown',event=>{
        if(event.key==='Home'){event.preventDefault();reset();return;}
        const changes={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
        const change=changes[event.key];
        if(!change)return;
        event.preventDefault();
        const frame=render(),step=event.shiftKey?64:24;
        anchor={left:frame.left,top:frame.top};
        preferred={width:frame.width+change[0]*step,height:frame.height+change[1]*step};
        save();
    });
    function fitViewport(){anchor=null;render();}
    window.addEventListener?.('resize',fitViewport);
    window.visualViewport?.addEventListener('resize',fitViewport);
    window.visualViewport?.addEventListener('scroll',fitViewport);
    dialog.addEventListener('toggle',fitViewport);
    render();
    return {render};
}
