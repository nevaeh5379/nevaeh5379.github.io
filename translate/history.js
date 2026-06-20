// history.js — localStorage 기반 번역 기록 관리

const STORAGE_KEY = 'llm_translator_history';
const MAX_ITEMS = 100;

export const LANGUAGE_LABELS = {
  auto: '자동 감지',
  ko: '한국어', en: 'English', ja: '日本語', zh: '中文',
  es: 'Español', fr: 'Français', de: 'Deutsch', ru: 'Русский',
  pt: 'Português', it: 'Italiano', vi: 'Tiếng Việt',
  th: 'ไทย', id: 'Bahasa Indonesia', ar: 'العربية',
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export class HistoryManager {
  constructor() {
    this.items = [];
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      this.items = JSON.parse(raw) || [];
    } catch (e) { this.items = []; }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch (e) { /* quota */ }
  }

  add(entry) {
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.items.unshift(item);
    if (this.items.length > MAX_ITEMS) this.items.length = MAX_ITEMS;
    this.save();
    return item;
  }

  remove(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  clear() {
    this.items = [];
    this.save();
  }

  get(id) {
    return this.items.find(i => i.id === id) || null;
  }

  search(query) {
    if (!query) return this.items;
    const q = query.toLowerCase();
    return this.items.filter(i =>
      (i.sourceText || '').toLowerCase().includes(q) ||
      (i.targetText || '').toLowerCase().includes(q)
    );
  }

  getLabel(code) {
    return LANGUAGE_LABELS[code] || code;
  }

  formatTimeAgo(iso) {
    const ts = new Date(iso).getTime();
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return '방금 전';
    if (min < 60) return `${min}분 전`;
    if (hr < 24) return `${hr}시간 전`;
    if (day < 7) return `${day}일 전`;
    return new Date(ts).toLocaleDateString('ko-KR');
  }
}