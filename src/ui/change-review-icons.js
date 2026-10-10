const paths={
 edit:'M16 3l5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15z',
 translate:'M3 4h12M9 2v2M6 4c0 6 5 10 8 11M12 4c0 6-5 10-9 12M14 21l4-10 4 10M16 17h4',
 save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2zM7 3v6h10V3M7 21v-8h10v8',
 approve:'M5 12l4 4L19 6', exclude:'M6 6l12 12M18 6L6 18'
};
export const reviewIcon=name=>`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]?`<path d="${paths[name]}"/>`:''}</svg>`;
