import {createStorageHttp} from './http.js';
import {createProfileLoader} from '../adapters/profile-loader.js';
import {createSettingsRepository} from './settings.js';
import {createSessionRepository} from './session.js';
import {createHydration} from './hydrate.js';
import {createHistoryRepository} from './history.js';
import {selectCapabilities} from '../shared/capabilities.js';
// Runtime coordination; dependencies are explicit and supplied by the application.
export function createRepository(deps) {
const services=Object.create(deps);
Object.defineProperty(services,'storagePost',{configurable:true,get:()=>storagePost});
Object.defineProperty(services,'loadReasonerProfiles',{configurable:true,get:()=>loadReasonerProfiles});
Object.defineProperty(services,'settingsSnapshot',{configurable:true,get:()=>settingsSnapshot});
Object.defineProperty(services,'saveServerSettings',{configurable:true,get:()=>saveServerSettings});
Object.defineProperty(services,'saveServerChat',{configurable:true,get:()=>saveServerChat});
Object.defineProperty(services,'saveSession',{configurable:true,get:()=>saveSession});
Object.defineProperty(services,'saveCharacterStore',{configurable:true,get:()=>saveCharacterStore});
Object.defineProperty(services,'hydrateServerState',{configurable:true,get:()=>hydrateServerState});
Object.defineProperty(services,'openStateDb',{configurable:true,get:()=>openStateDb});
Object.defineProperty(services,'loadStateHistory',{configurable:true,get:()=>loadStateHistory});
Object.defineProperty(services,'saveStateHistory',{configurable:true,get:()=>saveStateHistory});
Object.defineProperty(services,'clearStateHistory',{configurable:true,get:()=>clearStateHistory});
const {storagePost} = createStorageHttp(selectCapabilities(services,["STORAGE_API_URL","fetch","getRequestHeaders","pluginError","serverStoreAvailable"]));
const {loadReasonerProfiles} = createProfileLoader(selectCapabilities(services,["connectionRequestService","listConnectionProfiles","reasonerProfileError","reasonerProfiles","renderReasonerProfiles"]));
const {settingsSnapshot,saveServerSettings} = createSettingsRepository(selectCapabilities(services,["loadCustomWorlds","ownerPrompt","ownerUnlocked","queueWrite","serverStoreAvailable","settings","storagePost"]));
const {saveServerChat,saveSession,saveCharacterStore} = createSessionRepository(selectCapabilities(services,["STATE_HISTORY_LIMIT","characterStore","chatRecords","clearInjection","queueWrite","record","serverStoreAvailable","stateChatKey","stateHistoryCache","storagePost","storageVersion"]));
const {hydrateServerState} = createHydration(selectCapabilities(services,["DEFAULTS","JEV_KEY_STORAGE","MODULE","OWNER_PROMPT_STORAGE","OWNER_UNLOCK_STORAGE","STATE_HISTORY_LIMIT","backupList","characterStore","chatRecords","chat_metadata","clearInjection","extension_settings","getContext","getSavedKey","hydrateSequence","jobs","legacyStateChatKey","loadReasonerProfiles","loadStateHistory","localStorage","messageSnapshot","messageSnapshots","normalizeCharacterStore","privateOwnerPrompt","record","saveCustomWorlds","saveServerChat","saveServerSettings","saveStateHistory","serverKeyStatus","settings","stateChatKey","stateHistoryCache","storagePost","storageVersion"]));
const {openStateDb,loadStateHistory,saveStateHistory,clearStateHistory} = createHistoryRepository(selectCapabilities(services,["STATE_DB_NAME","STATE_DB_STORE","STATE_HISTORY_LIMIT","queueWrite","serverStoreAvailable","stateChatKey","stateDbPromise","stateHistoryCache","storagePost","window"]));


























return {storagePost, loadReasonerProfiles, settingsSnapshot, saveServerSettings, saveServerChat, saveSession, saveCharacterStore, hydrateServerState, openStateDb, loadStateHistory, saveStateHistory, clearStateHistory};
}
