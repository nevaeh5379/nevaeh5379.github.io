/**
 * LLM Translator - Main Application
 * Handles UI interactions and coordinates between modules
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize managers
    const settings = new SettingsManager();
    const history = new HistoryManager();

    // DOM Elements
    const elements = {
        // Header
        historyBtn: document.getElementById('historyBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        themeBtn: document.getElementById('themeBtn'),
        sunIcon: document.querySelector('.sun-icon'),
        moonIcon: document.querySelector('.moon-icon'),

        // Provider
        providerSelect: document.getElementById('providerSelect'),
        modelSelect: document.getElementById('modelSelect'),
        refreshModelsBtn: document.getElementById('refreshModelsBtn'),

        // Language
        sourceLang: document.getElementById('sourceLang'),
        targetLang: document.getElementById('targetLang'),
        swapLangBtn: document.getElementById('swapLangBtn'),

        // Translation
        sourceText: document.getElementById('sourceText'),
        targetText: document.getElementById('targetText'),
        charCount: document.getElementById('charCount'),
        detectedLang: document.getElementById('detectedLang'),
        translationStatus: document.getElementById('translationStatus'),
        clearBtn: document.getElementById('clearBtn'),
        pasteBtn: document.getElementById('pasteBtn'),
        copyBtn: document.getElementById('copyBtn'),
        saveHistoryBtn: document.getElementById('saveHistoryBtn'),
        translateBtn: document.getElementById('translateBtn'),

        // Settings Modal
        settingsModal: document.getElementById('settingsModal'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        saveSettingsBtn: document.getElementById('saveSettingsBtn'),
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),

        // API Settings
        openaiKey: document.getElementById('openaiKey'),
        openaiBaseUrl: document.getElementById('openaiBaseUrl'),
        claudeKey: document.getElementById('claudeKey'),
        geminiKey: document.getElementById('geminiKey'),
        ollamaUrl: document.getElementById('ollamaUrl'),
        llamacppUrl: document.getElementById('llamacppUrl'),
        
        // Custom Endpoints
        addEndpointBtn: document.getElementById('addEndpointBtn'),
        customEndpointsList: document.getElementById('customEndpointsList'),

        // Prompt Settings
        systemPrompt: document.getElementById('systemPrompt'),
        userPrompt: document.getElementById('userPrompt'),
        resetPromptBtn: document.getElementById('resetPromptBtn'),

        // Export Settings
        exportSettingsBtn: document.getElementById('exportSettingsBtn'),
        importSettingsInput: document.getElementById('importSettingsInput'),

        // History Sidebar
        historyOverlay: document.getElementById('historyOverlay'),
        historySidebar: document.getElementById('historySidebar'),
        closeHistoryBtn: document.getElementById('closeHistoryBtn'),
        historySearch: document.getElementById('historySearch'),
        historyList: document.getElementById('historyList'),
        clearHistoryBtn: document.getElementById('clearHistoryBtn'),

        // Reasoning Panel
        reasoningPanel: document.getElementById('reasoningPanel'),
        reasoningToggle: document.getElementById('reasoningToggle'),
        reasoningBadge: document.getElementById('reasoningBadge'),
        reasoningContent: document.getElementById('reasoningContent'),
        reasoningText: document.getElementById('reasoningText'),

        // Toast
        toast: document.getElementById('toast')
    };

    // State
    let isTranslating = false;
    let lastTranslation = null;
    let isFetchingModels = false;

    // ===========================================
    // Initialization
    // ===========================================

    async function init() {
        applyTheme(settings.get('theme'));
        loadSettingsToUI();
        updateProviderSelect(); // Populate custom endpoints in provider dropdown
        elements.providerSelect.value = settings.get('provider');
        elements.sourceLang.value = settings.get('sourceLang');
        elements.targetLang.value = settings.get('targetLang');
        
        setupEventListeners();
        renderHistory();
        renderCustomEndpoints();
        
        // Fetch models async after UI is ready
        await updateProviderModels();
        elements.modelSelect.value = settings.get('model');
    }

    // ===========================================
    // Theme
    // ===========================================

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
            elements.sunIcon.style.display = 'none';
            elements.moonIcon.style.display = 'block';
        } else {
            elements.sunIcon.style.display = 'block';
            elements.moonIcon.style.display = 'none';
        }
    }

    function toggleTheme() {
        const current = settings.get('theme');
        const next = current === 'dark' ? 'light' : 'dark';
        settings.set('theme', next);
        settings.save();
        applyTheme(next);
    }

    // ===========================================
    // Provider & Model
    // ===========================================

    function updateProviderSelect() {
        // Get the base providers (before the comment)
        const baseProviders = [
            { value: 'openai', label: 'OpenAI' },
            { value: 'claude', label: 'Claude' },
            { value: 'gemini', label: 'Gemini' },
            { value: 'ollama', label: 'Ollama' },
            { value: 'llamacpp', label: 'llama.cpp' }
        ];
        
        // Get custom endpoints
        const customEndpoints = settings.getCustomEndpoints();
        
        // Rebuild provider select
        elements.providerSelect.innerHTML = '';
        
        // Add base providers
        baseProviders.forEach(p => {
            const option = document.createElement('option');
            option.value = p.value;
            option.textContent = p.label;
            elements.providerSelect.appendChild(option);
        });
        
        // Add separator and custom endpoints if any
        if (customEndpoints.length > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '── 커스텀 엔드포인트 ──';
            elements.providerSelect.appendChild(separator);
            
            customEndpoints.forEach(ep => {
                const option = document.createElement('option');
                option.value = `custom-${ep.id}`;
                option.textContent = ep.name || 'Custom API';
                elements.providerSelect.appendChild(option);
            });
        }
    }

    async function updateProviderModels(forceRefresh = false) {
        const provider = elements.providerSelect.value;
        const config = settings.getProviderConfig(provider);
        
        // Determine the actual provider type (custom endpoints use openai-compatible)
        const providerType = provider.startsWith('custom-') ? 'openai-compatible' : provider;
        
        // Show loading state
        if (forceRefresh || isFetchingModels) {
            elements.modelSelect.innerHTML = '<option value="">모델 불러오는 중...</option>';
            elements.modelSelect.disabled = true;
        }
        
        isFetchingModels = true;
        
        try {
            // Fetch models from API
            const models = await ProviderFactory.fetchModels(providerType, config);
            
            elements.modelSelect.innerHTML = '';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                elements.modelSelect.appendChild(option);
            });

            // Try to restore previous model or use first one
            const savedModel = settings.get('model');
            if (models.some(m => m.value === savedModel)) {
                elements.modelSelect.value = savedModel;
            }
            
            if (forceRefresh) {
                showToast(`${models.length}개의 모델을 불러왔습니다.`);
            }
        } catch (e) {
            console.error('Failed to fetch models:', e);
            // Fallback to default models
            const defaultModels = ProviderFactory.getDefaultModels(providerType);
            elements.modelSelect.innerHTML = '';
            defaultModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.value;
                option.textContent = model.label;
                elements.modelSelect.appendChild(option);
            });
        } finally {
            elements.modelSelect.disabled = false;
            isFetchingModels = false;
        }
    }
    
    async function refreshModels() {
        await updateProviderModels(true);
    }

    // ===========================================
    // Translation
    // ===========================================

    async function translate() {
        const text = elements.sourceText.value.trim();
        if (!text) {
            showToast('번역할 텍스트를 입력하세요.');
            return;
        }

        if (isTranslating) return;

        const provider = elements.providerSelect.value;
        const model = elements.modelSelect.value;
        const sourceLang = elements.sourceLang.value;
        const targetLang = elements.targetLang.value;

        // Determine actual provider type (custom endpoints use openai-compatible)
        const providerType = provider.startsWith('custom-') ? 'openai-compatible' : provider;

        // Get provider config
        const config = settings.getProviderConfig(provider);
        config.model = model;

        // Get prompts
        const systemPrompt = settings.get('prompts.system');
        const userPrompt = settings.get('prompts.user');

        // Update UI
        setTranslating(true);
        elements.translationStatus.textContent = '스트리밍 중...';
        elements.targetText.textContent = '';
        
        // Reset and show reasoning panel for providers that support thinking
        // Claude: extended thinking, llama.cpp: may have <think> tags from reasoning models
        const supportsThinking = providerType === 'claude' || providerType === 'llamacpp';
        resetReasoningPanel(supportsThinking);

        try {
            const providerInstance = ProviderFactory.create(providerType, config);
            
            // Use streaming translation
            await providerInstance.translateStream(
                text,
                sourceLang,
                targetLang,
                systemPrompt,
                userPrompt,
                {
                    onContent: (content) => {
                        elements.targetText.textContent = content;
                        elements.translationStatus.textContent = '스트리밍 중...';
                    },
                    onReasoning: (reasoning) => {
                        updateReasoningPanel(reasoning);
                    },
                    onDone: (finalContent, reasoning) => {
                        elements.targetText.textContent = finalContent;
                        elements.translationStatus.textContent = '';
                        finalizeReasoningPanel(reasoning);
                        
                        // Save for potential history save
                        lastTranslation = {
                            sourceLang,
                            targetLang,
                            sourceText: text,
                            targetText: finalContent,
                            provider,
                            model
                        };
                    },
                    onError: (error) => {
                        console.error('Translation error:', error);
                        elements.translationStatus.textContent = '';
                        showToast(error.message);
                    }
                }
            );

        } catch (error) {
            console.error('Translation error:', error);
            elements.translationStatus.textContent = '';
            showToast(error.message);
        } finally {
            setTranslating(false);
        }
    }

    function setTranslating(value) {
        isTranslating = value;
        elements.translateBtn.disabled = value;
        
        const btnText = elements.translateBtn.querySelector('.btn-text');
        const btnLoader = elements.translateBtn.querySelector('.btn-loader');
        
        if (value) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'block';
        } else {
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    }

    // ===========================================
    // Reasoning Panel
    // ===========================================

    function resetReasoningPanel(show = false) {
        if (show) {
            elements.reasoningPanel.style.display = 'block';
            elements.reasoningPanel.classList.remove('collapsed');
            elements.reasoningBadge.textContent = 'thinking...';
            elements.reasoningBadge.classList.remove('done');
            elements.reasoningText.textContent = '';
            elements.reasoningText.classList.add('streaming');
        } else {
            elements.reasoningPanel.style.display = 'none';
        }
    }

    function updateReasoningPanel(reasoning) {
        elements.reasoningText.textContent = reasoning;
        // Auto-scroll to bottom
        elements.reasoningContent.scrollTop = elements.reasoningContent.scrollHeight;
    }

    function finalizeReasoningPanel(reasoning) {
        if (reasoning) {
            elements.reasoningText.classList.remove('streaming');
            elements.reasoningBadge.textContent = 'complete';
            elements.reasoningBadge.classList.add('done');
        }
    }

    function toggleReasoningPanel() {
        elements.reasoningPanel.classList.toggle('collapsed');
    }

    // ===========================================
    // Settings Modal
    // ===========================================

    function openSettings() {
        loadSettingsToUI();
        elements.settingsModal.classList.add('active');
    }

    function closeSettings() {
        elements.settingsModal.classList.remove('active');
    }

    function loadSettingsToUI() {
        elements.openaiKey.value = settings.get('openai.apiKey') || '';
        elements.openaiBaseUrl.value = settings.get('openai.baseUrl') || '';
        elements.claudeKey.value = settings.get('claude.apiKey') || '';
        elements.geminiKey.value = settings.get('gemini.apiKey') || '';
        elements.ollamaUrl.value = settings.get('ollama.baseUrl') || 'http://localhost:11434';
        elements.llamacppUrl.value = settings.get('llamacpp.baseUrl') || 'http://localhost:8080';
        elements.systemPrompt.value = settings.get('prompts.system') || '';
        elements.userPrompt.value = settings.get('prompts.user') || '';
        
        // Render custom endpoints
        renderCustomEndpoints();
    }

    function saveSettings() {
        settings.set('openai.apiKey', elements.openaiKey.value);
        settings.set('openai.baseUrl', elements.openaiBaseUrl.value);
        settings.set('claude.apiKey', elements.claudeKey.value);
        settings.set('gemini.apiKey', elements.geminiKey.value);
        settings.set('ollama.baseUrl', elements.ollamaUrl.value);
        settings.set('llamacpp.baseUrl', elements.llamacppUrl.value);
        settings.set('prompts.system', elements.systemPrompt.value);
        settings.set('prompts.user', elements.userPrompt.value);
        
        // Save custom endpoints from UI
        saveCustomEndpointsFromUI();
        
        settings.save();
        
        // Update provider dropdown with new endpoints
        updateProviderSelect();
        
        showToast('설정이 저장되었습니다.');
        closeSettings();
    }

    function switchTab(tabName) {
        elements.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    // ===========================================
    // Custom Endpoints
    // ===========================================

    function renderCustomEndpoints() {
        const endpoints = settings.getCustomEndpoints();
        
        if (endpoints.length === 0) {
            elements.customEndpointsList.innerHTML = `
                <div class="endpoint-empty">
                    커스텀 엔드포인트가 없습니다.<br>
                    <small>+ 버튼을 눌러 추가하세요.</small>
                </div>
            `;
            return;
        }

        elements.customEndpointsList.innerHTML = endpoints.map(ep => `
            <div class="endpoint-card" data-id="${ep.id}">
                <div class="endpoint-card-header">
                    <span class="endpoint-card-name">${escapeHtml(ep.name || 'Custom API')}</span>
                    <div class="endpoint-card-actions">
                        <button class="delete-btn" data-id="${ep.id}" title="삭제">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="input-group">
                    <label>이름</label>
                    <input type="text" class="text-input ep-name" value="${escapeHtml(ep.name || '')}" placeholder="예: My Local LLM">
                </div>
                <div class="input-group">
                    <label>Base URL</label>
                    <input type="text" class="text-input ep-url" value="${escapeHtml(ep.baseUrl || '')}" placeholder="https://api.example.com/v1">
                </div>
                <div class="input-group">
                    <label>API Key (선택)</label>
                    <input type="password" class="text-input ep-key" value="${escapeHtml(ep.apiKey || '')}" placeholder="API Key">
                </div>
                <div class="input-group">
                    <label>기본 모델 (선택)</label>
                    <input type="text" class="text-input ep-model" value="${escapeHtml(ep.model || '')}" placeholder="model-name">
                </div>
            </div>
        `).join('');

        // Add delete handlers
        elements.customEndpointsList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCustomEndpoint(btn.dataset.id);
            });
        });
    }

    function addCustomEndpoint() {
        const newEndpoint = settings.addCustomEndpoint({
            name: 'New Endpoint',
            baseUrl: '',
            apiKey: '',
            model: ''
        });
        
        renderCustomEndpoints();
        showToast('새 엔드포인트가 추가되었습니다.');
        
        // Scroll to the new endpoint
        const newCard = elements.customEndpointsList.querySelector(`[data-id="${newEndpoint.id}"]`);
        if (newCard) {
            newCard.scrollIntoView({ behavior: 'smooth' });
            newCard.querySelector('.ep-name').focus();
        }
    }

    function deleteCustomEndpoint(id) {
        if (confirm('이 엔드포인트를 삭제하시겠습니까?')) {
            settings.deleteCustomEndpoint(id);
            renderCustomEndpoints();
            updateProviderSelect();
            showToast('엔드포인트가 삭제되었습니다.');
        }
    }

    function saveCustomEndpointsFromUI() {
        const cards = elements.customEndpointsList.querySelectorAll('.endpoint-card');
        
        cards.forEach(card => {
            const id = card.dataset.id;
            const name = card.querySelector('.ep-name').value;
            const baseUrl = card.querySelector('.ep-url').value;
            const apiKey = card.querySelector('.ep-key').value;
            const model = card.querySelector('.ep-model').value;
            
            settings.updateCustomEndpoint(id, { name, baseUrl, apiKey, model });
        });
    }

    // ===========================================
    // History Sidebar
    // ===========================================

    function openHistory() {
        renderHistory();
        elements.historyOverlay.classList.add('active');
        elements.historySidebar.classList.add('active');
    }

    function closeHistory() {
        elements.historyOverlay.classList.remove('active');
        elements.historySidebar.classList.remove('active');
    }

    function renderHistory(searchQuery = '') {
        const items = history.search(searchQuery);
        
        if (items.length === 0) {
            elements.historyList.innerHTML = `
                <div class="history-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12,6 12,12 16,14"/>
                    </svg>
                    <p>${searchQuery ? '검색 결과가 없습니다.' : '번역 기록이 없습니다.'}</p>
                </div>
            `;
            return;
        }

        elements.historyList.innerHTML = items.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-meta">
                    <span class="history-langs">${history.getLanguageLabel(item.sourceLang)} → ${history.getLanguageLabel(item.targetLang)}</span>
                    <span class="history-time">${history.formatTimeAgo(item.timestamp)}</span>
                </div>
                <div class="history-source">${escapeHtml(item.sourceText)}</div>
                <div class="history-target">${escapeHtml(item.targetText)}</div>
                <div class="history-actions">
                    <button class="history-delete-btn" data-id="${item.id}" title="삭제">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Add click handlers
        elements.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.history-delete-btn')) return;
                loadFromHistory(item.dataset.id);
            });
        });

        elements.historyList.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteHistoryItem(btn.dataset.id);
            });
        });
    }

    function loadFromHistory(id) {
        const item = history.get(id);
        if (item) {
            elements.sourceText.value = item.sourceText;
            elements.targetText.textContent = item.targetText;
            elements.sourceLang.value = item.sourceLang;
            elements.targetLang.value = item.targetLang;
            updateCharCount();
            closeHistory();
            showToast('기록에서 불러왔습니다.');
        }
    }

    function deleteHistoryItem(id) {
        if (history.remove(id)) {
            renderHistory(elements.historySearch.value);
            showToast('기록이 삭제되었습니다.');
        }
    }

    function saveToHistory() {
        if (lastTranslation) {
            history.add(lastTranslation);
            showToast('번역이 기록에 저장되었습니다.');
        } else {
            showToast('저장할 번역이 없습니다.');
        }
    }

    // ===========================================
    // Utility Functions
    // ===========================================

    function updateCharCount() {
        const count = elements.sourceText.value.length;
        elements.charCount.textContent = count;
    }

    function swapLanguages() {
        const source = elements.sourceLang.value;
        const target = elements.targetLang.value;
        
        // Can't swap if source is auto
        if (source === 'auto') {
            showToast('자동 감지 모드에서는 언어를 교환할 수 없습니다.');
            return;
        }

        elements.sourceLang.value = target;
        elements.targetLang.value = source;

        // Also swap text content
        const sourceTextValue = elements.sourceText.value;
        const targetTextValue = elements.targetText.textContent;
        
        if (targetTextValue && targetTextValue !== '번역 결과가 여기에 표시됩니다...') {
            elements.sourceText.value = targetTextValue;
            elements.targetText.textContent = sourceTextValue;
            updateCharCount();
        }

        settings.set('sourceLang', target);
        settings.set('targetLang', source);
        settings.save();
    }

    function clearSource() {
        elements.sourceText.value = '';
        elements.targetText.textContent = '';
        elements.detectedLang.textContent = '';
        updateCharCount();
        lastTranslation = null;
    }

    async function pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            elements.sourceText.value = text;
            updateCharCount();
            showToast('클립보드에서 붙여넣었습니다.');
        } catch (err) {
            showToast('클립보드 접근 권한이 없습니다.');
        }
    }

    async function copyToClipboard() {
        const text = elements.targetText.textContent;
        if (!text || text === '번역 결과가 여기에 표시됩니다...') {
            showToast('복사할 내용이 없습니다.');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast('복사되었습니다.');
        } catch (err) {
            showToast('복사에 실패했습니다.');
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message) {
        const toastMessage = elements.toast.querySelector('.toast-message');
        toastMessage.textContent = message;
        elements.toast.classList.add('show');
        
        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }

    // ===========================================
    // Event Listeners
    // ===========================================

    function setupEventListeners() {
        // Theme
        elements.themeBtn.addEventListener('click', toggleTheme);

        // Provider & Model
        elements.providerSelect.addEventListener('change', async () => {
            settings.set('provider', elements.providerSelect.value);
            settings.save();
            await updateProviderModels();
        });

        elements.modelSelect.addEventListener('change', () => {
            settings.set('model', elements.modelSelect.value);
            settings.save();
        });
        
        // Refresh models button
        elements.refreshModelsBtn.addEventListener('click', async () => {
            elements.refreshModelsBtn.classList.add('loading');
            await refreshModels();
            elements.refreshModelsBtn.classList.remove('loading');
        });

        // Language
        elements.sourceLang.addEventListener('change', () => {
            settings.set('sourceLang', elements.sourceLang.value);
            settings.save();
        });

        elements.targetLang.addEventListener('change', () => {
            settings.set('targetLang', elements.targetLang.value);
            settings.save();
        });

        elements.swapLangBtn.addEventListener('click', swapLanguages);

        // Translation
        elements.sourceText.addEventListener('input', updateCharCount);
        elements.clearBtn.addEventListener('click', clearSource);
        elements.pasteBtn.addEventListener('click', pasteFromClipboard);
        elements.copyBtn.addEventListener('click', copyToClipboard);
        elements.saveHistoryBtn.addEventListener('click', saveToHistory);
        elements.translateBtn.addEventListener('click', translate);

        // Ctrl+Enter to translate
        elements.sourceText.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                translate();
            }
        });

        // Reasoning Panel
        elements.reasoningToggle.addEventListener('click', toggleReasoningPanel);

        // Settings Modal
        elements.settingsBtn.addEventListener('click', openSettings);
        elements.closeSettingsBtn.addEventListener('click', closeSettings);
        elements.saveSettingsBtn.addEventListener('click', saveSettings);

        elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === elements.settingsModal) {
                closeSettings();
            }
        });

        elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        elements.resetPromptBtn.addEventListener('click', () => {
            settings.resetPrompts();
            loadSettingsToUI();
            showToast('프롬프트가 기본값으로 복원되었습니다.');
        });
        
        // Custom Endpoints
        elements.addEndpointBtn.addEventListener('click', addCustomEndpoint);

        elements.exportSettingsBtn.addEventListener('click', () => {
            settings.export();
            showToast('설정이 내보내졌습니다.');
        });

        elements.importSettingsInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    await settings.import(file);
                    loadSettingsToUI();
                    applyTheme(settings.get('theme'));
                    elements.providerSelect.value = settings.get('provider');
                    updateProviderModels();
                    elements.modelSelect.value = settings.get('model');
                    showToast('설정을 불러왔습니다.');
                } catch (err) {
                    showToast(err.message);
                }
                e.target.value = '';
            }
        });

        // History Sidebar
        elements.historyBtn.addEventListener('click', openHistory);
        elements.closeHistoryBtn.addEventListener('click', closeHistory);
        elements.historyOverlay.addEventListener('click', closeHistory);

        elements.historySearch.addEventListener('input', (e) => {
            renderHistory(e.target.value);
        });

        elements.clearHistoryBtn.addEventListener('click', () => {
            if (confirm('모든 번역 기록을 삭제하시겠습니까?')) {
                history.clear();
                renderHistory();
                showToast('모든 기록이 삭제되었습니다.');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeSettings();
                closeHistory();
            }
        });
    }

    // Initialize the application
    init();
});
