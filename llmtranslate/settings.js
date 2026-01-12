/**
 * Settings Manager
 * Handles saving, loading, exporting and importing settings
 */

class SettingsManager {
    constructor() {
        this.STORAGE_KEY = 'llm_translator_settings';
        this.defaults = {
            theme: 'light',
            provider: 'openai',
            model: 'gpt-4o-mini',
            sourceLang: 'auto',
            targetLang: 'en',
            openai: {
                apiKey: '',
                baseUrl: ''
            },
            claude: {
                apiKey: ''
            },
            gemini: {
                apiKey: ''
            },
            ollama: {
                baseUrl: 'http://localhost:11434'
            },
            llamacpp: {
                baseUrl: 'http://localhost:8080'
            },
            // Custom endpoints - array of custom OpenAI-compatible endpoints
            customEndpoints: [],
            // Currently selected custom endpoint ID
            selectedCustomEndpoint: null,
            prompts: {
                system: 'You are a professional translator. Translate the given text accurately while preserving the original meaning and tone.',
                user: `Translate the following text from {source_lang} to {target_lang}. Only output the translation, nothing else.

Text to translate:
{text}`
            }
        };
        this.settings = this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with defaults to ensure all keys exist
                return this.mergeDeep(this.defaults, parsed);
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return { ...this.defaults };
    }

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
            return true;
        } catch (e) {
            console.error('Failed to save settings:', e);
            return false;
        }
    }

    get(key) {
        const keys = key.split('.');
        let value = this.settings;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return undefined;
            }
        }
        return value;
    }

    set(key, value) {
        const keys = key.split('.');
        let obj = this.settings;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in obj) || typeof obj[k] !== 'object') {
                obj[k] = {};
            }
            obj = obj[k];
        }
        obj[keys[keys.length - 1]] = value;
    }

    export() {
        const data = JSON.stringify(this.settings, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `llm_translator_settings_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async import(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);
                    this.settings = this.mergeDeep(this.defaults, imported);
                    this.save();
                    resolve(true);
                } catch (err) {
                    reject(new Error('유효하지 않은 설정 파일입니다.'));
                }
            };
            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            reader.readAsText(file);
        });
    }

    resetPrompts() {
        this.settings.prompts = { ...this.defaults.prompts };
        this.save();
    }

    // Custom Endpoint Management
    getCustomEndpoints() {
        return this.settings.customEndpoints || [];
    }

    addCustomEndpoint(endpoint) {
        const newEndpoint = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            name: endpoint.name || 'Custom API',
            baseUrl: endpoint.baseUrl || '',
            apiKey: endpoint.apiKey || '',
            model: endpoint.model || '',
            createdAt: new Date().toISOString()
        };
        
        if (!this.settings.customEndpoints) {
            this.settings.customEndpoints = [];
        }
        
        this.settings.customEndpoints.push(newEndpoint);
        this.save();
        return newEndpoint;
    }

    updateCustomEndpoint(id, updates) {
        const endpoints = this.getCustomEndpoints();
        const index = endpoints.findIndex(e => e.id === id);
        if (index !== -1) {
            this.settings.customEndpoints[index] = { 
                ...endpoints[index], 
                ...updates 
            };
            this.save();
            return true;
        }
        return false;
    }

    deleteCustomEndpoint(id) {
        const endpoints = this.getCustomEndpoints();
        const index = endpoints.findIndex(e => e.id === id);
        if (index !== -1) {
            this.settings.customEndpoints.splice(index, 1);
            // If deleted endpoint was selected, clear selection
            if (this.settings.selectedCustomEndpoint === id) {
                this.settings.selectedCustomEndpoint = null;
            }
            this.save();
            return true;
        }
        return false;
    }

    getCustomEndpoint(id) {
        const endpoints = this.getCustomEndpoints();
        return endpoints.find(e => e.id === id);
    }

    selectCustomEndpoint(id) {
        this.settings.selectedCustomEndpoint = id;
        this.save();
    }

    getSelectedCustomEndpoint() {
        const id = this.settings.selectedCustomEndpoint;
        if (id) {
            return this.getCustomEndpoint(id);
        }
        // Return first endpoint if available
        const endpoints = this.getCustomEndpoints();
        return endpoints.length > 0 ? endpoints[0] : null;
    }

    getProviderConfig(provider) {
        // Check if it's a custom endpoint (format: custom-{id})
        if (provider.startsWith('custom-')) {
            const endpointId = provider.replace('custom-', '');
            const endpoint = this.getCustomEndpoint(endpointId);
            if (endpoint) {
                return {
                    baseUrl: endpoint.baseUrl,
                    apiKey: endpoint.apiKey,
                    model: endpoint.model || this.get('model')
                };
            }
            return {};
        }

        switch (provider) {
            case 'openai':
                return {
                    apiKey: this.get('openai.apiKey'),
                    baseUrl: this.get('openai.baseUrl'),
                    model: this.get('model')
                };
            case 'claude':
                return {
                    apiKey: this.get('claude.apiKey'),
                    model: this.get('model')
                };
            case 'gemini':
                return {
                    apiKey: this.get('gemini.apiKey'),
                    model: this.get('model')
                };
            case 'ollama':
                return {
                    baseUrl: this.get('ollama.baseUrl'),
                    model: this.get('model')
                };
            case 'llamacpp':
                return {
                    baseUrl: this.get('llamacpp.baseUrl')
                };
            default:
                return {};
        }
    }

    mergeDeep(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeDeep(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;
