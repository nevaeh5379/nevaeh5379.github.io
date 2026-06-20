// settings.js — localStorage 기반 설정 관리 + 커스텀 엔드포인트 CRUD + 내보내기/가져오기

import { DEFAULT_ENDPOINTS } from './providers.js';

const STORAGE_KEY = 'llm_translator_settings';

const DEFAULT_PROMPTS = {
  system: 'You are a professional translator. Translate the given text accurately while preserving the original meaning and tone.',
  user: 'Translate the following text from {source_lang} to {target_lang}. Only output the translation, nothing else.\n\nText to translate:\n{text}',
};

const DEFAULTS = {
  endpointId: 'openai-default',
  model: '',
  sourceLang: 'auto',
  targetLang: 'en',
  stream: true,
  enableAdvanced: false,
  endpoints: [...DEFAULT_ENDPOINTS],
  advanced: {
    temperature: 0.3,
    top_p: 0.95,
    top_k: 40,
    repeat_penalty: 1.0,
    presence_penalty: 0,
    frequency_penalty: 0,
  },
  prompts: { ...DEFAULT_PROMPTS },
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function mergeDeep(target, src) {
  for (const k of Object.keys(src || {})) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = target[k] || {};
      mergeDeep(target[k], src[k]);
    } else if (src[k] !== undefined) {
      target[k] = src[k];
    }
  }
  return target;
}

export class SettingsManager {
  constructor() {
    this.data = clone(DEFAULTS);
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.data = mergeDeep(clone(DEFAULTS), parsed);
      // 빌트인 엔드포인트가 변경됐을 수 있으니 동기화 (id 일치하는 것은 유지하되 빌트인 메타 갱신)
      const builtinIds = new Set(DEFAULT_ENDPOINTS.map(e => e.id));
      const custom = (this.data.endpoints || []).filter(e => !builtinIds.has(e.id));
      this.data.endpoints = [...DEFAULT_ENDPOINTS, ...custom];
    } catch (e) { /* ignore corrupt */ }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) { /* quota */ }
  }

  get(key) {
    return key.split('.').reduce((o, k) => (o ? o[k] : undefined), this.data);
  }

  set(key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    const obj = parts.reduce((o, k) => (o[k] = o[k] || {}), this.data);
    obj[last] = value;
    this.save();
  }

  getEndpoint(id) {
    return this.data.endpoints.find(e => e.id === id) || null;
  }

  getSelectedEndpoint() {
    return this.getEndpoint(this.data.endpointId) || this.data.endpoints[0] || null;
  }

  setSelectedEndpoint(id) {
    this.data.endpointId = id;
    this.save();
  }

  addEndpoint({ name, baseUrl, apiKey, model }) {
    const id = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ep = { id, name: name || 'Custom', baseUrl: baseUrl || '', apiKey: apiKey || '', model: model || '', builtin: false };
    this.data.endpoints.push(ep);
    this.save();
    return ep;
  }

  updateEndpoint(id, patch) {
    const ep = this.getEndpoint(id);
    if (!ep || ep.builtin) return false;
    Object.assign(ep, patch);
    this.save();
    return true;
  }

  deleteEndpoint(id) {
    const idx = this.data.endpoints.findIndex(e => e.id === id);
    if (idx < 0 || this.data.endpoints[idx].builtin) return false;
    this.data.endpoints.splice(idx, 1);
    if (this.data.endpointId === id) this.data.endpointId = this.data.endpoints[0]?.id || '';
    this.save();
    return true;
  }

  getProviderConfig() {
    const ep = this.getSelectedEndpoint();
    if (!ep) return null;
    return {
      baseUrl: ep.baseUrl,
      apiKey: ep.apiKey,
      model: this.data.model || ep.model,
      advanced: this.data.enableAdvanced ? clone(this.data.advanced) : null,
    };
  }

  resetPrompts() {
    this.data.prompts = clone(DEFAULT_PROMPTS);
    this.save();
  }

  exportJSON() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm_translator_settings_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importJSON(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    this.data = mergeDeep(clone(DEFAULTS), parsed);
    // 빌트인 동기화
    const builtinIds = new Set(DEFAULT_ENDPOINTS.map(e => e.id));
    const custom = (this.data.endpoints || []).filter(e => !builtinIds.has(e.id));
    this.data.endpoints = [...DEFAULT_ENDPOINTS, ...custom];
    this.save();
  }
}