// app.js — LLM 번역기 진입점 (ES module)

import { OpenAICompatibleProvider, LANGUAGE_NAMES } from './providers.js';
import { SettingsManager } from './settings.js';
import { HistoryManager, LANGUAGE_LABELS } from './history.js';

const LANGS = ['auto', 'ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'ru', 'pt', 'it', 'vi', 'th', 'id', 'ar'];

const settings = new SettingsManager();
const history = new HistoryManager();

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const el = {
  endpointSelect: $('endpoint-select'),
  modelSelect: $('model-select'),
  refreshModels: $('refresh-models'),
  streamToggle: $('stream-toggle'),
  autoHeightToggle: $('auto-height-toggle'),
  markdownToggle: $('markdown-toggle'),
  sourceLang: $('source-lang'),
  targetLang: $('target-lang'),
  swapLang: $('swap-lang'),
  inputText: $('input-text'),
  charCount: $('char-count'),
  clearInput: $('clear-input'),
  pasteInput: $('paste-input'),
  translateBtn: $('translate-btn'),
  outputText: $('output-text'),
  statusTag: $('status-tag'),
  copyOutput: $('copy-output'),
  reasoningPanel: $('reasoning-panel'),
  reasoningToggle: $('reasoning-toggle'),
  reasoningText: $('reasoning-text'),
  toast: $('toast'),
  // modal
  settingsBtn: $('settings-btn'),
  settingsModal: $('settings-modal'),
  overlay: $('overlay'),
  endpointList: $('endpoint-list'),
  addEndpoint: $('add-endpoint'),
  advancedToggle: $('advanced-toggle'),
  advancedSection: $('advanced-section'),
  systemPrompt: $('system-prompt'),
  userPrompt: $('user-prompt'),
  resetPrompts: $('reset-prompts'),
  exportSettings: $('export-settings'),
  importSettings: $('import-settings'),
  importFile: $('import-file'),
  saveSettings: $('save-settings'),
  // sidebar
  historyBtn: $('history-btn'),
  historySidebar: $('history-sidebar'),
  historySearch: $('history-search'),
  historyList: $('history-list'),
  clearHistory: $('clear-history'),
};

// ===== State =====
let isTranslating = false;
let abortController = null;
let lastTranslation = null;
let fetchedModels = []; // 현재 선택된 엔드포인트의 모델 목록
let currentOutputText = ''; // 현재 번역된 원본 텍스트

// ===== Init =====
function init() {
  populateLangs();
  populateEndpoints();
  bindEvents();
  loadSettingsToUI();
  applySettingsToMain();
  refreshModels();
  renderHistory();
}

function populateLangs() {
  el.sourceLang.innerHTML = LANGS.filter(l => l !== 'auto' || true).map(l =>
    `<option value="${l}" data-label="${LANGUAGE_LABELS[l] || l}">${LANGUAGE_LABELS[l] || l}</option>`
  ).join('');
  el.targetLang.innerHTML = LANGS.filter(l => l !== 'auto').map(l =>
    `<option value="${l}">${LANGUAGE_LABELS[l] || l}</option>`
  ).join('');
}

function populateEndpoints() {
  const eps = settings.data.endpoints;
  el.endpointSelect.innerHTML = eps.map(e =>
    `<option value="${e.id}">${escapeHtml(e.name)}</option>`
  ).join('');
}

function bindEvents() {
  el.endpointSelect.addEventListener('change', () => {
    settings.setSelectedEndpoint(el.endpointSelect.value);
    // 새 엔드포인트의 기본 모델로 리셋
    const ep = settings.getSelectedEndpoint();
    settings.set('model', ep?.model || '');
    settings.save();
    refreshModels();
    applySettingsToMain();
  });
  el.refreshModels.addEventListener('click', refreshModels);
  el.streamToggle.addEventListener('change', () => { settings.set('stream', el.streamToggle.checked); });
  el.autoHeightToggle.addEventListener('change', () => {
    settings.set('autoHeight', el.autoHeightToggle.checked);
    adjustHeights();
  });
  el.markdownToggle.addEventListener('change', () => {
    settings.set('markdown', el.markdownToggle.checked);
    updateOutputDisplay();
  });
  el.sourceLang.addEventListener('change', () => { settings.set('sourceLang', el.sourceLang.value); });
  el.targetLang.addEventListener('change', () => { settings.set('targetLang', el.targetLang.value); });
  el.swapLang.addEventListener('click', swapLanguages);
  el.inputText.addEventListener('input', () => { updateCharCount(); adjustHeights(); });
  el.clearInput.addEventListener('click', () => { el.inputText.value = ''; updateCharCount(); adjustHeights(); el.inputText.focus(); });
  el.pasteInput.addEventListener('click', pasteFromClipboard);
  el.translateBtn.addEventListener('click', onTranslateClick);
  el.copyOutput.addEventListener('click', copyOutput);
  // 추론 패널은 <details>가 자체 토글. JS는 열림 상태만 유지.

  // Settings modal
  el.settingsBtn.addEventListener('click', openSettings);
  el.saveSettings.addEventListener('click', saveSettingsFromUI);
  el.addEndpoint.addEventListener('click', () => renderEndpointList(settings.addEndpoint({ name: '새 엔드포인트' })));
  el.advancedToggle.addEventListener('change', () => toggleAdvancedUI(el.advancedToggle.checked));
  el.resetPrompts.addEventListener('click', () => { settings.resetPrompts(); loadSettingsToUI(); });
  el.exportSettings.addEventListener('click', () => settings.exportJSON());
  el.importSettings.addEventListener('click', () => el.importFile.click());
  el.importFile.addEventListener('change', async (e) => {
    if (e.target.files[0]) { await settings.importJSON(e.target.files[0]); loadSettingsToUI(); applySettingsToMain(); populateEndpoints(); toast('설정을 가져왔습니다'); }
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.close === 'settings') closeSettings();
    if (b.dataset.close === 'history') closeHistory();
  }));

  // Sidebar
  el.historyBtn.addEventListener('click', openHistory);
  el.historySearch.addEventListener('input', () => renderHistory(el.historySearch.value));
  el.clearHistory.addEventListener('click', () => { if (confirm('모든 기록을 삭제할까요?')) { history.clear(); renderHistory(); } });

  // Overlay click to close
  el.overlay.addEventListener('click', () => { closeSettings(); closeHistory(); });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSettings(); closeHistory(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onTranslateClick(); }
  });
}

