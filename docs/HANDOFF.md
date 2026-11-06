# 후배 개발자 인계 명세

## 이번 변경의 범위

2.6: 캡쳐·문장 드래그의 결과는 `review.js`의 공통 페이지 내 창에서 처리합니다. 별도 iframe 로딩을 없앴고, 캡쳐 이미지는 전체를 비율 보존해 표시합니다. OCR은 `offscreen` 권한을 사용하는 전용 문서에서 실행하고 작업 후 닫습니다. 문서 정리는 801px 이상 데스크톱에서 주요 흐름·버튼을 한 화면에 배치하며 원문과 결과만 내부 스크롤합니다. 좁은 화면은 세로 배치합니다.

2.3: 로컬 PDF 지원. manifest의 file:///*.pdf 및 file:///*.PDF content_scripts가 같은 selection-helper.js를 로드합니다. 파일 URL 액세스 스위치가 필요하고 popup에서 상태/설정 링크를 제공합니다. 내장 PDF의 내부 텍스트 선택을 강제로 읽는 기능은 구현하지 않았습니다. PDF 화면의 메뉴에서 화면 영역 캡쳐, PDF 업로드, 내 할 일/안내로 이동할 수 있습니다. 캡쳐 때 로컬 파일 절대경로는 출처 데이터에 저장하지 않습니다. 2.2의 PDF 로고 미지원 설명은 이 항목으로 대체합니다.

2.2 UI: 원형 버튼은 드래그로 이동하고 화면 밖으로 나가지 않습니다. Alt+방향키로도 이동합니다. 위치는 열린 페이지 내에서만 유지합니다. 기능 메뉴는 한 줄 소개 뒤 PDF 업로드·화면 캡쳐하기로 분리했습니다. 캡쳐는 현재 뷰포트 → 영역 선택 → 미리보기 → 가져오기 → 선택적 OCR 순서입니다. 원본 화면과 선택 이미지는 외부 AI로 전송하지 않습니다. 영구 이미지 저장은 없습니다.

캡쳐는 activeTab 권한을 사용합니다. 도우미 표시 권한만 있고 캡쳐 권한이 없는 경우 상단 확장 아이콘의 ‘현재 화면 캡쳐하기’로 시작하도록 안내합니다. 전체 사이트 표시는 선택 권한으로 최초 승인을 받습니다. 로컬 PDF는 별도 파일 URL 접근 허용 후 도우미를 표시합니다. 캡쳐 중 화면 크기가 바뀌면 좌표 오류를 피하기 위해 취소합니다.

텍스트·PDF·이미지·캡쳐 분석은 Cloudflare Worker를 통해 Claude API에 연결됩니다. 파일/캡쳐 원본은 사용자 동의 뒤 전송합니다. 현재 샘플은 성능 측정 자료가 아닙니다. 목록은 Chrome 프로필 `storage.local`에 저장하고, 사용자가 확인한 날짜가 있는 미완료 항목은 Google Calendar에 수동 동기화할 수 있습니다. 알림은 미구현입니다.

## 연결할 위치

1. 완료: `workspace.js`의 `run`과 `review.js`의 ‘할 일 정리하기’가 공통 `api.mjs`를 통해 같은 Worker API를 호출합니다. 전송 동의와 45,000자 제한을 적용하고 응답은 `validateAnalysis` → `makeItems`로 변환합니다. 샘플은 실제 분석 결과로 취급하지 않습니다.
2. 완료: `save`/수동 추가/편집/완료/삭제는 background 직렬화 경로를 통해 `chrome.storage.local`에 저장합니다. 화면 카드/DOM은 저장 원본이 아닙니다.
3. 완료: Google Calendar OAuth와 동기화는 `manifest.json`, `background.js`, `calendar.mjs`에 있습니다. 일정은 연도를 포함한 유효 날짜(명시된 날짜 범위 포함), 할 일은 확인 완료·유효 날짜·미완료 항목만 허용하며 안정적인 이벤트 ID로 반복 동기화 시 기존 일정을 갱신합니다. Google Cloud OAuth 클라이언트 유형/확장 ID 설정과 실제 계정 로그인은 배포 환경에서 검증해야 합니다. 해줌에서 항목 완료/삭제 시 Google Calendar 일정은 자동 삭제하지 않습니다.
4. 알림: 확인된 task만 한국 시간 09:00에 3/1/0일 전 예약. onInstalled/onStartup와 저장 변경 때 재조정. 서비스 워커가 깨어날 때마다 전체 알람 삭제하지 말 것. 날짜 범위/원문 날짜/이미 지난 시각은 검토로 돌릴 것.
5. `background.js`의 `selection` → `review.js`의 `showSelectionReview`가 선택 원문을 페이지 안으로 전달합니다. 캡쳐는 같은 UI를 사용하며 `readCapture`로 OCR 문자열을 받습니다. 새 탭·iframe·`pendingSelection` 전달은 사용하지 않습니다. 원문 출처와 날짜 근거를 실제 AI 결과 모델에 연결해 주세요.

