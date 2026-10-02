import assert from 'node:assert/strict';
import {windowBounds,bindWindowSize} from '../src/ui/window-size.js';

const key='sceneReader.hubWindowSize.v1';
assert.deepEqual(windowBounds({viewportWidth:1280,viewportHeight:900}),{width:760,height:820,left:260,top:40});
assert.deepEqual(windowBounds({viewportWidth:390,viewportHeight:667}),{width:374,height:651,left:8,top:8});
assert.deepEqual(windowBounds({viewportWidth:390,viewportHeight:280,offsetTop:40,offsetLeft:3}),{width:374,height:264,left:11,top:48});
assert.deepEqual(windowBounds({viewportWidth:1280,viewportHeight:900,width:9999,height:9999,anchor:{left:260,top:40}}),{width:1008,height:848,left:260,top:40});
for(const [viewportWidth,viewportHeight] of [[320,480],[740,360],[250,200]]){
    const result=windowBounds({viewportWidth,viewportHeight,width:9999,height:-10});
    assert.ok(result.width<=viewportWidth-16&&result.height<=viewportHeight-16,'invalid preferences stay inside a small screen');
    assert.ok(result.left>=8&&result.top>=8);
}

function fixture({saved=null,storageFails=false}={}){
    const events={},capture=new Set();
    const handle={attrs:{},addEventListener(name,callback){events[name]=callback;},setAttribute(name,value){this.attrs[name]=value;},setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)};
    const dialog={style:{},dataset:{},querySelector:()=>handle,addEventListener(name,callback){events['dialog:'+name]=callback;}};
    const values=new Map(saved?[[key,saved]]:[]);
    const window={innerWidth:1280,innerHeight:900,visualViewport:{width:1280,height:900,offsetTop:0,offsetLeft:0,addEventListener(name,callback){events['viewport:'+name]=callback;}},addEventListener(name,callback){events['window:'+name]=callback;},get localStorage(){if(storageFails)throw Error('denied');return {getItem:name=>values.get(name),setItem(name,value){values.set(name,value);}};}};
    bindWindowSize({dialog,window});
    const emit=(name,details={})=>events[name]({pointerId:1,button:0,isPrimary:true,clientX:1000,clientY:860,preventDefault(){},...details});
    return {dialog,window,events,values,emit,capture};
}
const ui=fixture();
ui.emit('pointerdown');
assert.ok(ui.capture.has(1),'capture keeps dragging active after leaving the handle');
ui.emit('pointermove',{clientX:880,clientY:740});
assert.equal(ui.dialog.style.width,'640px');
assert.equal(ui.dialog.style.height,'700px');
assert.equal(ui.dialog.style.left,'260px','top-left stays fixed during dragging');
ui.emit('pointermove',{pointerId:2,clientX:0,clientY:0});
assert.equal(ui.dialog.style.width,'640px','another finger cannot hijack the drag');
ui.emit('pointerup');
assert.equal(ui.dialog.dataset.resizing,'false');
assert.equal(ui.capture.size,0);
assert.equal(fixture({saved:ui.values.get(key)}).dialog.style.width,'640px','dragged size survives reload');
Object.assign(ui.window.visualViewport,{width:390,height:280,offsetTop:25,offsetLeft:2});
ui.events['viewport:resize']();
assert.equal(ui.dialog.style.height,'264px');
assert.equal(ui.dialog.style.top,'33px');
assert.equal(ui.dialog.dataset.compactHeight,'true');
Object.assign(ui.window.visualViewport,{width:1280,height:900,offsetTop:0,offsetLeft:0});
ui.events['window:resize']();
assert.equal(ui.dialog.style.height,'700px','keyboard and orientation changes preserve preferred size');
ui.emit('pointerdown');
ui.emit('pointermove',{clientX:99999,clientY:99999});
assert.ok(parseFloat(ui.dialog.style.left)+parseFloat(ui.dialog.style.width)<=1268);
assert.ok(parseFloat(ui.dialog.style.top)+parseFloat(ui.dialog.style.height)<=888);
ui.emit('pointercancel');
const cancelledWidth=ui.dialog.style.width;
ui.emit('pointermove',{clientX:0,clientY:0});
assert.equal(ui.dialog.style.width,cancelledWidth,'cancelled drags stop immediately');
ui.emit('dblclick');
assert.equal(ui.dialog.style.height,'820px');
assert.equal(ui.dialog.style.width,'760px');
ui.emit('keydown',{key:'ArrowLeft'});
assert.equal(ui.dialog.style.width,'736px');
ui.emit('keydown',{key:'ArrowUp',shiftKey:true});
assert.equal(ui.dialog.style.height,'756px');
ui.emit('keydown',{key:'Home'});
assert.equal(ui.dialog.style.width,'760px');
assert.equal(fixture({saved:'broken JSON'}).dialog.style.width,'760px');
assert.equal(fixture({saved:'{"width":"wrong","height":1}'}).dialog.style.width,'760px');
assert.doesNotThrow(()=>{const denied=fixture({storageFails:true});denied.emit('pointerdown');denied.emit('pointerup');});
console.log('Window sizing passed: pointer resize, bounds, capture/cancellation, second-touch isolation, viewport offsets, persistence, keyboard and reset.');
