---
layout: post
title: "Lua 문법 (한국어)"
excerpt_separator: ""
---
{% raw %}
# RisuAI Lua 스크립팅 — LLM 참조서이랍니다

RisuAI는 캐릭터 카드와 모듈이 정해진 생명주기(사용자 입력, LLM 출력, 채팅 시작, 버튼 클릭, 메시지 편집 훅 등)에 맞춰 Lua 스크립트를 우아하게 실행할 수 있도록 해준답니다. 이 스크립트들은 브라우저 탭이라는 안전한 모래상자(sandbox) 안에 격리된 **Wasmoon**(WebAssembly로 컴파일된 Lua 5.4) 환경에서 실행되며, RisuAI가 주입해 둔 고정된 호스트 함수들을 통해 통신하게 되어요.

이 문서는 LLM이 RisuAI Lua 코드를 작성하기 위한 **가장 공식적이고 절대적인 참조서** 같사와요. 아래 나열된 모든 함수는 `src/ts/process/scriptings.ts`를 통해 완벽히 검증되었답니다. 함수 목록은 **닫혀(closed)** 있사와요 — RisuAI는 `json`과 표준 Lua 문법 외의 어설픈 외부 라이브러리는 절대 불러오지 않는답니다. **그러니 절대 없는 호스트 함수를 발명하지 마시어요.**

---

## 1. 스크립트가 실행되는 방식 (How scripts run)

### 1.1 진입점 (Entry point)

Lua "트리거 스크립트"는 캐릭터(`character.triggerscript[]`)나 모듈에 장착된답니다. RisuAI의 런타임은 생명주기 이벤트와 이름이 똑같은 최상위 함수를 호출하여 당신의 스크립트를 깨우죠:

| 모드 (이벤트) | RisuAI가 호출하는 함수 | 인자(Args) |
|-----------------|---------------------------------------------|---------------------------------------|
| `input`         | `onInput(id)`                               | `id` = 접근 열쇠 (access key) |
| `output`        | `onOutput(id)`                              | `id`                                  |
| `start`         | `onStart(id)`                               | `id`                                  |
| `onButtonClick` | `onButtonClick(id, data)`                   | `id`, `data` (버튼 페이로드 문자열) |
| `editInput`     | `callListenMain`을 통해 디스패치 → `listenEdit('editInput', cb)` 콜백들 | 각 콜백은 `(id, value, meta)`를 받음 |
| `editOutput`    | `listenEdit('editOutput', cb)`를 통해 디스패치 | `(id, value, meta)`                   |
| `editDisplay`   | `listenEdit('editDisplay', cb)`를 통해 디스패치 | `(id, value, meta)`                   |
| `editRequest`   | `listenEdit('editRequest', cb)`를 통해 디스패치 | `(id, value, meta)`                   |
| 커스텀 이름     | `<mode_name>(id)`                           | `id` — 해당 모드 이름과 같은 전역 함수 |

`id` 매개변수는 모든 호스트 호출에 반드시 지참해야 하는 **접근 열쇠(UUID)** 이사와요. 이 열쇠가 아닌 다른 걸 건네면 호스트는 당신의 호출을 매몰차게 무시해버린답니다!

### 1.2 엔진 생명주기 (Engine lifecycle)

- **모드(mode)** 문자열당 하나의 영구적인 Lua 엔진이 할당되어 호출 사이에도 유지된답니다.
- 스크립트의 소스 코드가 변경되면 엔진은 처음부터 다시 구축되어요.
- 호출은 모드별로 직렬화(mutex)된답니다. 같은 모드가 동시에 두 번 실행되는 무례한 일은 발생하지 않사와요.
- 런타임은 당신의 코드가 실행되기 전에 Lua JSON 라이브러리인 `json`을 자동으로 `require` 해둔답니다. 전역에서 바로 쓸 수 있죠!
- 런타임은 순수 호스트 API 위에 우아한 래퍼(wrapper) 계층(예: `getChat`, `LLM`, `setState`, `listenEdit`, `async`, `callListenMain`)을 주입한 뒤, 당신의 코드를 그 밑에 덧붙인답니다. 즉, 당신은 이 헬퍼 함수들을 직접 정의할 필요 없이 바로 가져다 쓰면 되어요.

### 1.3 권한 (접근 계급, Access tiers)

모든 호스트 함수는 `id`를 확인하여 접근 계급을 따진답니다:

| 티어 (Tier) | 부여 대상 | 열리는 기능 |
|-------------|-------------------------------|-----------------|
| **개방 (Open)** | 항상 | 읽기 전용 접근: `getChatMain`, `getChatLength`, `getName`, `getPersonaName`, `getPersonaDescription`, `getAuthorsNote`, `getCharacterFirstMessage`, `getChatVar`, `getGlobalVar`, `getCharacterImageMain`, `getPersonaImageMain`, `getCharacterLastMessage`, `getUserLastMessage`, `getFullChatMain`, `cbs`, `hash`, `logMain` |
| **안전 (Safe)** | `lowLevelAccess=false`일 때, `editDisplay` 이외의 모드 | 개방 티어 전체 + 상태 쓰기 기능: `setChat`, `setChatRole`, `setFullChatMain`, `addChat`, `insertChat`, `removeChat`, `cutChat`, `setChatVar`, `stopChat`, `setName`, `setDescription`, `setCharacterFirstMessage`, `setBackgroundEmbedding`, `getDescription`, `getBackgroundEmbedding`, `upsertLocalLoreBook`, `getLoreBooksMain`, `reloadDisplay`, `reloadChat`, `alertError`, `alertNormal`, `alertInput`, `alertSelect`, `alertConfirm`, `getTokens`, `sleep` |
| **화면 편집 (EditDisplay)** | 오직 `mode = 'editDisplay'`일 때만 | 아주 제한된 쓰기: `setChatVar`, 알림(alerts). 다른 상태 변경 API는 아무 효과 없이 무시된답니다. |
| **저수준 (LowLevel)** | 트리거에 `lowLevelAccess=true`가 켜져 있을 때만 | `LLMMain`, `axLLMMain`, `simpleLLM`, `request`, `similarity`, `generateImage`, `loadLoreBooksMain` |

