// Supported Google embedding connections use a fixed model and Vertex region.
// Keep the persisted field names for existing installations and backups.
export const GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001';
export const VERTEX_EMBEDDING_REGION = 'global';
export const fixedEmbeddingModel = provider => ['palm','vertexai'].includes(provider) ? GOOGLE_EMBEDDING_MODEL : '';
export function normalizeRetrievalPatch(settings, patch) {
    const provider = patch.retrievalProvider ?? settings.retrievalProvider;
    const model = fixedEmbeddingModel(provider);
    return {...patch,...(model ? {retrievalModel:model} : {}),...(provider==='vertexai' ? {retrievalVertexRegion:VERTEX_EMBEDDING_REGION} : {})};
}
