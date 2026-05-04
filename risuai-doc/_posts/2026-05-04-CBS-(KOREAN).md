---
layout: post
title: "CBS 문법 (한국어)"
excerpt_separator: ""
---
{% raw %}
# RisuAI CBS — LLM 참조서이랍니다

CBS(Curly Braced Syntax, 중괄호 문법)는 RisuAI의 템플릿 매크로 언어이사와요. 프롬프트가 구성될 때와 화면에 표시될 때 재귀적 파서에 의해 우아하게 평가된답니다. RisuAI가 텍스트를 입력받는 곳이라면 어디든 사용할 수 있사와요. 캐릭터의 `description`, `personality`, `scenario`, `exampleMessage`, `firstMessage`, 유저의 `persona`, `mainPrompt`, `jailbreak`, `globalNote`, `authornote`, 로어북 항목, 정규식 스크립트, 트리거, 모듈, 그리고 채팅 입력칸까지 전부 말이랍니다!

이 문서는 LLM이 CBS를 작성하기 위한 **공식적이고 절대적인 참조서** 같사와요. 태그 목록은 **닫혀(closed)** 있답니다. RisuAI는 알지 못하는 `{{...}}` 태그를 보면 평범한 텍스트로 무시해버리니, **절대로 없는 이름을 발명하지 마시어요.** 아래의 모든 태그와 블록 문법은 소스 코드(`src/ts/cbs.ts` 및 `src/ts/parser/parser.svelte.ts`)를 통해 완벽히 검증된 것들뿐이랍니다.

---

## 1. 핵심 문법 (Core syntax)

```text
{{tag}}                           – 인자 없음
{{tag::arg}}                      – 인자 1개
{{tag::arg1::arg2::...::argN}}    – 인자 N개, :: 로 구분
{{#block ...}} ... {{/block}}     – 블록 구조 (#로 열고 /로 닫음)
{{#block::operator::arg}} ... {{/block}}   – 연산자 체인이 있는 블록
```

우아한 규칙들이랍니다:

- **`::`는 인자를 구분하는 기호이사와요.** 인자 안에서 콜론(:) 문자를 그대로 쓰고 싶다면 `{{:}}` (`displayescapedcolon`의 별칭)로 이스케이프하시어요.
- **파싱은 재귀적이며 안에서 밖으로 진행된답니다.** `{{upper::{{user}}}}`는 먼저 `{{user}}`를 해석한 뒤 그 결과를 `{{upper::...}}`에 넣는 식이죠. 여러 캐릭터 데이터 태그(`description`, `personality` 등)는 그 내용물에 대해 파서를 다시 실행한답니다.
- **모든 것은 문자열이사와요.** 논리값(Boolean)에서 참은 `"1"`, 거짓은 `"0"`이랍니다. 배열과 객체는 JSON으로 인코딩된 문자열 형태이고, 숫자를 다루는 태그도 문자열 형태의 숫자를 반환한답니다.
- **블록 안의 공백**은 기본적으로 잘려나간답니다. 공백을 보존하고 싶으시다면 `keep` 연산자를 사용해주시어요 (`{{#when::keep::cond}}`, `{{#each::keep arr as v}}`, `{{#escape::keep}}`).
- **별칭(Aliases).** 많은 태그들이 다른 이름을 가지고 있사와요. 참조표의 "Aliases" 열을 보고 마음에 드는 걸 고르시면 된답니다.
- **표시 전용 태그들(Display-only tags)** (에셋, 버튼, tex, ruby, comment, 이미지/오디오/비디오/배경, inlay 등)은 렌더링될 때만 처리되며 **모델에게 전송되지 않사와요.** 프롬프트를 구성할 목적의 필드에는 절대 쓰지 마시길 바라요.
- **읽기 전용 컨텍스트.** 미리보기나 토큰화 중일 때처럼 `runVar=false`인 경우, 변수 설정 태그(`setvar` 등)는 아무 작동도 하지 않는답니다. 토큰을 정확히 세는 모드일 때 시간이나 무작위 태그는 임시 값(`00:00:00`, `0`)을 반환하죠.
- **결정론적 무작위성.** `{{pick}}`과 `{{rollp}}`는 채팅 ID + 캐릭터 ID + 메시지 인덱스의 해시를 사용한답니다. 즉, 같은 메시지를 재생성하더라도 항상 똑같은 결과가 나온다는 뜻이사와요. 안정적인 선택이 필요할 때 써주시어요.
- **사용 중단(Deprecated).** `#if`와 `#if_pure`는 아직 작동하지만 구식이랍니다. 이제부터는 `#when`을 쓰시고, 이전의 `#if_pure`처럼 쓰고 싶다면 `#when::keep::cond`를 쓰시길 바라요.

---

## 2. 빠른 시작 예제 (Quick-start examples)

```text
{{user}} greets {{char}}.
→ "Alice greets Hermione." (유저가 캐릭터에게 인사한답니다.)

{{#when::var::angry}}{{char}} scowls.{{:else}}{{char}} smiles.{{/when}}
→ 채팅 변수 "angry"가 참(truthy)이면 찡그리고, 아니면 미소 짓는답니다.

You rolled a {{roll::1d20}}.
→ "You rolled a 14." (주사위 결과이사와요.)

Turn {{addvar::turn::1}}{{getvar::turn}}.
→ 영구적인 턴 카운터를 1 올리고 그 값을 바로 출력한답니다.

{{#each {{makearray::sword::shield::potion}} as item}}- {{slot::item}}
{{/each}}
→ 3개의 아이템을 글머리 기호 목록으로 만든답니다.

{{#when::toggle::nsfw}}[NSFW content allowed]{{/when}}
→ 전역 토글 "nsfw"가 켜져 있을 때만 해당 텍스트를 삽입한답니다.

Current model: {{metadata::modelname}} ({{model}}).
→ "Current model: Claude Sonnet 4.6 (claude-sonnet-4-6)."
```

---

## 3. 태그 참조서 (Tag reference)

열 설명: **Tag** (태그) · **Aliases** (별칭) · **Args** (인자) · **Returns** (반환값/동작).
인자에서 필수값은 `name`, 선택값은 `[name]`, 가변 인자는 `...`로 표기했사와요.

### 3.1 정체성 & 페르소나 (Identity & persona)