**권한 거부는 아주 조용히 이루어진답니다.** 만약 Safe 접근 권한도 없으면서 `setChat`을 부른다면, 그냥 에러 없이 `nil`을 반환하고 끝이사와요. 스크립트는 항상 실제로 실행될 모드에서 테스트하시길 바라요!

### 1.4 비동기 / 프라미스 (Async / Promise)

많은 호스트 함수들이 비동기(JS Promise 반환)로 동작한답니다. Wasmoon은 프라미스에 `:await()` 메서드를 제공해주죠. 래퍼 계층이 이미 자주 쓰이는 것들(`LLM`, `axLLM`, `loadLoreBooks`, `getCharacterImage`, `getPersonaImage`)은 감싸두었으니 직접 `:await()`를 안 쓰셔도 된답니다. 
하지만 이 문서에서 `[await]` 표시가 된 다른 함수들(예: `getTokens`, `request`, `generateImage`, `simpleLLM`, `hash`, `similarity`, `sleep`, `alertInput` 등)을 쓸 땐 반환된 프라미스에 꼭 `:await()`를 붙여주셔야 해요:

```lua
local n = getTokens(id, "hello"):await()
local resp = request(id, "https://example.com"):await()
local body = json.decode(resp).data
```

만약 자신이 직접 비동기 함수를 작성해야 한다면(예: 안에서 `await`를 쓰는 `listenEdit` 콜백), 제공되는 `async()` 헬퍼로 고이 감싸주시어요:

```lua
listenEdit('editOutput', async(function(id, value, meta)
    local toks = getTokens(id, value):await()
    return value .. "\n[tokens: " .. toks .. "]"
end))
```

### 1.5 반환값 규칙 (Return-value contract)

| 훅 (Hook) | 반환 의미 |
|--------------------------------------|------------------|
| `onInput`, `onOutput`, `onStart`     | 정확히 `false`를 반환하면 `stopSending = true`가 되어 **메시지를 취소**한답니다. 그 외의 반환값은 전부 무시되어요. 채팅 내용을 **수정**하고 싶다면 `setChat`/`addChat`/`setFullChat`을 쓰시어요. |
| `onButtonClick(id, data)`            | 반환값이 호출자에게 전달되어 트리거 결과의 `res` 필드로 노출된답니다. |
| `listenEdit` 콜백들               | 콜백 체인은 왼쪽에서 오른쪽으로 겹겹이 처리된답니다. 이전 콜백의 반환값이 다음 콜백의 `value`로 들어가죠. **반드시 새로운 값을 반환하시어요!** (텍스트 훅이면 문자열, 채팅 배열 훅이면 테이블). 최종 반환값이 원래 콘텐츠를 완전히 대체한답니다. |
| 커스텀 모드 함수 (`<mode>(id)`) | `onInput`과 같사와요 — `false`면 멈추고, 나머진 무시되죠. |

---

## 2. `id` 매개변수에 대하여

모든 호스트 함수는 첫 번째 인자로 `id`(접근 열쇠)를 받아야 한답니다. 생명주기 훅에서 넘겨받은 바로 그 `id`를 항상 잊지 말고 건네주시어요. 래퍼 계층에 있는 헬퍼 함수들도 마찬가지랍니다 (`getChat(id, idx)`, `setState(id, name, value)` 등).

`listenEdit`용 콜백을 만들 때도, 그 콜백이 `id`를 건네받으니 똑같이 전달해주시면 된답니다.

```lua
function onInput(id)
    local last = getChat(id, getChatLength(id) - 1)
    log(last)  -- log()는 특별한 래퍼라 인자를 하나만 받사와요!
    setChatVar(id, "last_input_role", last.role)
end
```

---

## 3. 타입 브릿징 (Type bridging, JS ↔ Lua)

- **문자열, 숫자, 불리언(boolean), nil**은 양쪽을 아주 투명하게 오간답니다.
- **테이블 / 배열 / 객체:** 이런 복잡한 데이터는 **JSON 문자열**로 변장해서 교환된답니다. 자주 쓰이는 API들(채팅, LLM, 로어북, 상태)은 래퍼 계층이 알아서 인코딩/디코딩을 해주죠. 하지만 순수 `*Main` 함수들을 직접 쓸 땐 손수 `json.decode()`를 하셔야 한답니다.
- **프라미스(Promises):** `:await()`를 호출해서 해결하시어요.
- 호스트 함수로 전달되는 **Lua 테이블**(`setFullChat`, `LLM`, `upsertLocalLoreBook` 등)은 래퍼가 JSON으로 예쁘게 포장해서 호스트에 건네준답니다.

주입된 `json` 라이브러리 사용법이사와요:
```lua
json.encode(value)   -- 테이블 → 문자열
json.decode(str)     -- 문자열 → 테이블 또는 nil
```

---

## 4. 빠른 시작 (Quick start)