function updateCharCount() {
  el.charCount.textContent = el.inputText.value.length;
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    el.inputText.value = text;
    updateCharCount();
    adjustHeights();
  } catch (e) { toast('클립보드 접근 실패'); }
}

function swapLanguages() {
  const s = el.sourceLang.value, t = el.targetLang.value;
  if (s === 'auto') { toast('자동 감지는 교환할 수 없습니다'); return; }
  el.sourceLang.value = t;
  el.targetLang.value = s;
  settings.set('sourceLang', t);
  settings.set('targetLang', s);
  const inText = el.inputText.value;
  el.inputText.value = currentOutputText;
  currentOutputText = inText;
  updateOutputDisplay();
  updateCharCount();
}

// ===== Models =====
async function refreshModels() {
  const ep = settings.getSelectedEndpoint();
  if (!ep) { el.modelSelect.innerHTML = ''; return; }
  el.refreshModels.style.opacity = '0.5';
  fetchedModels = await OpenAICompatibleProvider.fetchModels(ep);
  el.refreshModels.style.opacity = '';
  populateModelSelect();
}

function populateModelSelect() {
  const current = settings.data.model || settings.getSelectedEndpoint()?.model || '';
  let opts = '';
  if (fetchedModels.length) {
    opts = fetchedModels.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  }
  // 항상 수동 입력용 항목 보장: 현재 모델이 목록에 없으면 추가
  if (current && !fetchedModels.includes(current)) {
    opts = `<option value="${escapeHtml(current)}">${escapeHtml(current)}</option>` + opts;
  }
  if (!opts) opts = '<option value="">(모델을 입력하거나 새로고침하세요)</option>';
  el.modelSelect.innerHTML = opts;
  el.modelSelect.value = current;
  el.modelSelect.onchange = () => settings.set('model', el.modelSelect.value);
}

