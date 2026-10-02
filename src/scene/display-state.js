// Derived display state only. Never write 5/6 into the legacy stored level.
export function sceneDisplayState(scene) {
    if(!scene)return {stage:null,status:'unavailable',route:'normal'};
    const route=scene.route==='paused'?'paused':'normal';
    if(scene.error||scene.phase==='unclear'||scene.level==='unclear')return {stage:null,status:'unclear',route};
    if(route==='normal'&&(scene.phase==='ended'||scene.transition==='exited'))return {stage:6,status:'ended',route};
    if(scene.phase==='paused'&&route==='paused')return {stage:5,status:'paused',route};
    const level=Number(scene.level);
    return {stage:Number.isInteger(level)&&level>=0&&level<=4?level:null,status:'confirmed',route};
}