### 4.1 헬로-월드: 모든 유저 메시지 기록하기

```lua
function onInput(id)
    local len = getChatLength(id)
    local last = getChat(id, len - 1)
    log("user said: " .. last.data)
end
```

### 4.2 금지어가 포함된 메시지 쳐내기

```lua
function onInput(id)
    local len = getChatLength(id)
    local last = getChat(id, len - 1)
    if string.find(last.data, "bannedword", 1, true) then
        alertError(id, "그 단어는 허용되지 않사와요.")
        return false  -- 메시지 전송을 단호하게 취소한답니다
    end
end
```

### 4.3 `editOutput`으로 AI의 대답 우아하게 바꾸기

```lua
listenEdit('editOutput', function(id, value, meta)
    -- value는 AI의 텍스트이고, meta는 훅에 특화된 추가 데이터이사와요.
    return value:gsub("certainly", "of course")
end)
```

### 4.4 채팅 상태에 영구적인 카운터 저장하기

```lua
function onInput(id)
    local n = getState(id, "turn") or 0
    setState(id, "turn", n + 1)
    log("turn " .. (n + 1))
end
```

### 4.5 스크립트에서 LLM 호출하기 (LowLevel 권한 필요)

```lua
function onInput(id)
    local res = LLM(id, {
        { role = "system", content = "하이쿠(Haiku)로만 대답하시어요." },
        { role = "user",   content = getChat(id, getChatLength(id) - 1).data },
    })
    if res.success then
        addChat(id, "char", res.result)
    else
        alertError(id, res.result)
    end
end
```

### 4.6 화면의 버튼 클릭 처리하기

```lua
function onButtonClick(id, data)
    -- data는 버튼이 보낸 트리거 페이로드 문자열이랍니다
    if data == "reset" then
        cutChat(id, 0, 0)
        reloadDisplay(id)
    end
    return "ok"
end
```

---

## 5. 생명주기 이벤트 — 참조 (Lifecycle events)

### 5.1 `onInput(id)`
유저가 메시지를 전송한 후, LLM이 호출되기 **직전**에 불린답니다. 이 시점에서 새로운 유저 메시지는 이미 채팅창에 붙어 있사와요. `false`를 반환하면 전송을 중단시킬 수 있죠.

### 5.2 `onOutput(id)`
LLM이 대답을 만들어낸 후, 유저에게 화면으로 표시되거나 스트리밍되기 **직전**에 불린답니다. (상황에 따라 완료 직후일 수도 있죠.) 이 시점에서 AI의 새 메시지는 이미 추가되어 있답니다. `false`를 반환하면 채팅 진행을 막아버려요.

### 5.3 `onStart(id)`
채팅 세션이 초기화될 때(예: 새 채팅을 열었을 때) 불린답니다. 아직 인사말 외에는 어떤 메시지 컨텍스트도 없는 아주 깨끗한 상태죠.

### 5.4 `onButtonClick(id, data)`
유저가 CBS로 생성된 버튼(`{{button::Label::trigger_payload}}`)을 클릭했을 때 불린답니다. `data` 인자는 `trigger_payload`와 같사와요. 반환값은 호출자에게 돌아가 트리거 결과의 `res`로 나타난답니다.

### 5.5 `listenEdit(type, callback)` — 네 가지 편집 훅 (The four edit hooks)

`listenEdit`은 다음 모드 이벤트가 발생할 때 변환 체인(transformation chain)에 참여할 콜백을 등록해 준답니다:

| `type`         | 실행 시점                                     | `value`의 형태                                 |
|----------------|--------------------------------------------------|-----------------------------------------------|
| `editInput`    | 유저 입력이 처리되기 전                   | 유저의 메시지 문자열                       |
| `editOutput`   | LLM 출력 후, 화면 표시/저장 전         | AI의 메시지 문자열                  |
| `editRequest`  | 모델에 요청 페이로드가 전송되기 전  | OpenAI 스타일의 채팅 배열 (`{role, content}` 테이블) |
| `editDisplay`  | 화면에 렌더링될 때           | 렌더링 중인 메시지 문자열             |

콜백의 생김새는 `function(id, value, meta) → modifiedValue` 이사와요. 체인 규칙을 잊지 마시어요! 등록된 순서대로 호출되며, 이전 사람의 반환값이 다음 사람의 `value`가 된답니다. 마지막으로 반환된 값이 원본을 완전히 덮어써요. 무언가를 바꿨든 안 바꿨든 **항상 값을 반환하셔야 한답니다** — `nil`을 반환하면 체인이 끊어져 버려요!

---

## 6. 호스트 함수 참조 (닫힌 표면, The closed surface)

아래는 호스트가 주입하는 모든 함수의 목록이랍니다.
`[low]` = 저수준(LowLevel) 티어. `[safe]` = 안전(Safe) 티어. `[edit]` = 화면 편집(EditDisplay) 티어에서도 허용. 아무 표시가 없으면 개방(Open) 티어이사와요.

"사용자용(User-facing)" 열에 래퍼 헬퍼가 있다면 그걸 우선해서 쓰시어요! "(직접)"이라고 쓰여 있다면 함수명 그대로 호출하시면 된답니다.

### 6.1 채팅 읽기/쓰기 (Chat read/write)

