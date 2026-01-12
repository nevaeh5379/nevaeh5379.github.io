/**
 * LLM Provider Classes
 * Handles API calls to different LLM providers with streaming support
 */

// Base Provider Class
class BaseProvider {
    constructor(config) {
        this.config = config;
    }

    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        throw new Error('translate method must be implemented');
    }

    // Streaming translate with callbacks
    // callbacks: { onContent, onReasoning, onDone, onError }
    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        // Default implementation falls back to non-streaming
        try {
            const result = await this.translate(text, sourceLang, targetLang, systemPrompt, userPrompt);
            if (callbacks.onContent) callbacks.onContent(result);
            if (callbacks.onDone) callbacks.onDone(result);
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    static async fetchModels(config) {
        throw new Error('fetchModels method must be implemented');
    }

    static getDefaultModels() {
        return [];
    }

    buildPrompt(text, sourceLang, targetLang, userPrompt) {
        const sourceLangName = this.getLanguageName(sourceLang);
        const targetLangName = this.getLanguageName(targetLang);
        
        return userPrompt
            .replace(/{source_lang}/g, sourceLangName)
            .replace(/{target_lang}/g, targetLangName)
            .replace(/{text}/g, text);
    }

    getLanguageName(code) {
        const languages = {
            'auto': 'auto-detected language',
            'ko': 'Korean',
            'en': 'English',
            'ja': 'Japanese',
            'zh': 'Chinese',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'ru': 'Russian',
            'pt': 'Portuguese',
            'it': 'Italian',
            'vi': 'Vietnamese',
            'th': 'Thai',
            'id': 'Indonesian',
            'ar': 'Arabic'
        };
        return languages[code] || code;
    }
}

// OpenAI Provider
class OpenAIProvider extends BaseProvider {
    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        const apiKey = this.config.apiKey;
        const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
        const model = this.config.model || 'gpt-4o-mini';

        if (!apiKey) {
            throw new Error('OpenAI API Key가 설정되지 않았습니다.');
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `OpenAI API 오류: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        const apiKey = this.config.apiKey;
        const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
        const model = this.config.model || 'gpt-4o-mini';

        if (!apiKey) {
            throw new Error('OpenAI API Key가 설정되지 않았습니다.');
        }

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                    ],
                    temperature: 0.3,
                    stream: true
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `OpenAI API 오류: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullContent += delta;
                                if (callbacks.onContent) callbacks.onContent(fullContent);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            if (callbacks.onDone) callbacks.onDone(fullContent.trim());
            return fullContent.trim();
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    static async fetchModels(config) {
        const apiKey = config.apiKey;
        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';

        if (!apiKey) {
            return this.getDefaultModels();
        }

        try {
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                return this.getDefaultModels();
            }

            const data = await response.json();
            const chatModels = data.data
                .filter(m => m.id.includes('gpt') && !m.id.includes('instruct') && !m.id.includes('realtime') && !m.id.includes('audio'))
                .sort((a, b) => b.id.localeCompare(a.id))
                .map(m => ({ value: m.id, label: m.id }));

            return chatModels.length > 0 ? chatModels : this.getDefaultModels();
        } catch (e) {
            console.error('Failed to fetch OpenAI models:', e);
            return this.getDefaultModels();
        }
    }

