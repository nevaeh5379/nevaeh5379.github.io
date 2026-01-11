// DOM Elements
const inputText = document.getElementById('input-text');
const outputText = document.getElementById('output-text');
const userReplacement = document.getElementById('user-replacement');
const charReplacement = document.getElementById('char-replacement');
const clearInputBtn = document.getElementById('clear-input');
const pasteInputBtn = document.getElementById('paste-input');
const copyOutputBtn = document.getElementById('copy-output');
const toast = document.getElementById('toast');

// Convert function
function convertText() {
    const input = inputText.value;
    const userWord = userReplacement.value;
    const charWord = charReplacement.value;

    let result = input;

    // Replace {{user}} (case-insensitive)
    if (userWord) {
        result = result.replace(/\{\{user\}\}/gi, userWord);
    }

    // Replace {{char}} (case-insensitive)
    if (charWord) {
        result = result.replace(/\{\{char\}\}/gi, charWord);
    }

    outputText.value = result;
}

// Show toast message
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// Event Listeners - Real-time conversion
inputText.addEventListener('input', convertText);
userReplacement.addEventListener('input', convertText);
charReplacement.addEventListener('input', convertText);

// Clear input
clearInputBtn.addEventListener('click', () => {
    inputText.value = '';
    outputText.value = '';
    inputText.focus();
});

// Paste from clipboard
pasteInputBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        inputText.value = text;
        convertText();
        showToast('📋 붙여넣기 완료!');
    } catch (err) {
        showToast('❌ 클립보드 접근 실패');
    }
});

// Copy output to clipboard
copyOutputBtn.addEventListener('click', async () => {
    const text = outputText.value;

    if (!text) {
        showToast('⚠️ 복사할 내용이 없습니다');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showToast('✅ 복사 완료!');
    } catch (err) {
        // Fallback for older browsers
        outputText.select();
        document.execCommand('copy');
        showToast('✅ 복사 완료!');
    }
});

// Save preferences to localStorage
function savePreferences() {
    localStorage.setItem('userReplacement', userReplacement.value);
    localStorage.setItem('charReplacement', charReplacement.value);
}

// Load preferences from localStorage
function loadPreferences() {
    const savedUser = localStorage.getItem('userReplacement');
    const savedChar = localStorage.getItem('charReplacement');

    if (savedUser) userReplacement.value = savedUser;
    if (savedChar) charReplacement.value = savedChar;
}

// Save preferences when inputs change
userReplacement.addEventListener('change', savePreferences);
charReplacement.addEventListener('change', savePreferences);

// Load preferences on page load
loadPreferences();