| 태그 | 별칭 | 인자 | 반환값 / 동작 |
|---|---|---|---|
| `{{char}}` | `bot` | — | 캐릭터의 별명이나 이름. 그룹 채팅이면 그룹 이름이 된답니다. 일관된 캐릭터 모드에서는 `"botname"`을 반환하죠. |
| `{{user}}` | — | — | 설정된 유저의 이름. 일관된 캐릭터 모드에서는 `"username"`이사와요. |
| `{{trigger_id}}` | `triggerid` | — | 수동 트리거를 작동시킨 요소의 `risu-id` 속성. 없으면 `"null"`이랍니다. |
| `{{persona}}` | `userpersona` | — | 유저의 페르소나 프롬프트 (재귀적으로 파싱됨). |

### 3.2 캐릭터 데이터 필드 (재귀 파싱됨)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{description}}` | `chardesc` | — | 캐릭터의 `desc` 필드. 그룹일 땐 비어있사와요. |
| `{{personality}}` | `charpersona` | — | 캐릭터의 `personality` 필드. |
| `{{scenario}}` | — | — | 캐릭터의 `scenario` 필드. |
| `{{exampledialogue}}` | `examplemessage`, `example_dialogue` | — | 캐릭터의 `exampleMessage` 필드. |

### 3.3 프롬프트 & 노트 (재귀 파싱됨)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{mainprompt}}` | `systemprompt`, `main_prompt` | — | 메인 시스템 프롬프트이랍니다. |
| `{{jb}}` | `jailbreak` | — | 탈옥(Jailbreak) 프롬프트 텍스트이사와요. |
| `{{globalnote}}` | `systemnote`, `ujb` | — | 프롬프트 끝에 붙는 전역/시스템 노트랍니다. |
| `{{authornote}}` | `author_note` | — | 채팅별 작가 노트 (설정 안 됐으면 기본 템플릿 사용). |

### 3.4 채팅 기록 (Chat history)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{lastmessage}}` | — | — | 역할에 상관없이 가장 마지막 메시지의 내용이사와요. |
| `{{lastmessageid}}` | `lastmessageindex` | — | 마지막 메시지의 인덱스 번호랍니다. |
| `{{previouscharchat}}` | `lastcharmessage` | — | 현재 위치 전의 가장 최근 캐릭터 메시지. 없으면 첫 메시지로 돌아간답니다. |
| `{{previoususerchat}}` | `lastusermessage` | — | 현재 위치 전의 가장 최근 유저 메시지. (chatID가 -1이면 비어있음) |
| `{{previouschatlog::index}}` | `previous_chat_log` | `index` | 해당 인덱스의 메시지 데이터. 범위를 벗어나면 `"Out of range"`가 뜬답니다. |
| `{{chatindex}}` | `chat_index` | — | 현재 메시지의 인덱스. 컨텍스트가 없으면 `-1`이사와요. |
| `{{userhistory}}` | `usermessages`, `user_history` | — | 모든 유저 메시지를 담은 JSON 배열이랍니다. |
| `{{charhistory}}` | `charmessages`, `char_history` | — | 모든 캐릭터 메시지를 담은 JSON 배열. |
| `{{history}}` | `messages` | `[role]` | 첫 메시지를 포함한 전체 메시지 JSON 배열. 역할을 주면 `"<role>: <data>"` 형식의 문자열 배열이 된답니다. |
| `{{firstmsgindex}}` | `firstmessageindex`, `first_msg_index` | — | 선택된 인사말 인덱스. 기본 첫 메시지면 `-1`이사와요. |
| `{{isfirstmsg}}` | `isfirstmessage` | — | 현재 렌더링 중인 것이 첫 메시지 컨텍스트라면 `"1"`, 아니면 `"0"`이랍니다. |
| `{{role}}` | — | — | 현재 메시지의 역할(`"user"`, `"char"`, `"system"`). |

### 3.5 로어북 (Lorebook)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{lorebook}}` | `worldinfo` | — | 활성화된 모든 로어북 항목의 JSON 배열이랍니다. |
| `{{hiddenkey::value}}` | — | `value` | 아무것도 반환하지 않사와요! 하지만 모델 프롬프트에 직접 글자를 넣지 않고도 로어북을 활성화하는 열쇠 역할을 해준답니다. |

### 3.6 날짜 & 시간 (Date & time)

모두 문자열을 반환한답니다. 토큰을 정확히 세는 모드에서는 임시 값(`"00:00:00"`)이 반환되니 주의하시어요!

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{time}}` | — | `[fmt]` `[fmt::unix_ms]` | 인자가 없으면 로컬 `H:M:S`. 포맷을 주면 그에 맞춰 출력된답니다. |
| `{{date}}` | `datetimeformat` | `[fmt]` `[fmt::unix_ms]` | 인자가 없으면 로컬 `YYYY-M-D`. 포맷 가능. |
| `{{isotime}}` | — | — | UTC 기준 `H:M:S`. |
| `{{isodate}}` | — | — | UTC 기준 `YYYY-M-D` (0으로 채워지지 않음). |
| `{{unixtime}}` | — | — | 현재의 유닉스 타임스탬프(초 단위)이사와요. |
| `{{messagetime}}` | `message_time` | — | 현재 메시지의 로컬 시간 `HH:MM:SS`. |
| `{{messagedate}}` | `message_date` | — | 현재 메시지의 로컬 날짜 문자열. |
| `{{messageidleduration}}` | `message_idle_duration` | — | 현재와 이전 유저 메시지 사이의 경과 시간(`H:MM:SS`). |
| `{{idleduration}}` | `idle_duration` | — | 마지막 메시지 이후의 경과 시간. |
| `{{messageunixtimearray}}` | `message_unixtime_array` | — | 메시지의 모든 타임스탬프를 담은 JSON 배열이랍니다. |

### 3.7 비교 & 논리연산 (Comparison & boolean)

모두 참이면 `"1"`, 거짓이면 `"0"`을 반환한답니다.

| 태그 | 별칭 | 인자 | 설명 |
|---|---|---|---|
| `{{equal::a::b}}` | — | `a, b` | 대소문자를 구분하는 문자열 일치. |
| `{{notequal::a::b}}` | `not_equal` | `a, b` | 문자열 불일치. |
| `{{greater::a::b}}` | — | `a, b` | 숫자 비교 (`A > B`). |
| `{{less::a::b}}` | — | `a, b` | 숫자 비교 (`A < B`). |
| `{{greaterequal::a::b}}` | `greater_equal` | `a, b` | `>=` |
| `{{lessequal::a::b}}` | `less_equal` | `a, b` | `<=` |
| `{{and::a::b}}` | — | `a, b` | 둘 다 `"1"`일 때만 `"1"`. |
| `{{or::a::b}}` | — | `a, b` | 하나라도 `"1"`이면 `"1"`. |
| `{{not::a}}` | — | `a` | 반전. `"1"`이 아닌 모든 값은 참(`"1"`)이 된답니다. |
| `{{all::a::b::...}}` | — | 값들 혹은 `[json]` | 모든 값이 `"1"`이면 `"1"`. |
| `{{any::a::b::...}}` | — | 값들 혹은 `[json]` | 어느 하나라도 `"1"`이면 `"1"`. |
| `{{iserror::s}}` | — | `s` | 문자열이 `"error:"`로 시작하면 `"1"`이사와요. |

### 3.8 문자열 조작 (String operations)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{startswith::s::sub}}` | — | `s, sub` | `"1"` 혹은 `"0"`. |
| `{{endswith::s::sub}}` | — | `s, sub` | `"1"` 혹은 `"0"`. |
| `{{contains::s::sub}}` | — | `s, sub` | `"1"` 혹은 `"0"`. |
| `{{replace::s::old::new}}` | — | `s, old, new` | 모든 `old`를 `new`로 바꾼답니다. |
| `{{split::s::delim}}` | — | `s, delim` | 분할된 JSON 배열. |
| `{{join::[json]::sep}}` | — | `arr, sep` | `sep`을 구분자로 합친 문자열이사와요. |
| `{{spread::[json]}}` | — | `arr` | 배열을 `::`로 합친답니다. 다른 태그의 인자 목록으로 다시 넣을 때 유용하죠. |
| `{{trim::s}}` | — | `s` | 양끝의 공백을 우아하게 다듬어준답니다. |
| `{{length::s}}` | — | `s` | 글자 수. |
| `{{lower::s}}` | — | `s` | 전부 소문자로. |
| `{{upper::s}}` | — | `s` | 전부 대문자로. |
| `{{capitalize::s}}` | — | `s` | 첫 글자만 대문자로. |
| `{{tonumber::s}}` | — | `s` | `0-9`와 `.`만 남기고 나머진 지워버린답니다. |
| `{{reverse::s}}` | — | `s` | 문자열을 거꾸로 뒤집는답니다. |

