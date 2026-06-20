// providers.js — 단일 OpenAI 호환 프로바이더 (스트리밍/추론 파싱)

export const LANGUAGE_NAMES = {
  auto: 'auto-detected language',
  ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese',
  es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian',
  pt: 'Portuguese', it: 'Italian', vi: 'Vietnamese',
  th: 'Thai', id: 'Indonesian', ar: 'Arabic',
};

export const DEFAULT_ENDPOINTS = [
  { id: 'openai-default', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-5.5' },
];

/**
 * SSE 스트림을 읽어 라인별로 콜백 호출.
 * data: {json}\n 형식. [DONE] 종료. 비 data: 라인 무시.
 */
async function readSSE(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try { onData(JSON.parse(data)); } catch (e) { /* partial json, skip */ }
      }
    }
  }
}

/**
 * NDJSON 스트림(Ollama 등)을 읽어 객체별 콜백 호출.
 */
async function readNDJSON(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try { onData(JSON.parse(line)); } catch (e) { /* skip */ }
    }
  }
}

/**
 * 인라인 추론 태그(<think>..</think>, <thinking>..</thinking>, <reasoning>..</reasoning>)를 본문에서 분리.
 * 스트리밍 중 부분 태그(열림/닫힘 미완료)도 처리.
 * returns { reasoning: string, content: string }
 */
function separateThinking(text) {
  let reasoning = '';
  let content = '';
  const re = /<\s*(think|thinking|reasoning)\b[^>]*>|<\s*\/\s*(think|thinking|reasoning)\s*>/gi;
  let m;
  // 단순 파서: 태그 열림/닫힘 사이의 텍스트는 reasoning, 밖은 content
  const tokens = [];
  while ((m = re.exec(text))) {
    tokens.push({ type: m[1] ? 'open' : 'close', tag: m[1] || m[2], idx: m.index, end: m.index + m[0].length });
  }
  let pos = 0;
  let inside = false;
  for (const t of tokens) {
    const chunk = text.slice(pos, t.idx);
    if (inside) reasoning += chunk; else content += chunk;
    if (t.type === 'open') inside = true;
    else if (t.type === 'close') inside = false;
    pos = t.end;
  }
  const tail = text.slice(pos);
  if (inside) reasoning += tail; else content += tail;
  return { reasoning, content };
}

export class OpenAICompatibleProvider {
  constructor(config) {
    this.config = config; // { baseUrl, apiKey, model, advanced?, ... }
  }

  get headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h['Authorization'] = `Bearer ${this.config.apiKey}`;
    return h;
  }

  get endpoint() {
    const base = (this.config.baseUrl || '').replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  buildMessages(systemPrompt, userPrompt) {
    return [
      { role: 'system', content: systemPrompt || '' },
      { role: 'user', content: userPrompt || '' },
    ];
  }

  buildBody(messages, { stream, advanced }) {
    const body = {
      model: this.config.model,
      messages,
      stream: !!stream,
    };
    if (advanced && this.config.advanced) {
      const a = this.config.advanced;
      if (a.temperature != null) body.temperature = a.temperature;
      if (a.top_p != null) body.top_p = a.top_p;
      if (a.top_k != null) body.top_k = a.top_k;
      if (a.repeat_penalty != null) body.repeat_penalty = a.repeat_penalty;
      if (a.presence_penalty != null) body.presence_penalty = a.presence_penalty;
      if (a.frequency_penalty != null) body.frequency_penalty = a.frequency_penalty;
    }
    return body;
  }

  /**
   * 비스트리밍 번역.
   * @returns { content, reasoning }
   */
  async translate(messages, options = {}) {
    const body = this.buildBody(messages, { stream: false, advanced: options.advanced });
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    let reasoning = msg.reasoning_content || '';
    const content = msg.content || '';
    if (!reasoning) {
      const sep = separateThinking(content);
      reasoning = sep.reasoning;
      return { content: sep.content, reasoning };
    }
    return { content, reasoning };
  }

  /**
   * 스트리밍 번역.
   * @param callbacks { onContent(str), onReasoning(str), onDone(), onError(err) }
   */
  async translateStream(messages, callbacks = {}, options = {}) {
    const body = this.buildBody(messages, { stream: true, advanced: options.advanced });
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
    }

    // 상대방이 SSE 또는 NDJSON을 보낼 수 있음. Content-Type으로 판별.
    const ct = res.headers.get('content-type') || '';
    const isNDJSON = ct.includes('application/x-ndjson') || ct.includes('application/jsonl');

    let contentBuffer = '';
    let reasoningBuffer = '';
    let sawReasoningField = false;

    const handleDelta = (delta) => {
      if (delta.reasoning_content != null) {
        sawReasoningField = true;
        if (delta.reasoning_content) { reasoningBuffer += delta.reasoning_content; callbacks.onReasoning?.(delta.reasoning_content); }
      }
      if (delta.content != null) {
        if (sawReasoningField) {
          if (delta.content) { contentBuffer += delta.content; callbacks.onContent?.(delta.content); }
        } else {
          // 인라인 태그 가능: 누적 후 분리
          contentBuffer += delta.content || '';
          const sep = separateThinking(contentBuffer);
          // 증분만 전달: 마지막으로 전달한 content/reasoning 기준
          callbacks.onContent?.(sep.content);
          if (sep.reasoning) callbacks.onReasoning?.(sep.reasoning);
        }
      }
    };

    const parseChunk = (obj) => {
      // OpenAI 호환: choices[0].delta
      const delta = obj.choices?.[0]?.delta;
      if (delta) handleDelta(delta);
      // Ollama 호환: message.content
      else if (obj.message?.content != null) {
        contentBuffer += obj.message.content;
        callbacks.onContent?.(obj.message.content);
      }
      // 완료 신호
      if (obj.choices?.[0]?.finish_reason) callbacks.onDone?.();
      if (obj.done) callbacks.onDone?.();
    };

    try {
      if (isNDJSON) {
        await readNDJSON(res, parseChunk);
      } else {
        await readSSE(res, parseChunk);
      }
    } catch (e) {
      if (e.name === 'AbortError') { callbacks.onDone?.(); return; }
      throw e;
    }
    // 스트림 종료 후 인라인 태그 처리된 content 정리
    if (!sawReasoningField && contentBuffer) {
      const sep = separateThinking(contentBuffer);
      callbacks.onContentFinal?.(sep.content);
      if (sep.reasoning) callbacks.onReasoningFinal?.(sep.reasoning);
    } else {
      callbacks.onContentFinal?.(contentBuffer);
      callbacks.onReasoningFinal?.(reasoningBuffer);
    }
    callbacks.onDone?.();
  }

  /**
   * 모델 목록 조회. 실패 시 빈 배열.
   */
  static async fetchModels(config) {
    const base = (config.baseUrl || '').replace(/\/+$/, '');
    if (!base) return [];
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout?.(8000) });
      if (!res.ok) return [];
      const data = await res.json();
      const list = data.data || data.models || [];
      return list.map(m => m.id || m.name).filter(Boolean);
    } catch (e) {
      return [];
    }
  }
}