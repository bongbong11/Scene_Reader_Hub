export const slotBlock=(kind,content)=>content?`<SCENE_READER_OUTPUT data-source="scene_reader_hub" data-kind="${kind}">\n${content}\n</SCENE_READER_OUTPUT>`:'';