## 데이터 계약

```json
{
  "summary": "문서 요약",
  "tasks": [{"title":"제목","action":"행동","deadline":"2026-11-12","materials":["신청서"],"cost":15000,"submission":"담임 선생님","evidence":"원문 근거","needs_review":false}],
  "schedules": [{"title":"행사","date":"11월 18일","time":"오전 9시","location":null,"details":"행사 설명","evidence":"원문 근거","needs_review":true}]
}
```

각 항목의 원문 날짜는 별도 보존. 연도/발행일이 없는 날짜를 현재 시점만 보고 올해·내년으로 확정하지 않습니다. 영속 모델에는 `id, kind, title, action/details, date, originalDate, materials, cost, submission, evidence, needs_review, confirmed, completed, source, revision, calendarEventId`를 포함합니다. 일정의 시간/장소도 유지합니다. `source.url`은 쿼리/해시를 제외합니다.

권장 서비스 인터페이스: `analyze({text,source,signal})`, `listItems()`, `saveItems(items)`, `updateItem(id,patch,revision)`, `deleteItem(id)`, `syncCalendar(ids)`. 화면에 저장 성공을 표시하는 시점은 실제 쓰기 성공 이후여야 합니다.

## 보안·개인정보

Calendar OAuth 클라이언트 ID는 manifest에 설정되어 있습니다. Google Cloud에서 Calendar API를 활성화하고 Chrome Extension OAuth 클라이언트의 확장 프로그램 ID를 현재 로드한 확장 프로그램 ID와 일치시켜야 합니다. 클라이언트 비밀 값은 확장 프로그램에 넣지 않습니다. Calendar 동기화는 사용자가 직접 실행하며 제목, 날짜, 상세 정보, 근거 및 출처 링크가 Google 계정의 기본 캘린더로 전송됩니다.

AI 제공자 키는 서버 Secret. 확장 번들/저장소에 포함하지 않습니다. 공개 서버는 인증·사용자별/전역 사용량·비용 상한을 갖추고, 항목별 스키마 검증 및 서버 오류 일반화를 적용합니다. 드래그만으로 내용을 전송하지 말고 전송 내용을 확인받습니다. 외부 AI 전송 안내는 실제 제공자와 경유지를 명시합니다. 저장소와 로그에 원문·개인정보·토큰을 남기지 않습니다.

## 완료 검증

- 개인정보 없는 가상 문서 5개를 입력해 기대값/실제 JSON/오류를 제출. 고정 샘플은 정확도 증거로 사용하지 않기.
- 선택 텍스트와 PDF 각각: 분석 → 원문 확인 → 저장 → 탭 닫기/재열기 → 상세 필드 유지.
- 검토 필요 항목은 모든 Calendar/알림 진입점에서 제외되는지 검증.
- 중복 클릭·두 탭·만료 인증·네트워크 실패·재시작 시 데이터 유실/중복이 없는지 검증.
- OCR 실문서/표, 스캔 PDF, 큰 파일, 잘못된 파일은 실제 브라우저에서 별도 검증.
- 접근성: 키보드, 초점, 확대, 상태 안내, 좁은 화면 확인.