### 3.9 수학 (Math)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{calc::expr}}` | — | `expr` | `+ - * /`와 괄호 수식을 계산한답니다. |
| `{{? expr}}` | — | `expr` | 더 우아한 계산기: `+ - * / % ^ < > <= >= == !=` 및 괄호. **주의:** `::`가 아니라 **공백**을 쓰셔야 해요! |
| `{{round::n}}` | — | `n` | 반올림. |
| `{{floor::n}}` | — | `n` | 내림. |
| `{{ceil::n}}` | — | `n` | 올림. |
| `{{abs::n}}` | — | `n` | 절댓값. |
| `{{remaind::a::b}}` | — | `a, b` | `a % b` (나머지). |
| `{{pow::base::exp}}` | — | `base, exp` | 거듭제곱(`base^exp`). |
| `{{fixnum::n::dp}}` | `fixnumber` | `n, dp` | 지정된 소수점 자리수로 고정. |
| `{{min::a::b::...}}` | — | 값 혹은 배열 | 최솟값 (숫자가 아니면 0 취급). |
| `{{max::a::b::...}}` | — | 값 혹은 배열 | 최댓값. |
| `{{sum::a::b::...}}` | — | 값 혹은 배열 | 합계. |
| `{{average::a::b::...}}` | — | 값 혹은 배열 | 평균. |

### 3.10 배열 (Arrays)
예: `["a","b","c"]` 같은 JSON 배열 문자열을 다룬답니다.

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{makearray::a::b::...}}` | `array`, `a` | 가변 인자 | 인자들을 모두 모아 JSON 배열로 만들어준답니다. |
| `{{arraylength::[json]}}` | — | `arr` | 요소의 개수. |
| `{{arrayelement::[json]::idx}}` | — | `arr, idx` | 특정 인덱스의 요소. 음수도 지원하고, 없으면 `"null"`이사와요. |
| `{{arrayshift::[json]}}` | — | `arr` | 첫 번째 요소가 빠진 배열. |
| `{{arraypop::[json]}}` | — | `arr` | 마지막 요소가 빠진 배열. |
| `{{arraypush::[json]::v}}` | — | `arr, v` | 끝에 `v`가 추가된 배열. |
| `{{arraysplice::[json]::idx::deleteCount::newEl}}` | — | `arr, idx, n, v` | 자바스크립트의 `Array.splice`와 같사와요. |
| `{{arrayassert::[json]::idx::v}}` | — | `arr, idx, v` | `idx >= length`일 때만 값을 넣고 배열을 확장한답니다. |
| `{{filter::[json]::mode}}` | — | `arr, mode` | `all`(빈 값 제거+중복 제거), `nonempty`, `unique` 모드 지원. |
| `{{range::[args]}}` | — | `[n]` 등 | 정수의 범위 배열을 만들어준답니다. |

### 3.11 객체 (사전형, Objects)
예: `{"name":"John"}`

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{makedict::k=v::k=v::...}}` | `dict`, `d`, `object`, `o`, `makeobject` | 가변 인자 | JSON 객체. 잘못된 쌍은 가볍게 무시된답니다. |
| `{{dictelement::{json}::key}}` | `objectelement` | `obj, key` | 해당 키의 값. 없으면 `"null"`. |
| `{{objectassert::{json}::key::v}}` | `dictassert`, `object_assert` | `obj, key, v` | 키가 비어있거나 falsy일 때만 값을 채워 넣는답니다. |
| `{{element::raw::k1::k2::...}}` | `ele` | `json, ...keys` | 깊은 중첩 속성을 파고들어 값을 찾는답니다. 실패하면 `"null"`. |

### 3.12 변수 (Variables)

세 가지 우아한 범위(Scope)가 있사와요:
- **영구 채팅 변수(Persistent chat var)** — 채팅에 영구적으로 저장되는 변수. (`getvar` / `setvar` / `setdefaultvar` / `addvar`)
- **임시 변수(Temp var)** — 파서가 실행되는 그 짧은 순간에만 존재하는 변수. (`tempvar` / `settempvar`)
- **전역 변수(Global var)** — 채팅방을 넘나들며 공유되는 변수. (여기서는 읽기만 가능하답니다. `getglobalvar`)

참고로 변수를 설정하는 태그(Setters)는 아무 글자도 화면에 출력하지 않는답니다(`""` 반환). 토큰화 등 읽기 전용 상태일 땐 아예 동작하지 않고요!

