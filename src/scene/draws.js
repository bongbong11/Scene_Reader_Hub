import {drawRandom} from './draw-opportunity.js';
import { rollAdvancedEvent, rollAdvancedEntity, advancedChance } from "../world/advanced-library.js";
import { rollEventProfile, rollNpcProfile, rollVillainProfile } from '../../prompt-library.js';
import { archiveCurrentEvent } from "./state-effects.js";
import { overrideDecision } from './coordinator.js';
export function createDraws(resolveWorld) {
function prepareProfiles(rec, decisions, details) {
    if (rec.preferences.advancedEnabled && ['create', 'continue'].includes(decisions.advanced_route)) {
        if (decisions.event_route === 'create') overrideDecision(details, decisions, 'event_route', 'none', '한 장면 기회에서는 고급 사건 추첨을 우선');
        if (decisions.advanced_route === 'create' && !rec.eventProfile) {
            if (!rec.drawOpportunityKey && rec.lastEventRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'advanced_route', 'none', '같은 기회의 고급 사건 추첨 완료');
                overrideDecision(details, decisions, 'advanced_cause', 'none', '고급 사건 추첨 대기');
                overrideDecision(details, decisions, 'advanced_element', 'none', '고급 사건 추첨 대기');
                overrideDecision(details, decisions, 'advanced_move', 'quiet', '고급 사건 추첨 대기');
            } else {
                const random=rec.drawOpportunityKey?drawRandom(rec.drawOpportunityKey,'event'):Math.random;
                const roll = 1 + Math.floor(random() * 100);
                const chance = advancedChance(rec.preferences.advancedStyle);
                rec.lastEventRoll = { roll, chance, opportunity: rec.sceneOpportunity, ...(rec.drawOpportunityKey?{drawKey:rec.drawOpportunityKey}:{}), passed:roll<=chance, advanced: true, at: new Date().toISOString() };
                if (roll <= chance && decisions.advanced_element !== 'none') {
                    const world = resolveWorld(rec);
                    rec.eventProfile = rollAdvancedEvent(decisions.advanced_element, { random, worldId: world.id, worldName: world.name, supernatural: decisions.advanced_world_rules === 'supernatural' });
                    if(rec.drawOpportunityKey)rec.eventProfile.id=`event-${rec.drawOpportunityKey}-${decisions.advanced_element}`;
                    const { entity, reused } = rollAdvancedEntity(rec.eventProfile, { random, existing: rec.advancedEntities });
                    if (entity) {
                        if(!reused&&rec.drawOpportunityKey)entity.id=`entity-${rec.drawOpportunityKey}-${decisions.advanced_element}`;
                        rec.eventProfile.entity = entity;
                        rec.eventProfile.entityReused = reused;
                        if (!reused && !['crowd'].includes(entity.form)) rec.advancedEntities = [entity, ...rec.advancedEntities].slice(0, 24);
                    }
                } else {
                    overrideDecision(details, decisions, 'advanced_route', 'none', '고급 사건 확률 추첨 대기');
                    overrideDecision(details, decisions, 'advanced_cause', 'none', '새 고급 사건 추첨 미통과');
                    overrideDecision(details, decisions, 'advanced_element', 'none', '새 고급 사건 추첨 미통과');
                    overrideDecision(details, decisions, 'advanced_move', 'quiet', '새 고급 사건 추첨 미통과');
                }
            }
        } else if (rec.eventProfile?.source === 'advanced' && decisions.advanced_route === 'continue') {
            rec.eventProfile.status = 'active';
        }
    }
    return prepareStandardProfiles(rec, decisions, details);
}