// ===== Translate =====
function onTranslateClick() {
  if (isTranslating) { abortController?.abort(); return; }
  translate();
}

async function translate() {
  const text = el.inputText.value.trim();
  if (!text) { toast('텍스트를 입력하세요'); return; }
  const ep = settings.getSelectedEndpoint();
  if (!ep) { toast('엔드포인트를 설정하세요'); return; }
  const cfg = settings.getProviderConfig();
  if (!cfg.baseUrl) { toast('Base URL을 설정하세요'); openSettings(); return; }
  if (!cfg.model) { toast('모델을 선택하세요'); openSettings(); return; }

  const sourceLang = el.sourceLang.value;
  const targetLang = el.targetLang.value;
  const srcName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const tgtName = LANGUAGE_NAMES[targetLang] || targetLang;
  const userPrompt = settings.data.prompts.user
    .replace(/{source_lang}/g, srcName)
    .replace(/{target_lang}/g, tgtName)
    .replace(/{text}/g, text);
  const systemPrompt = settings.data.prompts.system;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  setTranslating(true);
  currentOutputText = '';
  updateOutputDisplay();
  el.statusTag.textContent = '번역 중...';
  el.statusTag.className = 'status-tag streaming';
  resetReasoningPanel();
  abortController = new AbortController();

  const provider = new OpenAICompatibleProvider(cfg);
  let outText = '';

  try {
    if (settings.data.stream) {
      await provider.translateStream(messages, {
        onContent: (chunk, full) => {
          currentOutputText = full;
          updateOutputDisplay();
        },
        onReasoning: (chunk, full) => {
          showReasoning(full, true);
        },
        onContentFinal: (full) => {
          currentOutputText = full;
          updateOutputDisplay();
        },
        onReasoningFinal: (full) => { if (full) finalizeReasoning(full); },
        onDone: () => {},
      }, { signal: abortController.signal, advanced: !!cfg.advanced });
      outText = currentOutputText;
    } else {
      const r = await provider.translate(messages, { signal: abortController.signal, advanced: !!cfg.advanced });
      currentOutputText = r.content;
      updateOutputDisplay();
      outText = r.content;
      if (r.reasoning) { showReasoning(r.reasoning); finalizeReasoning(r.reasoning); }
    }
    el.statusTag.textContent = '완료';
    el.statusTag.className = 'status-tag done';
    lastTranslation = { sourceLang, targetLang, sourceText: text, targetText: outText, endpoint: ep.name, model: cfg.model, reasoning: el.reasoningText.textContent || '' };
    if (outText) {
      const saved = history.add(lastTranslation);
      lastTranslation.savedId = saved.id;
      renderHistory();
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      el.statusTag.textContent = '중단됨';
      el.statusTag.className = 'status-tag';
    } else {
      el.statusTag.textContent = '오류';
      el.statusTag.className = 'status-tag error';
      currentOutputText = '';
      updateOutputDisplay();
      toast('오류: ' + e.message);
    }
  } finally {
    setTranslating(false);
    abortController = null;
  }
}

function setTranslating(v) {
  isTranslating = v;
  if (v) {
    el.translateBtn.textContent = '중단';
    el.translateBtn.classList.add('stop');
  } else {
    el.translateBtn.textContent = '번역하기';
    el.translateBtn.classList.remove('stop');
  }
}

// ===== UI Display & Sizing =====
function updateOutputDisplay() {
  if (settings.data.markdown && window.marked) {
    el.outputText.innerHTML = window.marked.parse(currentOutputText || '');
  } else {
    el.outputText.textContent = currentOutputText || '';
  }
  adjustHeights();
}