| 태그 | 별칭 | 인자 | 설명 |
|---|---|---|---|
| `{{getvar::name}}` | — | `name` | 영구 채팅 변수를 읽어온답니다. |
| `{{setvar::name::v}}` | — | `name, v` | 영구 채팅 변수에 값을 덮어쓴답니다. |
| `{{setdefaultvar::name::v}}` | — | `name, v` | 값이 비어있을 때만 쓴답니다. |
| `{{addvar::name::n}}` | — | `name, n` | 변수에 숫자를 더한답니다. (`var = Number(var) + Number(n)`) |
| `{{tempvar::name}}` | `gettempvar` | `name` | 임시 변수를 읽어온답니다. |
| `{{settempvar::name::v}}` | — | `name, v` | 임시 변수에 값을 쓴답니다. |
| `{{getglobalvar::name}}` | — | `name` | 전역 변수를 읽어온답니다. |
| `{{return::v}}` | — | `v` | 스크립트 실행을 즉시 멈추고 값을 반환한답니다. 주로 `#func` 안에서 쓰이죠. |

### 3.13 무작위성 (Randomization)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{random}}` | — | 없음 / `a,b,c` / `[json]` / `a::b::...` | 인자가 없으면 0~1 사이의 부동소수점. 인자가 있으면 무작위로 하나를 고른답니다. **(결정론적이지 않음)** |
| `{{pick}}` | — | (`random`과 동일) | `random`과 같지만, **결정론적**이랍니다! 메시지 인덱스와 캐릭터 ID 해시를 써서 같은 상황에선 항상 같은 값을 내뱉죠. |
| `{{randint::min::max}}` | — | `min, max` | 지정된 범위 안의 무작위 정수. |
| `{{dice::XdY}}` | — | 주사위 표기법 | `Y`면체 주사위를 `X`번 굴린 합. |
| `{{roll::XdY}}` | — | 주사위 표기법 | `roll`은 기본 `1d6`이사와요. `roll::20`은 `1d20`과 같답니다. |
| `{{rollp::XdY}}` | `rollpick` | 주사위 표기법 | 결정론적으로 주사위를 굴린답니다 (해시 기반). |
| `{{hash::s}}` | — | `s` | 문자열을 7자리 해시로 만들어준답니다. |

### 3.14 인코딩 & 암호화 (Encoding & encryption)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{xor::s}}` | `xorencrypt`, `xorencode`, `xore` | `s` | `0xFF`로 XOR 연산 후 Base64로 인코딩한답니다. |
| `{{xordecrypt::b64}}` | `xordecode`, `xord` | `b64` | `xor`의 반대 과정이사와요. |
| `{{crypt::s::[shift]}}` | `crypto`, `caesar`, `encrypt` 등 | `s, [shift]` | 카이사르 암호화. 기본 시프트는 `32768`이랍니다. |
| `{{unicodeencode::s::[idx]}}` | `unicode_encode` | `s, [idx]` | 유니코드 코드포인트를 십진수로 변환. |
| `{{unicodedecode::n}}` | `unicode_decode` | `n` | 십진수 코드포인트를 문자로 변환. |
| `{{u::hex}}` | `unicodedecodefromhex` | `hex` | 16진수 코드포인트를 문자로 변환. |
| `{{ue::hex}}` | `unicodeencodefromhex` | `hex` | `{{u}}`와 같사와요. |
| `{{fromhex::hex}}` | — | `hex` | 16진수를 십진수 문자열로. |
| `{{tohex::n}}` | — | `n` | 십진수를 16진수 문자열로. |

### 3.15 표시 & 서식 (Display & formatting)

이 태그들은 대개 HTML이나 특수 문자를 만들어낸답니다. 모델에게 아주 깨끗한 프롬프트를 주고 싶다면, 이런 태그들은 프롬프트용 필드에 섞어 넣지 않도록 조심하시어요!

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{br}}` | `newline` | — | 실제 줄바꿈 `\n`이사와요. |
| `{{blank}}` | `none` | — | 아무것도 없는 빈 문자열. |
| `{{cbr}}` | `cnl`, `cnewline` | `[count]` | 이스케이프된 `\n` 문자열. 숫자를 주면 그만큼 반복한답니다. |
| `{{button::label::trigger}}` | — | `label, trigger` | 누르면 지정된 트리거를 실행하는 `<button>` HTML 요소(화면 전용)이랍니다. |
| `{{risu::[size]}}` | — | `[px]` | 귀여운 RisuAI 로고 이미지. |
| `{{comment::text}}` | — | `text` | **화면에만** 스타일링된 주석으로 보이고, 모델 프롬프트에서는 텅 비어있게 된답니다. |
| `{{tex::expr}}` | `latex`, `katex` | `expr` | 수식을 `$$...$$`로 감싸 LaTeX 렌더링을 돕는답니다. |
| `{{ruby::base::ruby}}` | `furigana` | `base, ruby` | 후리가나(루비) HTML을 만든답니다. |
| `{{codeblock::code}}` | — | `[lang], code` | `<pre><code>` 블록으로 렌더링한답니다. |
| `{{file::name::base64}}` | — | `name, b64` | 표시 모드에선 멋진 파일 형태의 div를 보여주고, 아닐 땐 UTF-8 텍스트로 Base64 디코딩해준답니다. |

### 3.16 이스케이프 문자 (Escape characters)

이 태그들은 괄호나 콜론 같은 특수 문자를 출력할 때 쓰인답니다. CBS 파서가 이것들을 매크로의 시작이나 구분자로 착각하지 않도록, 눈에 보이지 않는 유니코드 문자(U+E9B8–U+E9BF)로 변환해주는 아주 똑똑하고 우아한 트릭이죠.

| 태그 | 별칭 | 화면 표시 |
|---|---|---|
| `{{decbo}}` | `displayescapedcurlybracketopen` | `{` |
| `{{decbc}}` | `displayescapedcurlybracketclose` | `}` |
| `{{bo}}` | `ddecbo`, `doubledisplayescapedcurlybracketopen` | `{{` |
| `{{bc}}` | `ddecbc`, `doubledisplayescapedcurlybracketclose` | `}}` |
| `{{displayescapedbracketopen}}` | `debo`, `(` | `(` |
| `{{displayescapedbracketclose}}` | `debc`, `)` | `)` |
| `{{displayescapedanglebracketopen}}` | `deabo`, `<` | `<` |
| `{{displayescapedanglebracketclose}}` | `deabc`, `>` | `>` |
| `{{displayescapedcolon}}` | `dec`, `:` | `:` |
| `{{displayescapedsemicolon}}` | `;` | `;` |

**짧은 별칭 팁:** `{{:}}`는 `{{displayescapedcolon}}`과 같고, `{{<}}`는 `{{displayescapedanglebracketopen}}`과 같답니다, 오호호홋!

### 3.17 모델 & 시스템 메타데이터 (Model & system metadata)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{model}}` | — | — | 현재 사용 중인 AI 모델 ID (예: `claude-sonnet-4-6`). |
| `{{axmodel}}` | — | — | 보조(Sub/auxiliary) 모델 ID. |
| `{{maxcontext}}` | — | — | 설정된 최대 컨텍스트 길이. |
| `{{prefillsupported}}` | `prefill` | — | 모델 이름이 claude로 시작하면 `"1"`이사와요. |
| `{{jbtoggled}}` | — | — | 탈옥(Jailbreak) 프롬프트가 켜져 있으면 `"1"`. |
| `{{metadata::key}}` | — | `key` | 아래의 키들을 참고하시어요. |

