import {validNoul} from './answer-value.js';

export function optionalProbability(value) {
    return validNoul(value) ? Number(value) : null;
}

// Request type is authoritative; validation and consumption share this contract.
export function normalizeJevAnswer(answer, question = {}) {
    const object = answer && typeof answer === 'object' && !Array.isArray(answer);
    if (!object) return {responseState: answer == null ? 'missing' : 'invalid', confidence: null};
    const normalized = {...answer, confidence: optionalProbability(answer.confidence)};
    if (answer.probabilities && typeof answer.probabilities === 'object' && !Array.isArray(answer.probabilities)) {
        normalized.probabilities = Object.fromEntries(Object.entries(answer.probabilities)
            .filter(([, value]) => optionalProbability(value) !== null).map(([key, value]) => [key, Number(value)]));
    }
    if (question.type === 'noul' && validNoul(answer.noul)) {
        return {...normalized, type:'noul', noul:Number(answer.noul), responseState:'valid'};
    }
    const selected = typeof answer.choice === 'string' ? answer.choice.trim() : '';
    const valid = Object.hasOwn(question.criteria || {}, selected);
    return {...normalized, type:'choice', choice:valid ? selected : '', responseState:valid ? 'valid' : 'invalid'};
}

export function normalizeJevAnswers(answers, questions = {}) {
    return Object.fromEntries(Object.entries(questions).map(([key, question]) => [key, normalizeJevAnswer(answers?.[key], question)]));
}