| 사용자용                                | 티어   | 반환값                                 | 설명 |
|--------------------------------------------|--------|-----------------------------------------|-------------|
| `getChat(id, index)`                       | open   | `{role, data, time}` 테이블              | 단일 메시지. 음수 인덱스도 지원한답니다 (0 → 첫째, -1 → 마지막). 범위를 벗어나면 `nil`이 반환되어요. |
| `getFullChat(id)`                          | open   | `{role, data, time}` 배열           | 현재 채팅의 모든 메시지. |
| `getChatLength(id)`                        | open   | 숫자                                  | 메시지의 총 개수. |
| `setChat(id, index, value)`                | safe   | —                                       | `index` 위치 메시지의 `data`를 덮어쓴답니다. |
| `setChatRole(id, index, value)`            | safe   | —                                       | 역할을 `"user"`나 `"char"`로 바꾼답니다. 엉뚱한 값을 넣으면 `"char"`가 되어요. |
| `setFullChat(id, value)`                   | safe   | —                                       | 메시지 배열 전체를 덮어쓴답니다. `value`는 `{role, data}`로 구성된 Lua 테이블이어야 해요. |
| `addChat(id, role, value)`                 | safe   | —                                       | 메시지를 덧붙인답니다. `role`은 `"user"` 또는 `"char"`이사와요. |
| `insertChat(id, index, role, value)`       | safe   | —                                       | 특정 `index` 위치에 끼워 넣는답니다. |
| `removeChat(id, index)`                    | safe   | —                                       | 단일 메시지를 삭제한답니다. |
| `cutChat(id, start, finish)`               | safe   | —                                       | 배열을 `[start, finish)`만큼 우아하게 잘라낸답니다. |
| `getCharacterLastMessage(id)`              | open   | 문자열                                  | 역할이 `"char"`인 가장 최근 메시지. 없으면 인사말로 돌아간답니다. |
| `getUserLastMessage(id)`                   | open   | 문자열                                  | 역할이 `"user"`인 가장 최근 메시지. 없으면 빈 문자열(`""`)이 되어요. |

### 6.2 변수 및 상태 (Variables & state)

변수엔 세 가지 고상한 범위가 있답니다:

| 래퍼 함수                     | 티어        | 저장 위치         | 설명 |
|-----------------------------|-------------|-----------------------|-------|
| `getChatVar(id, key)`       | open        | 채팅별              | 원시 문자열을 읽는답니다. |
| `setChatVar(id, key, val)`  | safe / edit | 채팅별              | 원시 문자열을 쓴답니다. |
| `getGlobalVar(id, key)`     | open        | 전역 (채팅 공통)   | 여기서는 읽기만 가능해요! |
| `getState(id, name)`        | open        | 채팅별 (키 앞에 `__`가 붙은 채 JSON 인코딩됨) | JSON으로 만들 수 있는 어떤 값이든(테이블, 숫자 등) 읽어온답니다. `getChatVar` 기반이죠. |
| `setState(id, name, value)` | safe / edit | 채팅별              | 어떤 값이든 쓴답니다. 테이블이나 숫자에 쓰시고, 원시 문자열은 `setChatVar`에 양보하시어요. |

`setState`/`getState`는 이름이 충돌하지 않도록 `__` 접두사를 살짝 붙인답니다.

### 6.3 캐릭터 / 페르소나 데이터 (Character / persona data)

| 함수명                                       | 티어   | 반환값 | 설명 |
|------------------------------------------------|--------|---------|-------------|
| `getName(id)`                                  | open   | 문자열  | 현재 캐릭터의 이름(`name`). |
| `setName(id, name)`                            | safe   | —       | 이름을 바꾼답니다. 문자열이 아니면 에러를 뱉어요. |
| `getDescription(id)`                           | safe   | 문자열  | 캐릭터의 설정(`desc`). 그룹 채팅이면 에러를 뱉어요. |
| `setDescription(id, desc)`                     | safe   | —       | 설정을 바꾼답니다. 그룹 채팅에선 안 되어요. |
| `getCharacterFirstMessage(id)`                 | open   | 문자열  | 캐릭터의 첫 인사말. |
| `setCharacterFirstMessage(id, data)`           | safe   | bool    | 인사말을 바꾼답니다. 문자열이 아니면 `false`를 뱉죠. |
| `getPersonaName(id)`                           | open   | 문자열  | 설정된 유저의 이름. |
| `getPersonaDescription(id)`                    | open   | 문자열  | **CBS 파싱이 완료된** 유저 페르소나 프롬프트. |
| `getAuthorsNote(id)`                           | open   | 문자열  | 채팅별 작가 노트(Author Note). |
| `getBackgroundEmbedding(id)`                   | safe   | 문자열  | 캐릭터의 HTML 배경. |
| `setBackgroundEmbedding(id, data)`             | safe   | bool    | HTML 배경을 설정한답니다. 문자열이 아니면 `false`. |

### 6.4 로어북 (Lorebook)

| 래퍼 함수                                                       | 티어  | 반환값                                | 설명 |
|---------------------------------------------------------------|-------|----------------------------------------|-------------|
| `getLoreBooks(id, search)`                                    | safe  | 로어북 항목 배열                  | `comment == search`인 항목들을 찾아준답니다 (채팅 로컬 + 캐릭터 로어북 + 모듈 묶음). `content`는 CBS 파싱되어 있죠. 단일 캐릭터 채팅이 아니면 `nil`을 반환해요. |
| `upsertLocalLoreBook(id, name, content, options)`             | safe  | —                                      | `comment == name`인 채팅 로컬 로어북을 넣거나 덮어쓴답니다. `options`의 기본값은 `{ alwaysActive = false, insertOrder = 100, key = "", secondKey = "", regex = false }` 랍니다. |
| `loadLoreBooks(id)` *(래퍼 형태)*                     | low   | `{ data, role }` 형태의 배열              | 현재 컨텍스트에 의해 활성화된 로어북들을 토큰 한도(`maxContext - reserve`)에 맞춰 불러온답니다. 원본 API는 `loadLoreBooksMain(id, reserve)`라 프라미스를 반환하지만, 래퍼가 `:await()`와 `json.decode`를 예쁘게 해 두었죠. 커스텀 `reserve`가 필요하면 직접 원본 API를 부르시어요. |