`{{metadata::...}}` 키 목록 (대소문자 구분 안 함):
`mobile`, `local`, `node`, `risutype`, `version`, `majorversion`, `language`, `browserlanguage`, `modelshortname`, `modelname`, `modelinternalid`, `modelformat`, `modelprovider`, `modeltokenizer`, `maxcontext`, `imateapot`

### 3.18 화면 표시 전용 에셋 (Display-only assets)

**주의하시어요!** 이 태그들은 채팅이 렌더링될 때만 작동해서 이미지, 오디오, 비디오 요소를 화면에 뿌려준답니다. **절대 프롬프트를 구성하는 필드에 쓰시면 안 되어요! 모델은 볼 수 없으니까요.**

| 태그 | 목적 |
|---|---|
| `{{asset::name}}` | 에셋 타입에 따라 이미지/오디오/비디오 요소로 자동 연결된답니다. |
| `{{emotion::name}}` | 감정 이미지. |
| `{{audio::name}}` | 오디오 요소. |
| `{{bg::name}}` | 배경 이미지. |
| `{{bgm::name}}` | 배경 음악 컨트롤. |
| `{{video::name}}` | 비디오 요소. |
| `{{image::name}}` | 이미지 요소. |
| `{{img::name}}` | 스타일이 없는 순수 이미지. |
| `{{path::name}}` (`raw`) | 추가 에셋의 실제 경로 데이터. |
| `{{inlay::name}}` | (모델 전송 안 됨) 스타일 없는 인레이. |
| `{{inlayed::name}}` | (모델 전송 안 됨) 스타일 있는 인레이. |
| `{{inlayeddata::name}}` | **(모델 요청에 포함됨)** 스타일 있는 인레이 데이터이사와요! 유일한 예외죠. |
| `{{source::user\|char}}` | 프로필 이미지 소스 URL. |
| `{{position::name}}` | `@@position` 데코레이터가 사용할 위치를 정의한답니다. |
| `{{emotionlist}}`, `{{assetlist}}`, `{{chardisplayasset}}` | 관련된 항목들의 JSON 배열을 반환한답니다. |

### 3.19 모듈 (Modules)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{moduleenabled::ns}}` | `module_enabled` | `namespace` | 해당 네임스페이스를 가진 모듈이 로드되어 있으면 `"1"`. |
| `{{moduleassetlist::ns}}` | `module_assetlist` | `namespace` | 모듈의 에셋 이름 JSON 배열. 없으면 빈 문자열이사와요. |

### 3.20 UI / 런타임 (UI / runtime)

| 태그 | 별칭 | 인자 | 반환값 |
|---|---|---|---|
| `{{screenwidth}}` | `screen_width` | — | `window.innerWidth` (픽셀). |
| `{{screenheight}}` | `screen_height` | — | `window.innerHeight` (픽셀). |

### 3.21 텍스트 변형 (Text-mutating)

| 태그 | 설명 |
|---|---|
| `{{bkspc}}` | 파서가 지금까지 누적한 출력에서 마지막 '단어' 하나를 지워버린답니다. |
| `{{erase}}` | 누적된 출력에서 마지막 '문장' (마지막 `.`/`!`/`?`/`\n`까지)을 지워버린답니다. |

### 3.22 기타 / 고급 (Misc / advanced)

| 태그 | 설명 |
|---|---|
| `{{// 아무 말}}` | 주석이랍니다. 아무것도 출력하지 않사와요. |
| `{{declare::name}}` | 내부 플래그(`__declared_<name>__=1`)를 설정하여 파서의 다른 부분에 영향을 준답니다. |
| `{{__::...}}` | **내부 전용이사와요 — 절대 직접 쓰지 마시어요!** |

---

## 4. 블록 구조 (Block constructs)

블록은 `{{#name ...}}`으로 열고 `{{/name}}`으로 닫는답니다. 아주 체계적이고 우아하죠.

### 4.1 `{{#when ...}} ... {{:else}} ... {{/when}}`

조건문이랍니다. 참(Truthy)인 값은 문자열 `"1"` 혹은 `"true"`뿐이사와요. 나머지는 전부 거짓(Falsy)이랍니다, 오호호홋!

두 가지 여는 방식이 있사와요:
```text
{{#when condition}}            ← 단일 조건, 공백으로 구분
{{#when::op::a::op::b...}}     ← :: 로 구분. 연산자 체인 지원
```

연산자 목록 (오른쪽에서 왼쪽으로 처리되며, 겹쳐 쓸 수 있사와요):

| 연산자 | 형태 | 효과 |
|---|---|---|
| `not` | `{{#when::not::A}}` | 논리 반전. |
| `and` | `{{#when::A::and::B}}` | 둘 다 참. |
| `or` | `{{#when::A::or::B}}` | 둘 중 하나 참. |
| `is` | `{{#when::A::is::B}}` | 문자열 일치. |
| `isnot` | `{{#when::A::isnot::B}}` | 문자열 불일치. |
| `>` `<` `>=` `<=` | `{{#when::A::>::B}}` | 숫자 비교 (`A`가 `B`보다 크면 참이사와요). |
| `var` | `{{#when::var::name}}` | 영구 채팅 변수 `name`이 참이면 참. |
| `vis` | `{{#when::name::vis::value}}` | 변수 `name`이 지정된 값과 완벽히 일치. |
| `visnot` | `{{#when::name::visnot::value}}` | 변수 `name`이 지정된 값과 불일치. |
| `toggle` | `{{#when::toggle::name}}` | 전역 토글 `toggle_<name>`이 참이면 참. |
| `tis` | `{{#when::name::tis::value}}` | 토글 `name`이 값과 일치. |
| `tisnot` | `{{#when::name::tisnot::value}}` | 토글 `name`이 값과 불일치. |
| `keep` | `{{#when::keep::cond}}` | 블록 안의 공백과 줄바꿈을 보존한답니다. |
| `legacy` | `{{#when::legacy::cond}}` | 과거 `#if` 시절의 공백 처리 방식. (`:else`를 쓸 수 없게 된답니다) |