    static getDefaultModels() {
        return [
            { value: 'gpt-4o', label: 'gpt-4o' },
            { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
            { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
            { value: 'gpt-4', label: 'gpt-4' },
            { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' }
        ];
    }
}

// Claude Provider
class ClaudeProvider extends BaseProvider {
    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        const apiKey = this.config.apiKey;
        const model = this.config.model || 'claude-3-5-sonnet-20241022';

        if (!apiKey) {
            throw new Error('Claude API Key가 설정되지 않았습니다.');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                ]
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Claude API 오류: ${response.status}`);
        }

        const data = await response.json();
        return data.content[0].text.trim();
    }

    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        const apiKey = this.config.apiKey;
        const model = this.config.model || 'claude-3-5-sonnet-20241022';

        if (!apiKey) {
            throw new Error('Claude API Key가 설정되지 않았습니다.');
        }

        // Always enable extended thinking for all Claude models
        const requestBody = {
            model: model,
            max_tokens: 16000,
            system: systemPrompt,
            messages: [
                { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
            ],
            stream: true,
            thinking: {
                type: 'enabled',
                budget_tokens: 8000
            }
        };

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `Claude API 오류: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let fullThinking = '';
            let currentBlockType = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (!data || data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            
                            // Handle content block start
                            if (parsed.type === 'content_block_start') {
                                currentBlockType = parsed.content_block?.type;
                            }
                            
                            // Handle content block delta
                            if (parsed.type === 'content_block_delta') {
                                const delta = parsed.delta;
                                
                                if (delta?.type === 'thinking_delta' && delta.thinking) {
                                    fullThinking += delta.thinking;
                                    if (callbacks.onReasoning) callbacks.onReasoning(fullThinking);
                                }
                                
                                if (delta?.type === 'text_delta' && delta.text) {
                                    fullContent += delta.text;
                                    if (callbacks.onContent) callbacks.onContent(fullContent);
                                }
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            if (callbacks.onDone) callbacks.onDone(fullContent.trim(), fullThinking);
            return fullContent.trim();
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    static async fetchModels(config) {
        // Claude doesn't have a public models endpoint accessible from browser
        // Return default models
        return this.getDefaultModels();
    }

    static getDefaultModels() {
        return [
            { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
            { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
            { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
            { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
            { value: 'claude-haiku-4-5-20251015', label: 'Claude Haiku 4.5' },
            { value: 'claude-opus-4-5-20251124', label: 'Claude Opus 4.5' },
            { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
            { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
            { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' }
        ];
    }
}

// Gemini Provider
class GeminiProvider extends BaseProvider {
    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        const apiKey = this.config.apiKey;
        const model = this.config.model || 'gemini-2.0-flash-exp';

        if (!apiKey) {
            throw new Error('Gemini API Key가 설정되지 않았습니다.');
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: [{
                        parts: [{ text: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }]
                    }],
                    generationConfig: {
                        temperature: 0.3
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `Gemini API 오류: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text.trim();
    }

    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        const apiKey = this.config.apiKey;
        const model = this.config.model || 'gemini-2.0-flash-exp';

        if (!apiKey) {
            throw new Error('Gemini API Key가 설정되지 않았습니다.');
        }

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        system_instruction: {
                            parts: [{ text: systemPrompt }]
                        },
                        contents: [{
                            parts: [{ text: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }]
                        }],
                        generationConfig: {
                            temperature: 0.3
                        }
                    })
                }
            );

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `Gemini API 오류: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (!data) continue;

                        try {
                            const parsed = JSON.parse(data);
                            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) {
                                fullContent += text;
                                if (callbacks.onContent) callbacks.onContent(fullContent);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            if (callbacks.onDone) callbacks.onDone(fullContent.trim());
            return fullContent.trim();
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    static async fetchModels(config) {
        const apiKey = config.apiKey;

        if (!apiKey) {
            return this.getDefaultModels();
        }

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );

            if (!response.ok) {
                return this.getDefaultModels();
            }

            const data = await response.json();
            const models = data.models
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                .map(m => {
                    const name = m.name.replace('models/', '');
                    return { value: name, label: m.displayName || name };
                })
                .sort((a, b) => a.label.localeCompare(b.label));

            return models.length > 0 ? models : this.getDefaultModels();
        } catch (e) {
            console.error('Failed to fetch Gemini models:', e);
            return this.getDefaultModels();
        }
    }

    static getDefaultModels() {
        return [
            { value: 'gemini-3.0-flash', label: 'Gemini 3.0 Flash' },
            { value: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro' },
            { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { value: 'gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash Lite' },
            { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
            { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
            { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
        ];
    }
}

// Ollama Provider
class OllamaProvider extends BaseProvider {
    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        const baseUrl = this.config.baseUrl || 'http://localhost:11434';
        const model = this.config.model || 'llama3.2';

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                ],
                stream: false,
                options: {
                    temperature: 0.3
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama 연결 오류: ${response.status}. 서버가 실행 중인지 확인하세요.`);
        }

        const data = await response.json();
        return data.message.content.trim();
    }

    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        const baseUrl = this.config.baseUrl || 'http://localhost:11434';
        const model = this.config.model || 'llama3.2';

        try {
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                    ],
                    stream: true,
                    options: {
                        temperature: 0.3
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama 연결 오류: ${response.status}. 서버가 실행 중인지 확인하세요.`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    try {
                        const parsed = JSON.parse(line);
                        const content = parsed.message?.content;
                        if (content) {
                            fullContent += content;
                            if (callbacks.onContent) callbacks.onContent(fullContent);
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }

            if (callbacks.onDone) callbacks.onDone(fullContent.trim());
            return fullContent.trim();
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    static async fetchModels(config) {
        const baseUrl = config.baseUrl || 'http://localhost:11434';

        try {
            const response = await fetch(`${baseUrl}/api/tags`);

            if (!response.ok) {
                return this.getDefaultModels();
            }

            const data = await response.json();
            const models = data.models
                .map(m => ({ value: m.name, label: m.name }))
                .sort((a, b) => a.label.localeCompare(b.label));

            return models.length > 0 ? models : this.getDefaultModels();
        } catch (e) {
            console.error('Failed to fetch Ollama models:', e);
            return this.getDefaultModels();
        }
    }

    static getDefaultModels() {
        return [
            { value: 'llama3.2', label: 'llama3.2' },
            { value: 'llama3.1', label: 'llama3.1' },
            { value: 'llama3', label: 'llama3' },
            { value: 'mistral', label: 'mistral' },
            { value: 'mixtral', label: 'mixtral' },
            { value: 'qwen2.5', label: 'qwen2.5' },
            { value: 'gemma2', label: 'gemma2' },
            { value: 'phi3', label: 'phi3' }
        ];
    }
}

// llama.cpp Provider
class LlamaCppProvider extends BaseProvider {
    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        const baseUrl = this.config.baseUrl || 'http://localhost:8080';

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`llama.cpp 연결 오류: ${response.status}. 서버가 실행 중인지 확인하세요.`);
        }

        const data = await response.json();
        const rawContent = data.choices[0].message.content;
        
        // Filter out thinking blocks
        const filtered = this.filterThinkingBlocks(rawContent);
        return filtered.trim();
    }

    // Filter thinking blocks from text (for non-streaming)
    filterThinkingBlocks(text) {
        const { output } = this.separateThinking(text);
        return output;
    }

    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        const baseUrl = this.config.baseUrl || 'http://localhost:8080';

        try {
            const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                    ],
                    temperature: 0.3,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`llama.cpp 연결 오류: ${response.status}. 서버가 실행 중인지 확인하세요.`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            let fullText = '';
            let fullReasoning = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;
                            
                            // Handle reasoning_content from llama.cpp --reasoning-format
                            if (delta?.reasoning_content) {
                                fullReasoning += delta.reasoning_content;
                                if (callbacks.onReasoning) {
                                    callbacks.onReasoning(fullReasoning);
                                }
                            }
                            
                            // Handle regular content
                            if (delta?.content) {
                                fullText += delta.content;
                                
                                // Also check for <think> tags in content (fallback)
                                let thinking = fullReasoning;
                                let output = fullText;
                                
                                // Check for <think> tag in content
                                const thinkStart = fullText.indexOf('<think>');
                                if (thinkStart !== -1) {
                                    const thinkEnd = fullText.indexOf('</think>');
                                    
                                    if (thinkEnd !== -1) {
                                        thinking = fullText.substring(thinkStart + 7, thinkEnd);
                                        output = fullText.substring(0, thinkStart) + fullText.substring(thinkEnd + 8);
                                    } else {
                                        thinking = fullText.substring(thinkStart + 7);
                                        output = fullText.substring(0, thinkStart);
                                    }
                                    
                                    output = output.replace(/<\/?think>/g, '').trim();
                                    thinking = thinking.replace(/<\/?think>/g, '').trim();
                                    
                                    if (thinking && callbacks.onReasoning) {
                                        callbacks.onReasoning(thinking);
                                    }
                                }
                                
                                if (callbacks.onContent) {
                                    callbacks.onContent(output);
                                }
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            // Final cleanup
            let finalThinking = fullReasoning;
            let finalOutput = fullText;
            
            // Handle think tags in final output
            const thinkStart = fullText.indexOf('<think>');
            if (thinkStart !== -1) {
                const thinkEnd = fullText.indexOf('</think>');
                if (thinkEnd !== -1) {
                    finalThinking = fullText.substring(thinkStart + 7, thinkEnd);
                    finalOutput = fullText.substring(0, thinkStart) + fullText.substring(thinkEnd + 8);
                } else {
                    finalThinking = fullText.substring(thinkStart + 7);
                    finalOutput = fullText.substring(0, thinkStart);
                }
            }
            
            finalOutput = finalOutput.replace(/<\/?think>/g, '').trim();
            finalThinking = finalThinking.replace(/<\/?think>/g, '').trim();
            
            if (callbacks.onDone) callbacks.onDone(finalOutput, finalThinking);
            return finalOutput;
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    // Separate thinking content from output
    separateThinking(text) {
        let thinking = '';
        let output = text;
        
        // Extract content from complete think blocks
        const completePattern = /<think>([\s\S]*?)<\/think>/gi;
        let match;
        while ((match = completePattern.exec(text)) !== null) {
            thinking += match[1];
        }
        
        // Remove complete think blocks from output
        output = output.replace(/<think>[\s\S]*?<\/think>/gi, '');
        
        // Handle incomplete think block (still streaming)
        const openIdx = output.lastIndexOf('<think>');
        const closeIdx = output.lastIndexOf('</think>');
        
        if (openIdx !== -1 && (closeIdx === -1 || closeIdx < openIdx)) {
            // Currently inside an unclosed think block
            thinking += output.substring(openIdx + 7); // 7 = '<think>'.length
            output = output.substring(0, openIdx);
        }
        
        // Clean up any orphan tags
        output = output.replace(/<\/?think>/gi, '').trim();
        
        // Also handle <thinking> and <reasoning> tags
        output = output.replace(/<thinking>[\s\S]*?<\/thinking>/gi, (m) => {
            thinking += m.replace(/<\/?thinking>/gi, '');
            return '';
        });
        output = output.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, (m) => {
            thinking += m.replace(/<\/?reasoning>/gi, '');
            return '';
        });
        output = output.replace(/<\/?thinking>/gi, '').replace(/<\/?reasoning>/gi, '').trim();
        
        return { thinking: thinking.trim(), output };
    }

    static async fetchModels(config) {
        const baseUrl = config.baseUrl || 'http://localhost:8080';

        try {
            const response = await fetch(`${baseUrl}/v1/models`);

            if (!response.ok) {
                return this.getDefaultModels();
            }

            const data = await response.json();
            const models = data.data
                .map(m => ({ value: m.id, label: m.id }));

            return models.length > 0 ? models : this.getDefaultModels();
        } catch (e) {
            console.error('Failed to fetch llama.cpp models:', e);
            return this.getDefaultModels();
        }
    }

    static getDefaultModels() {
        return [
            { value: 'default', label: '로드된 모델' }
        ];
    }
}

// OpenAI Compatible Provider
class OpenAICompatibleProvider extends BaseProvider {
    async translate(text, sourceLang, targetLang, systemPrompt, userPrompt) {
        const baseUrl = this.config.baseUrl;
        const apiKey = this.config.apiKey;
        const model = this.config.model || 'default';

        if (!baseUrl) {
            throw new Error('OpenAI 호환 API의 Base URL이 설정되지 않았습니다.');
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API 오류: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    async translateStream(text, sourceLang, targetLang, systemPrompt, userPrompt, callbacks) {
        const baseUrl = this.config.baseUrl;
        const apiKey = this.config.apiKey;
        const model = this.config.model || 'default';

        if (!baseUrl) {
            throw new Error('OpenAI 호환 API의 Base URL이 설정되지 않았습니다.');
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        try {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: this.buildPrompt(text, sourceLang, targetLang, userPrompt) }
                    ],
                    temperature: 0.3,
                    stream: true
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `API 오류: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullContent += delta;
                                if (callbacks.onContent) callbacks.onContent(fullContent);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            if (callbacks.onDone) callbacks.onDone(fullContent.trim());
            return fullContent.trim();
        } catch (error) {
            if (callbacks.onError) callbacks.onError(error);
            throw error;
        }
    }

    static async fetchModels(config) {
        const baseUrl = config.baseUrl;
        const apiKey = config.apiKey;

        if (!baseUrl) {
            return this.getDefaultModels();
        }

        try {
            const headers = {};
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                return this.getDefaultModels();
            }

            const data = await response.json();
            const models = data.data
                .map(m => ({ value: m.id, label: m.id }))
                .sort((a, b) => a.label.localeCompare(b.label));

            return models.length > 0 ? models : this.getDefaultModels();
        } catch (e) {
            console.error('Failed to fetch OpenAI Compatible models:', e);
            return this.getDefaultModels();
        }
    }

    static getDefaultModels() {
        return [
            { value: 'default', label: '기본 모델' }
        ];
    }
}

// Provider Factory
class ProviderFactory {
    static create(providerType, config) {
        switch (providerType) {
            case 'openai':
                return new OpenAIProvider(config);
            case 'claude':
                return new ClaudeProvider(config);
            case 'gemini':
                return new GeminiProvider(config);
            case 'ollama':
                return new OllamaProvider(config);
            case 'llamacpp':
                return new LlamaCppProvider(config);
            case 'openai-compatible':
                return new OpenAICompatibleProvider(config);
            default:
                throw new Error(`Unknown provider: ${providerType}`);
        }
    }

    static async fetchModels(providerType, config) {
        switch (providerType) {
            case 'openai':
                return OpenAIProvider.fetchModels(config);
            case 'claude':
                return ClaudeProvider.fetchModels(config);
            case 'gemini':
                return GeminiProvider.fetchModels(config);
            case 'ollama':
                return OllamaProvider.fetchModels(config);
            case 'llamacpp':
                return LlamaCppProvider.fetchModels(config);
            case 'openai-compatible':
                return OpenAICompatibleProvider.fetchModels(config);
            default:
                return [];
        }
    }

    static getDefaultModels(providerType) {
        switch (providerType) {
            case 'openai':
                return OpenAIProvider.getDefaultModels();
            case 'claude':
                return ClaudeProvider.getDefaultModels();
            case 'gemini':
                return GeminiProvider.getDefaultModels();
            case 'ollama':
                return OllamaProvider.getDefaultModels();
            case 'llamacpp':
                return LlamaCppProvider.getDefaultModels();
            case 'openai-compatible':
                return OpenAICompatibleProvider.getDefaultModels();
            default:
                return [];
        }
    }
}

// Export for use in other modules
window.ProviderFactory = ProviderFactory;