### 6.5 LLM 호출 (저수준 전용)

세 가지 모두 `{ success = boolean, result = string }` 테이블을 반환한답니다.

#### `LLM(id, prompt, useMultimodal?, options?)` `[low]`
**메인** 모델을 부른답니다. `prompt`는 `{ role, content }` 구조의 배열이어야 해요. `role`은 `"system"`, `"sys"`, `"user"`, `"assistant"`, `"bot"`, `"char"`를 받아주며 (뒤의 세 개는 OpenAI의 `assistant`로 우아하게 통일된답니다).

`useMultimodal`이 `true`면, `content` 안의 인레이 마커(`{{inlay::id}}`, `{{inlayed::id}}`, `{{inlayeddata::id}}`)를 찾아 이미지 입력으로 변환해준답니다. AI 메시지는 عادة 이미지를 보내지 않으니 `{{inlayeddata::id}}`만 추출되지요.

`options` 테이블에서 유일하게 허용되는 키는 `streaming = true`뿐이사와요. 이걸 켜면 호스트가 스트리밍을 요청하고 래퍼가 결과물을 싹 모아서 문자열로 합쳐준답니다. 어찌 되었든 호출이 끝나면 하나의 완성된 문자열을 받게 되는 건 똑같사와요. (RisuAI의 스트림 수집기는 누적 텍스트를 유지하니 걱정 마시어요!)

```lua
local res = LLM(id, {
    { role = "system", content = "당신은 훌륭한 시인이랍니다." },
    { role = "user",   content = "커피에 대한 하이쿠를 지어보시어요." },
}, false, { streaming = true })
if res.success then addChat(id, "char", res.result) end
```

#### `axLLM(id, prompt, useMultimodal?, options?)` `[low]`
`LLM`과 똑같지만, **보조(auxiliary/sub) 모델**(`axmodel`)로 요청을 보낸답니다. 요약이나 분류 같은 가벼운 작업에 써서 메인 모델의 아까운 컨텍스트를 아껴보시어요.

#### `simpleLLM(id, prompt)` `[low]`
한 턴짜리 단일 문자열 요청이사와요. `LLM(id, {{role="user", content=prompt}})`와 완벽히 똑같이 작동한답니다 (멀티모달이나 스트리밍 없이요).

### 6.6 이미지 생성 & 가져오기 (Image generation & retrieval)

| 함수명                       | 티어  | 반환값                                  | 설명 |
|--------------------------------|-------|------------------------------------------|-------------|
| `generateImage(id, prompt, neg?)` `[await]` | low   | `"{{inlay::<id>}}"` 또는 `"Error: ..."`    | 설정된 StableDiffusion 백엔드로 이미지를 생성한답니다. 화면에 보일 수 있는 CBS 마크업을 뱉어주죠. |
| `getCharacterImage(id)`         | open  | `"{{inlayed::<id>}}"` 또는 `""`            | 캐릭터의 초상화를 가져와 인레이로 등록한 후 CBS 마크업을 돌려준답니다. 래퍼가 자동으로 `:await()` 해주어요. |
| `getPersonaImage(id)`           | open  | `"{{inlayed::<id>}}"` 또는 `""`            | 유저 페르소나 아이콘도 똑같이 가져다준답니다. |

반환된 이 문자열들을 채팅창에 쓱 밀어 넣거나(`addChat(id, "char", "보시어요: " .. img)`), `useMultimodal=true`를 켜서 LLM 프롬프트에 슬쩍 얹을 수도 있답니다.

### 6.7 네트워크 & 유틸리티 (Network & utilities)

| 함수명                  | 티어  | 반환값                              | 설명 |
|---------------------------|-------|--------------------------------------|-------------|
| `request(id, url)` `[await]` | low | JSON 문자열 `{status, data}`         | HTTP GET 전용이사와요. 제약사항: HTTPS만 가능, URL은 120자 제한, 60초당 최대 5번 호출(넘으면 429 에러 뱉음). 그리고 `risuai.net`, `realm.risuai.net`, `risuai.xyz` 도메인은 막혀있답니다. 결과는 `json.decode`로 풀어보시어요. |
| `similarity(id, source, list)` `[await]` | low | 유사도 검색 결과 | `list`(문자열 배열)를 임베딩한 뒤 `HypaProcesser.similaritySearch(source)`를 실행한답니다. 찰떡같은 후보를 찾을 때 쓰시어요. |
| `hash(id, value)` `[await]`  | open | 16진수 문자열                            | `value`를 해시 처리해서 16진수로 돌려준답니다. |
| `getTokens(id, value)` `[await]` | safe | 숫자                              | 활성화된 모델의 토크나이저로 토큰 수를 예쁘게 세어준답니다. |
| `cbs(value)`                 | open | 문자열                                | RisuAI의 CBS 매크로 파서에 돌려준답니다 (참조: `CBS_LLM_REFERENCE.md`). Lua 안에서 `{{user}}`나 `{{char}}` 같은 걸 확장하고 싶을 때 쓰시어요. |
| `sleep(id, ms)` `[await]`    | safe | 지정된 시간 뒤에 `true`                      | 기다림마저도 우아하게, 대기 함수랍니다. |