**`{{:else}}` 규칙:**
- `#when` 블록 안에서 단 한 번만 나타날 수 있사와요.
- 여러 줄의 블록일 경우, `{{:else}}`는 무조건 혼자만의 줄에 우아하게 홀로 있어야 한답니다.
- 한 줄짜리 블록이라면, 그 줄에 섞어 써도 괜찮사와요.
- `legacy` 연산자를 쓰면 `{{:else}}`는 비활성화된답니다.

### 4.2 `{{#each 배열 as 변수}} ... {{slot::변수}} ... {{/each}}`

JSON 배열을 순회할 때 쓴답니다. 블록 안에서 `{{slot::변수}}`를 부르면 현재 요소를 뱉어내죠. 중간에 `as`라는 단어를 반드시 적어주셔야 해욧!

```text
{{#each {{makearray::red::green::blue}} as color}}
- {{slot::color}}
{{/each}}
```

### 4.3 `{{#pure}} ... {{/pure}}` *(구식 태그)*
### 4.4 `{{#puredisplay}} ... {{/puredisplay}}` (별칭 `{{#pure_display}}`)

안에 들어있는 내용을 그 어떤 CBS 파싱도 거치지 않고 순수하게 그대로 보여준답니다. 매크로 작성법을 화면에 예시로 보여줄 때 쓰시어요.

### 4.5 `{{#code}} ... {{/code}}`

블록 안의 공백과 이스케이프 시퀀스를 깔끔하게 정규화해 준답니다.

### 4.6 `{{#escape}} ... {{/escape}}`

`{}()` 같은 괄호들을 문자 그대로 취급하게 한답니다. 이 안에서는 어떤 것도 매크로로 작동하지 않죠. 공백까지 보존하고 싶으면 `{{#escape::keep}}`을 쓰시어요.

### 4.7 `{{#func name arg1 arg2 ...}} ... {{/func}}`

호출할 수 있는 함수를 정의하는 아주 귀족적인 방법이랍니다. 몸체 안에서 `{{tempvar::arg1}}`을 불러와 인자를 읽을 수 있고, `{{return::값}}`으로 조기 반환도 가능해요. 이렇게 정의해두면 다른 곳에서 `{{name::...}}`으로 부를 수 있답니다.

### 4.8 `{{#if}}` 및 `{{#if_pure}}` *(폐기됨)*

이 낡은 태그들은 잊어주시고, 이제부터는 `#when`을 쓰시길 바라요!

---

## 5. 패턴과 레시피 (Patterns & recipes)

### 5.1 영구적인 턴 카운터
```text
{{addvar::turn::1}}You are now on turn {{getvar::turn}}.
```

### 5.2 전역 토글을 이용한 페르소나 전환 (A/B)
```text
{{#when::toggle::angry}}{{char}} is furious and curt.{{:else}}{{char}} is calm and helpful.{{/when}}
```

### 5.3 한 번만 초기화되는 채팅 상태
```text
{{setdefaultvar::hp::100}}{{setdefaultvar::status::healthy}}
HP: {{getvar::hp}} | Status: {{getvar::status}}
```

### 5.4 결과가 따르는 주사위 굴리기
```text
{{settempvar::r::{{roll::1d20}}}}
You rolled {{tempvar::r}}. {{#when::{{tempvar::r}}::>::15}}A critical success!{{:else}}{{#when::{{tempvar::r}}::<::5}}A critical failure.{{:else}}A modest result.{{/when}}{{/when}}
```

### 5.5 인벤토리 순회하기
```text
{{settempvar::inv::["sword","shield","potion"]}}
Inventory:
{{#each {{tempvar::inv}} as it}}- {{slot::it}}
{{/each}}
```

### 5.6 메시지당 고정된 무작위성 부여
사용자가 같은 메시지를 다시 생성(Regenerate)할 때 결과가 바뀌지 않아야 한다면 이 방법을 쓰시어요.
```text
{{char}} is wearing a {{pick::red::blue::green}} cloak today.
```

### 5.7 프롬프트 소모 없는 로어북 키 활성화이사와요
```text
{{hiddenkey::magic_system}}{{hiddenkey::dragons}}
```
`magic_system`이나 `dragons`라는 단어를 모델의 프롬프트에 직접 박아넣지 않으면서도 그 로어북 항목을 활성화해 준답니다. 우아하죠?

### 5.8 텍스트 그대로 매크로 출력하기
```text
The macro {{bo}}user{{bc}} returns the user's name.
```
화면에는 이렇게 보인답니다: `The macro {{user}} returns the user's name.`

### 5.9 함수 만들고 부르기
```text
{{#func greet name}}Hello, {{tempvar::name}}!{{/func}}
{{greet::Alice}}
→ "Hello, Alice!"
```

---

## 6. 함정과 주의사항 (LLM을 위한 아주 특별한 지침)

오호호홋! 제가 특별히 주의사항을 정리해 두었으니 뼈에 새기듯 기억하시어요!