function adjustHeights() {
  const auto = !!settings.data.autoHeight;
  if (!auto) {
    el.inputText.style.height = '';
    el.outputText.style.height = '';
    el.outputText.style.overflowY = '';
    return;
  }
  // Reset input textarea height first to get accurate scrollHeight
  el.inputText.style.height = 'auto';
  el.inputText.style.height = el.inputText.scrollHeight + 'px';

  // Allow output box to expand naturally
  el.outputText.style.height = 'auto';
  el.outputText.style.overflowY = 'visible';
}

// ===== Reasoning panel =====
function resetReasoningPanel() {
  el.reasoningPanel.style.display = 'none';
  el.reasoningPanel.open = false;
  el.reasoningText.textContent = '';
}

function showReasoning(text, replace = false) {
  if (el.reasoningPanel.style.display === 'none') {
    el.reasoningPanel.style.display = 'block';
    el.reasoningPanel.open = true;
  }
  if (replace) {
    el.reasoningText.textContent = text;
  } else {
    el.reasoningText.textContent += text;
  }
  el.reasoningText.scrollTop = el.reasoningText.scrollHeight;
}

function finalizeReasoning(text) {
  el.reasoningText.textContent = text;
}

// ===== Copy / Save =====
async function copyOutput() {
  const t = el.outputText.textContent;
  if (!t) return;
  try { await navigator.clipboard.writeText(t); toast('복사됨'); } catch (e) { toast('복사 실패'); }
}

function saveToHistory() {
  if (!lastTranslation || !lastTranslation.targetText) return;
  if (lastTranslation.savedId) return;
  const saved = history.add(lastTranslation);
  lastTranslation.savedId = saved.id;
  renderHistory();
}

// ===== Settings modal =====
function openSettings() {
  loadSettingsToUI();
  renderEndpointList();
  el.settingsModal.classList.add('show');
  el.overlay.classList.add('show');
}

function closeSettings() {
  el.settingsModal.classList.remove('show');
  if (!el.historySidebar.classList.contains('show')) el.overlay.classList.remove('show');
}

function loadSettingsToUI() {
  el.streamToggle.checked = settings.data.stream;
  el.sourceLang.value = settings.data.sourceLang;
  el.targetLang.value = settings.data.targetLang;
  el.advancedToggle.checked = settings.data.enableAdvanced;
  toggleAdvancedUI(el.advancedToggle.checked);
  el.systemPrompt.value = settings.data.prompts.system;
  el.userPrompt.value = settings.data.prompts.user;
  // ranges
  document.querySelectorAll('[data-key]').forEach(input => {
    const v = settings.get(input.dataset.key);
    if (v != null) input.value = v;
    const disp = document.querySelector(`[data-val="${input.dataset.key}"]`);
    if (disp) disp.textContent = v;
  });
}

function renderEndpointList(highlight) {
  const eps = settings.data.endpoints;
  el.endpointList.innerHTML = eps.map(e => `
    <div class="endpoint-card" data-id="${e.id}">
      <div class="row">
        <input type="text" data-field="name" value="${escapeAttr(e.name)}" placeholder="이름">
        <input type="text" data-field="baseUrl" value="${escapeAttr(e.baseUrl)}" placeholder="Base URL (https://...)" >
      </div>
      <div class="row">
        <input type="password" data-field="apiKey" value="${escapeAttr(e.apiKey)}" placeholder="API Key">
        <input type="text" data-field="model" value="${escapeAttr(e.model)}" placeholder="기본 모델">
      </div>
      <button class="btn btn-danger del-btn" data-del="${e.id}">삭제</button>
    </div>
  `).join('');
  // bind
  el.endpointList.querySelectorAll('.endpoint-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelectorAll('[data-field]').forEach(inp => {
      inp.addEventListener('change', () => {
        settings.updateEndpoint(id, { [inp.dataset.field]: inp.value });
        if (inp.dataset.field === 'model' && id === settings.data.endpointId) {
          settings.set('model', inp.value);
        }
        if (['name', 'baseUrl', 'apiKey', 'model'].includes(inp.dataset.field)) {
          settings.save();
          populateEndpoints();
        }
      });
    });
    const del = card.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => {
      if (settings.deleteEndpoint(id)) { renderEndpointList(); populateEndpoints(); applySettingsToMain(); }
    });
  });
  if (highlight) {
    const card = el.endpointList.querySelector(`[data-id="${highlight.id}"]`);
    if (card) { card.style.borderColor = 'var(--accent)'; card.scrollIntoView({ block: 'nearest' }); }
  }
}

