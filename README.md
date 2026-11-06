# 해줌 AI · 화면/사용성 개선 버전 2.6

공지에서 해야 할 일을 확인하는 Chrome Manifest V3 확장 프로그램입니다. 분석 버튼에서 동의하면 원문 텍스트를 Cloudflare Worker를 거쳐 Claude API로 전송합니다. 결과 목록은 현재 화면 메모리에만 유지되며 영구 저장·알림·Google Calendar는 미연결입니다.

**팀 공유 문서:** [PM 구현 범위·수정 이유·팀원 후속 업무](docs/TEAM_HANDOFF.md)

## 이번 버전

- 동그란 h. 버튼을 드래그로 이동하고, 버튼을 가리지 않는 쪽으로 메뉴를 엽니다.
- 상단 팝업은 한 줄 소개와 캡쳐·PDF·선택 내용 가져오기 버튼을 먼저 보여줍니다. 버튼 표시 설정은 접어 둡니다.
- **캡쳐:** 영역 선택 → 미리보기 → 원래 페이지 안에서 이미지·글자 확인. 별도 iframe이나 결과 탭을 열지 않습니다.
- **문장 드래그:** 선택 → 해줌으로 정리 → 원래 페이지 안에서 내용 확인·수정·복사. 드래그만으로 내용을 전송하지 않습니다.
- 캡쳐 이미지는 비율을 유지해 전체 영역을 표시하고 ‘크게 보기’로 펼쳐 볼 수 있습니다.
- PDF·이미지는 로컬 OCR 텍스트로 납작하게 바꾸지 않고 원본 그대로 Claude에 보내 표·행·열 배치를 포함해 분석합니다. PDF는 페이지 수만 로컬에서 확인합니다.
- **문서 정리:** 큰 홍보 영역을 줄여 입력·내용 확인·결과·주요 버튼을 데스크톱 한 화면에 배치합니다. 긴 원문과 결과만 내부에서 스크롤합니다.
- PDF·이미지 파일을 가져와 글자를 읽고, 수작업 샘플 5종으로 결과·편집·내 할 일 흐름을 검토할 수 있습니다.
- 내 할 일의 수정·완료·검색·필터·삭제·JSON 내보내기는 현재 화면의 메모리에서 동작합니다.

샘플은 실제 AI 결과나 정확도 검증 자료가 아닙니다. 새로고침하면 목록이 초기화됩니다. 분석 버튼에서 동의하면 선택한 PDF·이미지·캡쳐 원본 또는 입력한 텍스트가 `https://haezoom.sleepwhale.workers.dev/api/analyze`를 거쳐 Claude로 전송됩니다. 이미지 자체가 전송되므로 개인정보가 없는지 먼저 확인해 주세요. PDF는 20MB·30페이지, 이미지는 5MB까지 지원합니다. 실제 복잡한 문서의 인식 정확도는 아직 측정하지 않았습니다. 직접 PDF·이미지 분석 변경은 로컬 구현이며 운영 Worker에는 아직 배포하지 않았습니다.

![한 화면의 문서 정리](docs/screenshots/01-document.png)
![페이지 안 캡쳐 확인](docs/screenshots/10-inline-capture.png)

## Chrome에 설치 / 업데이트

1. 저장소를 다운로드하거나 clone합니다.
2. `chrome://extensions`에서 개발자 모드를 켭니다.
3. ‘압축해제된 확장 프로그램 로드’에서 **extension 폴더**를 선택합니다.
4. 해줌 아이콘을 고정합니다. 기존 설치는 해줌 카드의 새로고침 버튼으로 업데이트합니다.
5. 팝업의 ‘해줌 버튼 표시 설정’에서 현재 사이트 또는 모든 일반 사이트 모드를 선택하고 필요한 접근 권한을 승인합니다.
6. 기존 페이지에 이전 버튼이 남아 있으면 작성 중인 내용을 보관한 뒤 페이지를 새로고침합니다.

일반 HTTP/HTTPS 사이트를 지원합니다. Chrome 설정·웹스토어 등 제한 페이지와 iframe 내부는 지원하지 않습니다. 로컬 PDF 로고는 확장 상세 설정의 **파일 URL에 대한 액세스 허용**이 필요합니다. 내장 PDF의 내부 선택 문장을 강제로 읽지는 않으므로 캡쳐 또는 파일 업로드를 사용합니다. 캡쳐 권한이 부족하면 상단 확장 아이콘에서 ‘화면 캡쳐하기’로 시작합니다.

## 팀에 넘기기

- [PM 구현 범위와 후속 업무](docs/TEAM_HANDOFF.md)
- [연결 위치·데이터 계약](docs/HANDOFF.md)
- [실제 검증과 미검증 범위](docs/QA.md)
- [디자인 기준](docs/DESIGN.md)

```sh
npm install
npx playwright install chromium
npm test
npm run check
npm run test:browser
node tests/global.mjs
node tests/offscreen.mjs
node tests/pdf.mjs
```

Node 22 이상. 별도 임시 Chromium 프로필에서 검사하며 사용자 Chrome 프로필을 테스트 코드로 열지 않습니다. 확장 자체는 별도 빌드 없이 로드합니다.

## 코드 지도

| 파일 | 역할 |
|---|---|
| extension/popup.* | 간결한 시작 메뉴와 사이트 권한 설정 |
| extension/selection-helper.js | 선택 도우미, 드래그 가능한 원형 버튼·메뉴 |
| extension/capture.js | 화면 선택·미리보기·비율 보존 크롭 |
| extension/review.js | 캡쳐/선택 문장의 공통 페이지 내 확인 창 |
| extension/background.js | 권한·메시지·작업 화면·OCR 처리 조정 |
| extension/capture-processor.* | OCR 전용 offscreen 문서 |
| extension/workspace.* / workspace-layout.css | 문서 정리·샘플 결과·할 일 관리 |
| extension/core.mjs | 날짜/응답 검증과 공통 항목 변환 |
| extension/ocr.mjs | PDF 내장 텍스트 및 이미지 OCR |
| extension/samples.mjs | 가상 문서 5개와 수작업 기대 결과 |

## 출처

기존 `haezoom.crx`에서 PDF.js 6.5.438, Tesseract.js 5.1.1 및 OCR 코어/아이콘을 이어받았습니다. 글꼴은 기존 이편한자막 프로젝트의 Pretendard입니다. 제3자 라이선스는 `extension/vendor/`, `extension/fonts/`에 유지합니다. 원본 CRX의 서버 소스·API 주소·OAuth 식별자·개인정보는 배포물에 넣지 않았습니다.