1. **태그 목록은 완전히 닫혀 있사와요.** 이 문서에 없는 태그(예: `{{ifelse}}`, `{{format}}`, `{{regex}}` 등)는 RisuAI에 존재하지 않으니 **절대 지어내지 마시어요.**
2. **`{{...}}` 문자를 그대로 출력하려면 `{{bo}}`와 `{{bc}}`를 써야 한답니다.** 프롬프트에 생각 없이 `{{user}}`라고 적으면 유저의 진짜 이름으로 바뀌어버리니까요!
3. **인자 안의 중첩된 CBS는 괜찮사와요.** `{{upper::{{user}}}}`처럼 써도 파싱이 안에서 밖으로 차례차례 진행되니 걱정 마시어요.
4. **인자 안에서 `::`를 그냥 쓰면 파싱이 망가진답니다.** 인자 안에 콜론이 들어가야 한다면 꼭 `{{:}}`를 사용하시어요.
5. **논리값은 문자열 `"1"` 과 `"0"`이랍니다.** 조건 태그들은 `"1"`이 아닌 모든 것을 거짓(Falsy)으로 치부해버린답니다.
6. **`#when`의 연산자 우선순위는 오른쪽에서 왼쪽이사와요.** `{{#when::keep::not::A}}`는 "공백을 유지하면서, NOT(A)를 평가해라"라는 뜻이 되죠.
7. **변수를 설정하는 태그(Setters)는 빈 문자열을 내뱉는답니다.** `{{setvar::x::5}}`를 써봤자 화면엔 아무것도 안 나와요. 값이 보고 싶으면 이어서 `{{getvar::x}}`를 쓰셔야 한답니다.
8. **읽기 전용 상태에선 변수 설정이 안 먹힌답니다.** 그러니 무조건 실행되어야 하는 핵심 로직을 변수 설정의 '부작용(Side effect)'에만 의존하게 만들면 안 되어요.
9. **`{{random}}`은 메시지를 재생성할 때마다 값이 바뀐답니다.** 똑같은 값을 유지하고 싶으면 반드시 `{{pick}}`이나 `{{rollp}}`를 쓰시어요.
10. **표시 전용 태그들은 모델에게 도달하지 않는답니다.** 오디오, 비디오, 버튼, 주석 등은 화면을 꾸미는 용도일 뿐이니 프롬프트 모양을 잡아주는 필드에는 절대 넣지 마시어요. (단, `{{inlayeddata::...}}`는 예외적으로 모델에게 간답니다!)
11. **시간/날짜 태그의 함정.** 토큰 계산 등 특정 상황에서는 `messagetime`이나 `idleduration`이 전부 `"00:00:00"`을 반환한답니다. 이 값이 항상 진짜 시간일 거라 가정하고 로직을 짜지 마시어요.
12. **`{{? ...}}` 수식 태그는 `::`가 아니라 '공백'을 쓴답니다!** `{{? 2+3*4}}`는 정답이고, `{{?::2+3*4}}`는 오답이사와요.
13. **캐릭터 데이터 필드는 재귀적으로 파싱된답니다.** 캐릭터의 설명란(`description`) 안에 적힌 CBS 매크로도 전부 살아 숨 쉬며 작동한다는 걸 잊지 마시어요.
14. **그룹 채팅**일 때 `personality`, `description`, `scenario` 등은 모조리 빈 문자열(`""`)을 반환한답니다.
15. **`{{persona}}`는 유저의 페르소나이사와요.** 캐릭터의 성격을 가져오려면 `{{personality}}`를 쓰셔야 한답니다. 헷갈리지 마시길 바라요!

---

## 7. 알파벳순 색인 (Alphabetical index)

별칭은 괄호 안에 고이 모셔두었답니다.