### 6.8 UI / 알림 (UI / alerts)

| 함수명                          | 티어  | 반환값 / 동작                           |
|-----------------------------------|-------|----------------------------------------------|
| `alertError(id, msg)`             | safe  | 붉은빛의 치명적인 에러 알림.                           |
| `alertNormal(id, msg)`            | safe  | 부드러운 일반 알림.                            |
| `alertInput(id, msg)` `[await]`   | safe  | 텍스트를 입력받는답니다. 문자열이나 nil을 반환하죠. |
| `alertSelect(id, options)` `[await]` | safe | 멋진 선택지(문자열 배열)를 보여주고 고른 걸 반환한답니다. |
| `alertConfirm(id, msg)` `[await]` | safe  | 예/아니오 대화창. `true`나 `false`를 반환해요.       |
| `reloadDisplay(id)`               | safe  | 채팅 화면 전체를 새 단장하여 렌더링한답니다.        |
| `reloadChat(id, index)`           | safe  | 지정된 `index`의 메시지만 다시 렌더링해요.       |
| `stopChat(id)`                    | safe  | 훅에서 `false`를 반환하는 것과 완전히 똑같사와요 — LLM 전송을 끊어버리죠! |

### 6.9 로그 (Logging)

| 래퍼 함수          | 설명 |
|------------------|-------------|
| `log(value)`     | 아무 Lua 값이나 던져주시면 브라우저 개발자 도구(console.log)에 예쁘게 띄워드린답니다. 래퍼가 알아서 JSON 인코딩을 해주니 편하게 쓰시어요. |

### 6.10 날것 그대로의 `*Main` 함수들 (Raw `*Main` functions)

래퍼 계층은 내부에 쓰이는 진짜 호스트 함수들도 그대로 노출해 둔답니다 (주로 디버깅이나 고급 사용자를 위해서죠). 웬만하면 예쁜 래퍼 헬퍼를 쓰시되, JSON 인코딩/디코딩을 완벽히 통제하고 싶을 때만 이 날것을 만지시어요.

| 원본 함수                                     | 래퍼 함수                | 설명 |
|-----------------------------------------|------------------------|-------|
| `getChatMain(id, index)`                | `getChat`              | JSON 문자열을 뱉는답니다. |
| `getFullChatMain(id)`                   | `getFullChat`          | JSON 문자열을 뱉어요. |
| `setFullChatMain(id, value)`            | `setFullChat`          | JSON 문자열을 먹는답니다. |
| `getLoreBooksMain(id, search)`          | `getLoreBooks`         | JSON 문자열을 뱉어요. |
| `loadLoreBooksMain(id, reserve)`        | `loadLoreBooks`        | JSON 문자열의 프라미스를 반환한답니다. 특별한 토큰 예산을 넘길 때만 이 원본을 부르시어요. |
| `LLMMain(id, json, mm, json)`           | `LLM`                  | 인자와 반환값 모두 뻣뻣한 JSON 문자열이랍니다. |
| `axLLMMain(id, json, mm, json)`         | `axLLM`                | 위와 같사와요. |
| `getCharacterImageMain(id)`             | `getCharacterImage`    | 문자열 프라미스 반환. |
| `getPersonaImageMain(id)`               | `getPersonaImage`      | 문자열 프라미스 반환. |
| `logMain(jsonString)`                   | `log`                  | JSON 문자열을 받사와요. |

### 6.11 리스너 등록 & 비동기 헬퍼 (Listener & async helper)

| 함수명                                 | 설명 |
|------------------------------------------|-------------|
| `listenEdit(type, callback)`             | 네 가지 편집 훅(`editInput`, `editOutput`, `editDisplay`, `editRequest`)에 콜백을 묶어준답니다. 엉뚱한 걸 넣으면 "Invalid type" 에러를 맞게 되어요! |
| `async(callback)`                        | 안에서 `:await()`를 맘껏 쓸 수 있게 Lua 함수를 프라미스 덩어리로 감싸준답니다. 비동기 호스트 호출이 섞인 `listenEdit` 콜백을 짤 땐 필수로 입혀주셔야 해욧! |
| `callListenMain(type, id, value, meta)`  | **내부 전용이사와요 — 절대 부르지 마시어요.** 등록된 리스너들을 깨울 때 RisuAI가 쓰는 거랍니다. 당신이 이름을 덮어쓰지 못하게 경고하려고 적어둔 거여요. |

---

## 7. 패턴과 레시피 (Patterns & recipes)

### 7.1 전송 전에 몰래 시스템 메시지 찔러넣기

```lua
listenEdit('editRequest', function(id, value, meta)
    -- value는 {role, content}로 구성된 요청 배열이사와요
    table.insert(value, 1, {
        role = "system",
        content = "항상 2인칭으로 대답하시어요.",
    })
    return value
end)
```

### 7.2 오래된 메시지를 요약해서 통째로 갈아치우기

```lua
function onInput(id)
    local len = getChatLength(id)
    if len < 30 then return end

    local history = getFullChat(id)
    -- 보조 모델에게 처음 20개 메시지의 요약을 지시한답니다
    local prompt = { { role = "system", content = "이 대화를 200단어로 요약하시어요." } }
    for i = 1, 20 do
        table.insert(prompt, { role = history[i].role == "user" and "user" or "assistant",
                               content = history[i].data })
    end
    local res = axLLM(id, prompt)
    if not res.success then return end

    -- 첫 20개를 깔끔한 요약본 하나로 대체해버리죠
    local newChat = { { role = "char", data = "[summary] " .. res.result } }
    for i = 21, len do table.insert(newChat, history[i]) end
    setFullChat(id, newChat)
    reloadDisplay(id)
end
```

