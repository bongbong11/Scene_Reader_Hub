import {UI} from './opportunity-copy.js';
import {opportunitySettings} from '../scene/opportunity-settings.js';
export function opportunitySettingsTemplate() {
    return `<section class="sr-control-card sr-opportunity-controls"><label class="checkbox_label"><input id="sr-new-generation-enabled" type="checkbox" aria-describedby="sr-generation-help"><strong>${UI.generationLabel}</strong></label><label for="sr-spontaneous-mode">${UI.label}</label><select id="sr-spontaneous-mode" class="text_pole" aria-describedby="sr-generation-help">${Object.entries(UI.options).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><div class="sr-grid-2"><div><label for="sr-advanced-style">사건 확률</label><select id="sr-advanced-style" class="text_pole"><option value="conservative">18%</option><option value="balanced">35%</option><option value="active">58%</option><option value="very_active">75%</option></select></div><div><label for="sr-appearance-chance">인물 확률</label><select id="sr-appearance-chance" class="text_pole">${[5,10,20,35,50,75,100].map(x=>`<option value="${x}">${x}%</option>`).join('')}</select></div></div><p id="sr-generation-help" class="sr-help" role="status"></p><p class="sr-help">${UI.chance}</p></section>`;
}
export function renderOpportunitySettings({document,preferences}) {
    const prefs=preferences(),cfg=opportunitySettings(prefs);
    const generation=document.getElementById('sr-new-generation-enabled'),mode=document.getElementById('sr-spontaneous-mode');
    if(generation)generation.checked=cfg.enabled;
    if(mode){mode.value=cfg.spontaneousMode;mode.disabled=!cfg.enabled;}
    const event=document.getElementById('sr-advanced-style');if(event){event.value=prefs.advancedStyle;event.disabled=!cfg.eventEnabled;}
    const person=document.getElementById('sr-appearance-chance');
    if(person){if(person.options&&!Array.from(person.options).some(x=>x.value===String(prefs.appearanceChance))){const option=document.createElement('option');option.value=String(prefs.appearanceChance);option.textContent=`${prefs.appearanceChance}%`;person.append(option);}person.value=String(prefs.appearanceChance);person.disabled=!cfg.enabled;}
    const help=document.getElementById('sr-generation-help');if(help)help.textContent=!cfg.enabled?UI.generationOff:!cfg.eventEnabled?UI.compactHelp+' 사건 확률은 돌발 사건 또는 고급 전개를 켜면 적용됩니다.':UI.compactHelp;
}
export function bindOpportunitySettings(deps) {
    for(const [id,key,read] of [['sr-new-generation-enabled','newGenerationEnabled',e=>e.target.checked],['sr-spontaneous-mode','spontaneousMode',e=>e.target.value]]) {
        deps.document.getElementById(id)?.addEventListener('change',event=>deps.runUiTask(deps.savePreference(key,read(event)).then(deps.setFormValues)));
    }
}