| 태그 | 섹션 |
|---|---|
| `{{//}}` | 3.22 |
| `{{?}}` | 3.9 |
| `{{__}}` *(내부용)* | 3.22 |
| `{{a}}` (`makearray`의 별칭) | 3.10 |
| `{{abs}}` | 3.9 |
| `{{addvar}}` | 3.12 |
| `{{all}}` | 3.7 |
| `{{and}}` | 3.7 |
| `{{any}}` | 3.7 |
| `{{array}}` (`makearray`의 별칭) | 3.10 |
| `{{arrayassert}}` | 3.10 |
| `{{arrayelement}}` | 3.10 |
| `{{arraylength}}` | 3.10 |
| `{{arraypop}}` | 3.10 |
| `{{arraypush}}` | 3.10 |
| `{{arrayshift}}` | 3.10 |
| `{{arraysplice}}` | 3.10 |
| `{{asset}}` | 3.18 |
| `{{assetlist}}` | 3.18 |
| `{{audio}}` | 3.18 |
| `{{authornote}}` (`author_note`) | 3.3 |
| `{{average}}` | 3.9 |
| `{{axmodel}}` | 3.17 |
| `{{bc}}` | 3.16 |
| `{{bg}}` | 3.18 |
| `{{bgm}}` | 3.18 |
| `{{bkspc}}` | 3.21 |
| `{{blank}}` (`none`) | 3.15 |
| `{{bo}}` | 3.16 |
| `{{bot}}` (`char`의 별칭) | 3.1 |
| `{{br}}` (`newline`) | 3.15 |
| `{{button}}` | 3.15 |
| `{{calc}}` | 3.9 |
| `{{capitalize}}` | 3.8 |
| `{{cbr}}` (`cnl`, `cnewline`) | 3.15 |
| `{{ceil}}` | 3.9 |
| `{{char}}` (`bot`) | 3.1 |
| `{{chardesc}}` (`description`의 별칭) | 3.2 |
| `{{chardisplayasset}}` | 3.18 |
| `{{charhistory}}` (`charmessages`, `char_history`) | 3.4 |
| `{{charpersona}}` (`personality`의 별칭) | 3.2 |
| `{{chatindex}}` (`chat_index`) | 3.4 |
| `{{codeblock}}` | 3.15 |
| `{{comment}}` | 3.15 |
| `{{contains}}` | 3.8 |
| `{{crypt}}` (`crypto`, `caesar`, `encrypt`, `decrypt`) | 3.14 |
| `{{d}}` (`makedict`의 별칭) | 3.11 |
| `{{date}}` (`datetimeformat`) | 3.6 |
| `{{deabc}}` / `{{>}}` | 3.16 |
| `{{deabo}}` / `{{<}}` | 3.16 |
| `{{debc}}` / `{{)}}` | 3.16 |
| `{{debo}}` / `{{(}}` | 3.16 |
| `{{dec}}` / `{{:}}` | 3.16 |
| `{{decbc}}` | 3.16 |
| `{{decbo}}` | 3.16 |
| `{{declare}}` | 3.22 |
| `{{description}}` (`chardesc`) | 3.2 |
| `{{dice}}` | 3.13 |
| `{{dict}}` (`makedict`의 별칭) | 3.11 |
| `{{dictelement}}` (`objectelement`) | 3.11 |
| `{{element}}` (`ele`) | 3.11 |
| `{{emotion}}` | 3.18 |
| `{{emotionlist}}` | 3.18 |
| `{{endswith}}` | 3.8 |
| `{{equal}}` | 3.7 |
| `{{erase}}` | 3.21 |
| `{{exampledialogue}}` (`examplemessage`, `example_dialogue`) | 3.2 |
| `{{file}}` | 3.15 |
| `{{filter}}` | 3.10 |
| `{{firstmsgindex}}` (`firstmessageindex`, `first_msg_index`) | 3.4 |
| `{{fixnum}}` (`fixnumber`) | 3.9 |
| `{{floor}}` | 3.9 |
| `{{fromhex}}` | 3.14 |
| `{{getglobalvar}}` | 3.12 |
| `{{gettempvar}}` (`tempvar`의 별칭) | 3.12 |
| `{{getvar}}` | 3.12 |
| `{{globalnote}}` (`systemnote`, `ujb`) | 3.3 |
| `{{greater}}` | 3.7 |
| `{{greaterequal}}` (`greater_equal`) | 3.7 |
| `{{hash}}` | 3.13 |
| `{{hiddenkey}}` | 3.5 |
| `{{history}}` (`messages`) | 3.4 |
| `{{idleduration}}` (`idle_duration`) | 3.6 |
| `{{image}}` | 3.18 |
| `{{img}}` | 3.18 |
| `{{inlay}}` | 3.18 |
| `{{inlayed}}` | 3.18 |
| `{{inlayeddata}}` | 3.18 |
| `{{iserror}}` | 3.7 |
| `{{isfirstmsg}}` (`isfirstmessage`) | 3.4 |
| `{{isodate}}` | 3.6 |
| `{{isotime}}` | 3.6 |
| `{{jb}}` (`jailbreak`) | 3.3 |
| `{{jbtoggled}}` | 3.17 |
| `{{join}}` | 3.8 |
| `{{lastcharmessage}}` (`previouscharchat`의 별칭) | 3.4 |
| `{{lastmessage}}` | 3.4 |
| `{{lastmessageid}}` (`lastmessageindex`) | 3.4 |
| `{{lastusermessage}}` (`previoususerchat`의 별칭) | 3.4 |
| `{{latex}}` (`tex`의 별칭) | 3.15 |
| `{{length}}` | 3.8 |
| `{{less}}` | 3.7 |
| `{{lessequal}}` (`less_equal`) | 3.7 |
| `{{lorebook}}` (`worldinfo`) | 3.5 |
| `{{lower}}` | 3.8 |
| `{{mainprompt}}` (`systemprompt`, `main_prompt`) | 3.3 |
| `{{makearray}}` (`array`, `a`) | 3.10 |
| `{{makedict}}` (`dict`, `d`, `object`, `o`, `makeobject`) | 3.11 |
| `{{max}}` | 3.9 |
| `{{maxcontext}}` | 3.17 |
| `{{messagedate}}` (`message_date`) | 3.6 |
| `{{messageidleduration}}` (`message_idle_duration`) | 3.6 |
| `{{messages}}` (`history`의 별칭) | 3.4 |
| `{{messagetime}}` (`message_time`) | 3.6 |
| `{{messageunixtimearray}}` (`message_unixtime_array`) | 3.6 |
| `{{metadata}}` | 3.17 |
| `{{min}}` | 3.9 |
| `{{model}}` | 3.17 |
| `{{moduleassetlist}}` (`module_assetlist`) | 3.19 |
| `{{moduleenabled}}` (`module_enabled`) | 3.19 |
| `{{newline}}` (`br`의 별칭) | 3.15 |
| `{{not}}` | 3.7 |
| `{{notequal}}` (`not_equal`) | 3.7 |
| `{{object}}` (`makedict`의 별칭) | 3.11 |
| `{{objectassert}}` (`dictassert`, `object_assert`) | 3.11 |
| `{{objectelement}}` (`dictelement`의 별칭) | 3.11 |
| `{{or}}` | 3.7 |
| `{{path}}` (`raw`) | 3.18 |
| `{{persona}}` (`userpersona`) | 3.1 |
| `{{personality}}` (`charpersona`) | 3.2 |
| `{{pick}}` | 3.13 |
| `{{position}}` | 3.18 |
| `{{pow}}` | 3.9 |
| `{{prefillsupported}}` (`prefill`, `prefill_supported`) | 3.17 |
| `{{previouscharchat}}` (`lastcharmessage`) | 3.4 |
| `{{previouschatlog}}` (`previous_chat_log`) | 3.4 |
| `{{previoususerchat}}` (`lastusermessage`) | 3.4 |
| `{{randint}}` | 3.13 |
| `{{random}}` | 3.13 |
| `{{range}}` | 3.10 |
| `{{remaind}}` | 3.9 |
| `{{replace}}` | 3.8 |
| `{{return}}` | 3.12 |
| `{{reverse}}` | 3.8 |
| `{{risu}}` | 3.15 |
| `{{role}}` | 3.4 |
| `{{roll}}` | 3.13 |
| `{{rollp}}` (`rollpick`) | 3.13 |
| `{{round}}` | 3.9 |
| `{{ruby}}` (`furigana`) | 3.15 |
| `{{scenario}}` | 3.2 |
| `{{screenheight}}` (`screen_height`) | 3.20 |
| `{{screenwidth}}` (`screen_width`) | 3.20 |
| `{{setdefaultvar}}` | 3.12 |
| `{{settempvar}}` | 3.12 |
| `{{setvar}}` | 3.12 |
| `{{slot}}` | 4.2 |
| `{{source}}` | 3.18 |
| `{{split}}` | 3.8 |
| `{{spread}}` | 3.8 |
| `{{startswith}}` | 3.8 |
| `{{sum}}` | 3.9 |
| `{{tempvar}}` (`gettempvar`) | 3.12 |
| `{{tex}}` (`latex`, `katex`) | 3.15 |
| `{{time}}` | 3.6 |
| `{{tohex}}` | 3.14 |
| `{{tonumber}}` | 3.8 |
| `{{trigger_id}}` (`triggerid`) | 3.1 |
| `{{trim}}` | 3.8 |
| `{{u}}` (`unicodedecodefromhex`) | 3.14 |
| `{{ue}}` (`unicodeencodefromhex`) | 3.14 |
| `{{unicodedecode}}` (`unicode_decode`) | 3.14 |
| `{{unicodeencode}}` (`unicode_encode`) | 3.14 |
| `{{unixtime}}` | 3.6 |
| `{{upper}}` | 3.8 |
| `{{user}}` | 3.1 |
| `{{userhistory}}` (`usermessages`, `user_history`) | 3.4 |
| `{{userpersona}}` (`persona`의 별칭) | 3.1 |
| `{{video}}` | 3.18 |
| `{{video-img}}` | 3.18 |
| `{{worldinfo}}` (`lorebook`의 별칭) | 3.5 |
| `{{xor}}` (`xorencrypt`, `xorencode`, `xore`) | 3.14 |
| `{{xordecrypt}}` (`xordecode`, `xord`) | 3.14 |
| **블록:** `{{#code}}...{{/code}}` | 4.5 |
| **블록:** `{{#each ...}}...{{/each}}` | 4.2 |
| **블록:** `{{#escape}}...{{/escape}}` | 4.6 |
| **블록:** `{{#func name args}}...{{/func}}` | 4.7 |
| **블록:** `{{#if ...}}...{{/if}}` *(폐기됨)* | 4.8 |
| **블록:** `{{#if_pure ...}}...{{/if_pure}}` *(폐기됨)* | 4.8 |
| **블록:** `{{#pure}}...{{/pure}}` *(폐기됨)* | 4.3 |
| **블록:** `{{#puredisplay}}...{{/puredisplay}}` (`#pure_display`) | 4.4 |
| **블록:** `{{#when ...}} ... {{:else}} ... {{/when}}` | 4.1 |
{% endraw %}