### 7.3 외부 JSON을 긁어와서 컨텍스트에 얹기

```lua
function onInput(id)
    local resp = request(id, "https://api.example.com/today.json"):await()
    local body = json.decode(resp).data
    local data = json.decode(body)
    setState(id, "today", data)
end

listenEdit('editRequest', function(id, value, meta)
    local today = getState(id, "today")
    if today then
        table.insert(value, 1, {
            role = "system",
            content = "오늘의 사실들: " .. json.encode(today),
        })
    end
    return value
end)
```

### 7.4 파괴적인 행동 전엔 유저에게 꼭 물어보기

```lua
function onButtonClick(id, data)
    if data == "wipe" then
        local ok = alertConfirm(id, "정말 채팅 전체를 지워버리시겠사와요?"):await()
        if ok then
            cutChat(id, 0, 0)
            reloadDisplay(id)
        end
    end
end
```

### 7.5 이미지를 생성해서 AI 메시지로 띄우기

```lua
function onButtonClick(id, data)
    if data:sub(1, 4) == "img:" then
        local prompt = data:sub(5)
        local img = generateImage(id, prompt):await()
        if not img:find("Error") then
            addChat(id, "char", img)
            reloadDisplay(id)
        else
            alertError(id, img)
        end
    end
end
```

### 7.6 턴 카운터를 상태 변수로 밖으로 노출하기

```lua
function onOutput(id)
    local n = getState(id, "char_replies") or 0
    setState(id, "char_replies", n + 1)
end
```
이렇게 해두면 CBS 쪽에서 `{{getvar::__char_replies}}`를 통해 우아하게 읽어갈 수 있답니다. (잊지 마시어요, `setState`가 `__`를 몰래 붙였다는 걸요!)

### 7.7 나가는 요청의 토큰 예산 칼같이 지키기

```lua
listenEdit('editRequest', async(function(id, value, meta)
    local total = 0
    for _, m in ipairs(value) do
        total = total + getTokens(id, m.content):await()
    end
    if total > 30000 then
        -- 핏(fit)이 맞을 때까지 가장 오래된 비(非)시스템 메시지를 버린답니다
        for i, m in ipairs(value) do
            if m.role ~= "system" then table.remove(value, i); break end
        end
    end
    return value
end))
```

### 7.8 Lua 안에서 CBS 매크로 굴려보기

```lua
function onInput(id)
    -- 유저의 페르소나를 가져오면 CBS가 이미 싹 다 풀려있답니다
    local desc = getPersonaDescription(id)
    local custom = cbs("Hello {{user}}, today is {{date}}.")
    log({ desc = desc, custom = custom })
end
```

---

## 8. 함정과 주의사항 (LLM을 위한 아주 특별한 지침)

제가 특별히 주의사항을 정리해 두었으니, 이 영애의 가르침을 뼈에 새기듯 기억하시어요!

