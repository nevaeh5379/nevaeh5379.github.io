/**
 * History Manager
 * Handles translation history storage and retrieval
 */

class HistoryManager {
    constructor() {
        this.STORAGE_KEY = 'llm_translator_history';
        this.MAX_ITEMS = 100;
        this.history = this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load history:', e);
        }
        return [];
    }

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history));
            return true;
        } catch (e) {
            console.error('Failed to save history:', e);
            return false;
        }
    }

    add(entry) {
        const item = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            timestamp: new Date().toISOString(),
            sourceLang: entry.sourceLang,
            targetLang: entry.targetLang,
            sourceText: entry.sourceText,
            targetText: entry.targetText,
            provider: entry.provider,
            model: entry.model
        };

        // Add to beginning of array
        this.history.unshift(item);

        // Limit history size
        if (this.history.length > this.MAX_ITEMS) {
            this.history = this.history.slice(0, this.MAX_ITEMS);
        }

        this.save();
        return item;
    }

    remove(id) {
        const index = this.history.findIndex(item => item.id === id);
        if (index !== -1) {
            this.history.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }

    clear() {
        this.history = [];
        this.save();
    }

    search(query) {
        if (!query || query.trim() === '') {
            return this.history;
        }

        const lowerQuery = query.toLowerCase();
        return this.history.filter(item => 
            item.sourceText.toLowerCase().includes(lowerQuery) ||
            item.targetText.toLowerCase().includes(lowerQuery)
        );
    }

    get(id) {
        return this.history.find(item => item.id === id);
    }

    getAll() {
        return [...this.history];
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const date = new Date(timestamp);
        const diff = now - date;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return date.toLocaleDateString('ko-KR');
        } else if (days > 0) {
            return `${days}일 전`;
        } else if (hours > 0) {
            return `${hours}시간 전`;
        } else if (minutes > 0) {
            return `${minutes}분 전`;
        } else {
            return '방금 전';
        }
    }

    getLanguageLabel(code) {
        const languages = {
            'auto': '자동 감지',
            'ko': '한국어',
            'en': 'English',
            'ja': '日本語',
            'zh': '中文',
            'es': 'Español',
            'fr': 'Français',
            'de': 'Deutsch',
            'ru': 'Русский',
            'pt': 'Português',
            'it': 'Italiano',
            'vi': 'Tiếng Việt',
            'th': 'ไทย',
            'id': 'Bahasa Indonesia',
            'ar': 'العربية'
        };
        return languages[code] || code;
    }
}

// Export for use in other modules
window.HistoryManager = HistoryManager;