function prepareStandardProfiles(rec, decisions, details) {
    if (rec.preferences.developmentStyle && ['create','replace'].includes(decisions.event_route)) {
        overrideDecision(details, decisions, 'event_route', 'none', '기본 흐름의 새 사건 추첨 제거 · 고급 이벤트만 추첨');
    }
    if (decisions.event_route === 'retire') {
        archiveCurrentEvent(rec, 'completed');
        rec.eventProfile = null;
        rec.lastEventRoll = null;
    }
    if (decisions.event_route === 'replace') {
        rec.eventProfile = null;
        rec.lastEventRoll = null;
    }
    if (['create', 'replace'].includes(decisions.event_route)) {
        if (!rec.eventProfile) {
            if (!rec.drawOpportunityKey && rec.lastEventRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'event_route', 'waiting', '같은 장면 기회의 사건 추첨 완료');
            } else {
                const random=rec.drawOpportunityKey?drawRandom(rec.drawOpportunityKey,'event'):Math.random;
                const roll = 1 + Math.floor(random() * 100);
                rec.lastEventRoll = { roll, chance: Number(rec.preferences.eventChance) || 35, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastEventRoll.chance) rec.eventProfile = rollEventProfile(rec.preferences.progressionMode);
                else {
                    overrideDecision(details, decisions, 'event_route', 'waiting', '새 사건 확률 추첨 미통과');
                }
            }
        } else overrideDecision(details, decisions, 'event_route', 'continue', '저장된 중심 사건 계속');
    }
    if (rec.preferences.settingsContract >= 3) {
        const offer = rec.appearanceOffer;
        for (const [kind,key,profileKey] of [['npc','npc_route','npcProfile'],['villain','villain_route','villainProfile']]) {
            if (decisions[key] !== 'create') continue;
            if (offer?.passed && offer.kind === kind && offer.candidate && decisions.arrival_mode && decisions.arrival_mode !== 'none') {
                rec[profileKey] = {...offer.candidate, entry:decisions.arrival_mode, status:'pending'};
                if(kind==='villain') rec.lastVillainRoll = {...offer,candidate:undefined};
            } else overrideDecision(details,decisions,key,'none','유효한 선추첨·등장 판정 없음');
        }
    }
    if (decisions.villain_route === 'retire') {
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
    }
    if (decisions.villain_route === 'replace') {
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
    }
    if (rec.preferences.settingsContract < 3 || !rec.preferences.settingsContract) if (['create', 'replace'].includes(decisions.villain_route)) {
        if (!rec.villainProfile) {
            if (rec.lastVillainRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'villain_route', 'waiting', '같은 장면 기회의 빌런 추첨 완료');
            } else {
                const random=rec.drawOpportunityKey?drawRandom(rec.drawOpportunityKey,'event'):Math.random;
                const roll = 1 + Math.floor(random() * 100);
                rec.lastVillainRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastVillainRoll.chance) rec.villainProfile = { ...rollVillainProfile(), status: 'active', createdAt: new Date().toISOString() };
                else {
                    overrideDecision(details, decisions, 'villain_route', 'waiting', '새 빌런 확률 추첨 미통과');
                }
            }
        }
        else overrideDecision(details, decisions, 'villain_route', 'continue', '저장된 빌런 계속');
    }
    if (decisions.npc_route === 'retire') {
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
    }
    if (decisions.npc_route === 'replace') {
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
    }
    if (rec.preferences.settingsContract < 3 || !rec.preferences.settingsContract) if (['create', 'replace'].includes(decisions.npc_route)) {
        if (!rec.npcProfile || rec.npcProfile.status === 'retired') {
            if (rec.lastNpcRoll?.opportunity === rec.sceneOpportunity) {
                overrideDecision(details, decisions, 'npc_route', 'waiting', '같은 장면 기회의 NPC 추첨 완료');
            } else {
                const random=rec.drawOpportunityKey?drawRandom(rec.drawOpportunityKey,'event'):Math.random;
                const roll = 1 + Math.floor(random() * 100);
                rec.lastNpcRoll = { roll, chance: Number(rec.preferences.appearanceChance) || 10, opportunity: rec.sceneOpportunity, at: new Date().toISOString() };
                if (roll <= rec.lastNpcRoll.chance) rec.npcProfile = rollNpcProfile(rec.preferences.progressionMode);
                else {
                    overrideDecision(details, decisions, 'npc_route', 'waiting', '새 NPC 확률 추첨 미통과');
                }
            }
        }
        else overrideDecision(details, decisions, 'npc_route', 'reuse', '저장된 일반 NPC 재사용');
    }
    if (decisions.npc_route === 'reuse' && rec.npcProfile) rec.npcProfile.status = 'active';
    if (decisions.npc_route === 'background' && rec.npcProfile) rec.npcProfile.status = 'background';
}

return { prepareProfiles, prepareStandardProfiles };
}