function saveSettingsFromUI() {
  settings.set('stream', el.streamToggle.checked);
  settings.set('sourceLang', el.sourceLang.value);
  settings.set('targetLang', el.targetLang.value);
  settings.set('enableAdvanced', el.advancedToggle.checked);
  settings.set('prompts.system', el.systemPrompt.value);
  settings.set('prompts.user', el.userPrompt.value);
  // ranges
  document.querySelectorAll('[data-key]').forEach(input => settings.set(input.dataset.key, parseFloat(input.value)));
  settings.save();
  applySettingsToMain();
  populateModelSelect();
  closeSettings();
  toast('설정 저장됨');
}

function applySettingsToMain() {
  el.streamToggle.checked = settings.data.stream;
  el.sourceLang.value = settings.data.sourceLang;
  el.targetLang.value = settings.data.targetLang;
  el.endpointSelect.value = settings.data.endpointId;
  el.autoHeightToggle.checked = !!settings.data.autoHeight;
  el.markdownToggle.checked = !!settings.data.markdown;
  populateModelSelect();
  adjustHeights();
}

function toggleAdvancedUI(on) {
  el.advancedSection.classList.toggle('disabled', !on);
  // bind range live display
  document.querySelectorAll('[data-key]').forEach(input => {
    input.oninput = () => {
      const disp = document.querySelector(`[data-val="${input.dataset.key}"]`);
      if (disp) disp.textContent = input.value;
    };
  });
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
}

// ===== History sidebar =====
function openHistory() {
  renderHistory();
  el.historySidebar.classList.add('show');
  el.overlay.classList.add('show');
}

function closeHistory() {
  el.historySidebar.classList.remove('show');
  if (!el.settingsModal.classList.contains('show')) el.overlay.classList.remove('show');
}

function renderHistory(query = '') {
  const items = history.search(query);
  if (!items.length) {
    el.historyList.innerHTML = '<div class="history-empty">기록이 없습니다</div>';
    return;
  }
  el.historyList.innerHTML = items.map(i => `
    <div class="history-item" data-id="${i.id}">
      <div class="meta">
        <span>${history.getLabel(i.sourceLang)} → ${history.getLabel(i.targetLang)}</span>
        <span>${history.formatTimeAgo(i.timestamp)}</span>
      </div>
      <div class="text">${escapeHtml(i.sourceText || '')}</div>
      <div class="text soft">${escapeHtml(i.targetText || '')}</div>
      <span class="del" data-del="${i.id}">🗑</span>
    </div>
  `).join('');
  el.historyList.querySelectorAll('.history-item').forEach(item => {
    const id = item.dataset.id;
    item.addEventListener('click', (e) => {
      if (e.target.dataset.del) return;
      loadFromHistory(id);
    });
    const del = item.querySelector('[data-del]');
    if (del) del.addEventListener('click', (e) => { e.stopPropagation(); history.remove(id); renderHistory(el.historySearch.value); });
  });
}

function loadFromHistory(id) {
  const item = history.get(id);
  if (!item) return;
  el.inputText.value = item.sourceText || '';
  currentOutputText = item.targetText || '';
  updateOutputDisplay();
  el.sourceLang.value = item.sourceLang;
  el.targetLang.value = item.targetLang;
  updateCharCount();
  closeHistory();
}

// ===== Toast =====
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1800);
}

// ===== Utils =====
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ===== Go =====
init();