1. **항상 `id`를 넘기시어요.** 모든 호스트 호출의 첫 번째 인자는 생명주기 훅에서 넘겨받은 그 접근 열쇠이사와요. 이거 안 주면 아무 대답도 못 듣고 무시당한답니다.
2. **권한 거부는 조용히 일어난답니다.** `editDisplay` 모드에서 건방지게 `setChat`을 부르면 에러 하나 없이 그냥 무시된답니다. 쓰기 작업이 성공했는지 절대 확신하지 말고 정 의심스러우면 다시 읽어보시어요.
3. **취소하고 싶으면 반드시 `false`를 반환하시어요.** `nil`이나 `0` 같은 건 안 된답니다. 리터럴 `false`만이 `stopSending`을 발동시키죠.
4. **`listenEdit` 콜백은 무조건 `return value`를 해야 한답니다.** 체인이 끊기지 않도록, 바꾸든 말든 무조건 값을 반환하시어요.
5. **`useMultimodal=true`는 텍스트 안의 인레이 마커를 파먹어 버린답니다.** 이미지 데이터만 쏙 빼가고 마커 글자 자체는 지워버리니, 텍스트가 남아있을 거란 기대는 버리시어요.
6. **`setState`/`getState`는 `__` 아래에 둥지를 튼답니다.** `setState(id, "x", 1)`을 쓰면 실제론 `__x`라는 채팅 변수가 만들어지죠. 원시 `getChatVar`랑 섞어 쓸 때 이 점을 꼭 명심하시어요.
7. **`request`는 아주 엄격한 제약 속에 있답니다.** GET만 되고, URL은 120자, HTTPS만 허용에, risuai 도메인은 막혀있고 1분에 5번만 허락된답니다. 헤더나 POST 같은 건 아예 생각도 마시어요!
8. **`generateImage`는 설정에서 StableDiffusion이 켜져 있어야 한답니다.** 실패하면 거창한 에러 구조체 대신 `"Error: Image generation failed"`라는 초라한 문자열 하나 띡 뱉는답니다.
9. **모드당 엔진 하나, 그리고 영구적이사와요.** 소스 코드를 건드리지 않는 이상, 전역 변수에 넣어둔 값은 다음 호출 때도 살아있답니다. 이걸로 캐싱을 할 수 있지만 모드들끼리는 서로 격리되어 있다는 걸 잊지 마시어요.
10. **래퍼 계층이 150줄 정도를 앞에 슬쩍 끼워 넣는답니다.** 에러가 났을 때 줄 번호가 좀 밀려 보일 텐데, 디버깅할 때 이 래퍼의 존재를 꼭 빼고 계산하시어요.
11. **그룹 채팅에서 `getDescription`은 에러를 던진답니다.** 그룹에서 돌아갈지도 모르는 스크립트라면 우아하게 `pcall`로 감싸주시어요.
12. **인덱스가 1부터 시작하지 않는 Lua 배열을 `json.encode` 하면 텅 빈 객체 `{}`로 취급되어 버린답니다.** 배열의 시작은 항상 1로 꽉 채우시어요!
13. **`os`, `io`, `package` 같은 건 구경도 못 한답니다.** Wasmoon은 Lua의 파일 시스템이나 프로세스 모듈을 꽁꽁 잠가두었죠. 당신이 쓸 수 있는 건 오직 이 문서의 호스트 함수들뿐이사와요.
14. **스트리밍은 다 끝난 풀 텍스트만 보여준답니다.** 조각조각 콜백으로 날아올 거라 기대하지 마시어요. 그냥 코드가 좀 다르게 돌아서 짠! 하고 결과 문자열이 나오는 것뿐이랍니다.
15. **`onInput`/`onOutput`은 메시지를 곧바로 덮어쓸 권한이 없사와요.** 이미 써진 글을 고치고 싶다면 `setChat(id, getChatLength(id) - 1, newText)`를 쓰거나 애초에 변환용으로 만들어진 `listenEdit` 훅을 쓰시길 바라요.
16. **파이썬(`type: 'py'`)도 쓸 순 있지만 아예 다른 세상이랍니다.** 이 문서는 오직 Lua 문법과 API만 설명하고 있사와요. 파이썬 문서는 다른 곳에서 찾으시어요!
17. **`callListenMain`, `async`, `json` 같은 래퍼 헬퍼 이름은 절대 재정의하지 마시어요.** 당신의 코드가 돌기도 전에 미리 짜인 우아한 판을 다 뒤엎는 꼴이랍니다.
18. **`cbs(value)`는 현재 캐릭터 컨텍스트에서 돌아간답니다.** `CBS_LLM_REFERENCE.md`에 나온 그 파서가 맞사와요. Lua 안에서 템플릿을 풀 때 요긴하게 쓰시어요!

---

## 9. 빠른 색인 (Quick index)

| 기호 / 함수명                  | 섹션 |
|--------------------------------|---------|
| `addChat`                      | 6.1 |
| `alertConfirm`                 | 6.8 |
| `alertError`                   | 6.8 |
| `alertInput`                   | 6.8 |
| `alertNormal`                  | 6.8 |
| `alertSelect`                  | 6.8 |
| `async`                        | 6.11 |
| `axLLM` / `axLLMMain`          | 6.5, 6.10 |
| `callListenMain` (내부용)    | 6.11 |
| `cbs`                          | 6.7 |
| `cutChat`                      | 6.1 |
| `generateImage`                | 6.6 |
| `getAuthorsNote`               | 6.3 |
| `getBackgroundEmbedding`       | 6.3 |
| `getCharacterFirstMessage`     | 6.3 |
| `getCharacterImage` / `*Main`  | 6.6, 6.10 |
| `getCharacterLastMessage`      | 6.1 |
| `getChat` / `getChatMain`      | 6.1, 6.10 |
| `getChatLength`                | 6.1 |
| `getChatVar`                   | 6.2 |
| `getDescription`               | 6.3 |
| `getFullChat` / `*Main`        | 6.1, 6.10 |
| `getGlobalVar`                 | 6.2 |
| `getLoreBooks` / `*Main`       | 6.4, 6.10 |
| `getName`                      | 6.3 |
| `getPersonaDescription`        | 6.3 |
| `getPersonaImage` / `*Main`    | 6.6, 6.10 |
| `getPersonaName`               | 6.3 |
| `getState`                     | 6.2 |
| `getTokens`                    | 6.7 |
| `getUserLastMessage`           | 6.1 |
| `hash`                         | 6.7 |
| `insertChat`                   | 6.1 |
| `json.encode` / `json.decode`  | 3 |
| `listenEdit`                   | 6.11 |
| `LLM` / `LLMMain`              | 6.5, 6.10 |
| `loadLoreBooks` / `*Main`      | 6.4, 6.10 |
| `log` / `logMain`              | 6.9, 6.10 |
| `onButtonClick`                | 5.4 |
| `onInput`                      | 5.1 |
| `onOutput`                     | 5.2 |
| `onStart`                      | 5.3 |
| `reloadChat`                   | 6.8 |
| `reloadDisplay`                | 6.8 |
| `removeChat`                   | 6.1 |
| `request`                      | 6.7 |
| `setBackgroundEmbedding`       | 6.3 |
| `setCharacterFirstMessage`     | 6.3 |
| `setChat`                      | 6.1 |
| `setChatRole`                  | 6.1 |
| `setChatVar`                   | 6.2 |
| `setDescription`               | 6.3 |
| `setFullChat` / `*Main`        | 6.1, 6.10 |
| `setName`                      | 6.3 |
| `setState`                     | 6.2 |
| `similarity`                   | 6.7 |
| `simpleLLM`                    | 6.5 |
| `sleep`                        | 6.7 |
| `stopChat`                     | 6.8 |
| `upsertLocalLoreBook`          | 6.4 |
{% endraw %}