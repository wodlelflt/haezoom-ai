const MAX_FILE_SIZE = 20 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const IS_EXTENSION_PAGE = Boolean(globalThis.chrome?.runtime?.getURL);
const API_BASE_URL = IS_EXTENSION_PAGE ? globalThis.HAEZOOM_API_BASE_URL : "";
const elements = Object.fromEntries([
  "file-input", "drop-zone", "document-row", "file-icon", "file-name", "file-meta", "remove-file", "analyze-button",
  "empty-state", "progress-state", "progress-step", "progress-message", "progress-percent", "progress-fill", "progress-detail",
  "error-state", "error-message", "results", "schedule-list", "task-list", "ocr-text", "ocr-character-count",
  "download-json", "settings-toggle", "settings-panel", "settings-close", "settings-refresh", "settings-status", "server-model", "key-indicator", "toast",
  "calendar-actions", "add-calendar-events", "calendar-import-status",
].map((id) => [id, document.getElementById(id)]));

let selectedFile = null;
let extractedResult = null;
let toastTimer;

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = IS_EXTENSION_PAGE
    ? chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs")
    : "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

elements["file-input"].addEventListener("change", (event) => loadFile(event.target.files?.[0]));
elements["remove-file"].addEventListener("click", clearFile);
elements["analyze-button"].addEventListener("click", analyzeDocument);
elements["settings-toggle"].addEventListener("click", toggleSettings);
elements["settings-close"].addEventListener("click", closeSettingsPanel);
elements["settings-refresh"].addEventListener("click", refreshServerStatus);
elements["download-json"].addEventListener("click", downloadResult);
if (IS_EXTENSION_PAGE) {
  elements["add-calendar-events"].addEventListener("click", addResultsToGoogleCalendar);
}
refreshServerStatus();

for (const eventName of ["dragenter", "dragover"]) {
  elements["drop-zone"].addEventListener(eventName, (event) => {
    event.preventDefault();
    elements["drop-zone"].classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements["drop-zone"].addEventListener(eventName, (event) => {
    event.preventDefault();
    elements["drop-zone"].classList.remove("dragging");
  });
}
elements["drop-zone"].addEventListener("drop", (event) => loadFile(event.dataTransfer.files?.[0]));

function loadFile(file) {
  if (!file) return;
  if (!SUPPORTED_TYPES.has(file.type)) {
    showToast("PDF 또는 PNG, JPG, WEBP 파일을 선택해 주세요.");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showToast("파일 크기는 20MB 이하여야 합니다.");
    return;
  }

  selectedFile = file;
  extractedResult = null;
  elements["drop-zone"].hidden = true;
  elements["document-row"].hidden = false;
  elements["file-name"].textContent = file.name;
  elements["file-meta"].textContent = `${formatBytes(file.size)} · ${file.type === "application/pdf" ? "PDF 문서" : "이미지 파일"}`;
  elements["file-icon"].textContent = file.type === "application/pdf" ? "PDF" : "IMG";
  elements["file-icon"].classList.toggle("image", file.type !== "application/pdf");
  elements["analyze-button"].disabled = false;
  showState("empty");
  elements["file-input"].value = "";
}

function clearFile() {
  selectedFile = null;
  extractedResult = null;
  elements["document-row"].hidden = true;
  elements["drop-zone"].hidden = false;
  elements["analyze-button"].disabled = true;
  elements["file-input"].value = "";
  showState("empty");
}

function toggleSettings() {
  const isOpen = !elements["settings-panel"].hidden;
  elements["settings-panel"].hidden = isOpen;
  elements["settings-toggle"].setAttribute("aria-expanded", String(!isOpen));
  if (!isOpen) refreshServerStatus();
}

function closeSettingsPanel() {
  elements["settings-panel"].hidden = true;
  elements["settings-toggle"].setAttribute("aria-expanded", "false");
}

async function refreshServerStatus() {
  elements["settings-status"].textContent = "로컬 서버 연결을 확인하는 중";
  elements["settings-status"].style.color = "";
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    if (!response.ok) throw new Error("로컬 서버에 연결할 수 없습니다.");
    const status = await response.json();
    elements["server-model"].textContent = status.model;
    const configured = status.configured;
    elements["key-indicator"].classList.toggle("ready", configured);
    elements["key-indicator"].setAttribute("aria-label", configured ? "API 키 설정됨" : "API 키 미설정");
    const providerName = status.provider === "gemini" ? "Gemini" : status.provider === "claude" ? "Claude" : "OpenAI";
    elements["settings-status"].textContent = configured
      ? `${providerName} API 키가 설정되어 있습니다.`
      : IS_EXTENSION_PAGE
        ? "Cloudflare 서버의 AI 키 설정을 확인해 주세요."
        : `.env에 ${providerName} API 키를 입력한 뒤 서버를 다시 시작하세요.`;
    if (!configured) elements["settings-status"].style.color = "#b35a37";
    return { ...status, configured };
  } catch {
    elements["server-model"].textContent = "연결 안 됨";
    elements["key-indicator"].classList.remove("ready");
    elements["key-indicator"].setAttribute("aria-label", "로컬 서버 연결 안 됨");
    elements["settings-status"].textContent = "터미널에서 npm start로 로컬 서버를 실행하세요.";
    elements["settings-status"].style.color = "#b35a37";
    return { configured: false };
  }
}

async function analyzeDocument() {
  if (!selectedFile || elements["analyze-button"].disabled) return;
  elements["analyze-button"].disabled = true;
  const serverStatus = await refreshServerStatus();
  if (!serverStatus.configured) {
    elements["analyze-button"].disabled = false;
    elements["settings-panel"].hidden = false;
    elements["settings-toggle"].setAttribute("aria-expanded", "true");
    return;
  }

  showState("progress");
  try {
    const { text, layoutText } = await extractText(selectedFile);
    if (!text.trim()) throw new Error("문서에서 텍스트를 찾지 못했습니다. 선명한 이미지인지 확인해 주세요.");
    setProgress(82, "AI ANALYSIS", "중요 정보를 정리하고 있습니다", "OCR 텍스트와 표의 행·열 정보를 AI에 전달하는 중");
    const result = await analyzeText(text, layoutText);
    extractedResult = { ...result, ocrText: text };
    renderResult(extractedResult);
    showState("results");
  } catch (error) {
    elements["error-message"].textContent = getReadableError(error);
    showState("error");
  } finally {
    elements["analyze-button"].disabled = !selectedFile;
  }
}

async function extractText(file) {
  if (!window.Tesseract) throw new Error("OCR 엔진을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  const workerOptions = {
    logger: (message) => {
      if (message.status === "recognizing text") {
        const percent = 5 + Math.round(message.progress * 70);
        setProgress(percent, "OCR IN PROGRESS", "문서의 글자를 읽고 있습니다", "텍스트 인식 중");
      } else if (message.status === "loading language traineddata") {
        setProgress(3, "LOADING OCR", "한국어 OCR 엔진을 준비하고 있습니다", "처음 실행 시 언어 데이터를 내려받습니다");
      }
    },
  };
  Object.assign(workerOptions, {
    workerBlobURL: false,
    workerPath: IS_EXTENSION_PAGE
      ? chrome.runtime.getURL("vendor/tesseract/worker.min.js")
      : new URL("vendor/tesseract/worker.min.js", import.meta.url).href,
    corePath: IS_EXTENSION_PAGE
      ? chrome.runtime.getURL("vendor/tesseract/tesseract-core-simd-lstm.wasm.js")
      : new URL("vendor/tesseract/tesseract-core-simd-lstm.wasm.js", import.meta.url).href,
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
  });
  const worker = await window.Tesseract.createWorker("kor+eng", 1, workerOptions);
  try {
    if (file.type === "application/pdf") return await extractPdfText(file, worker);
    setProgress(8, "OCR IN PROGRESS", "이미지의 글자를 읽고 있습니다", "텍스트 인식 중");
    const { data } = await worker.recognize(file);
    return {
      text: data.text.trim(),
      layoutText: formatLayoutRows(
        (data.words || []).map((word) => ({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        })),
        1,
      ),
    };
  } finally {
    await worker.terminate();
  }
}

async function extractPdfText(file, worker) {
  if (!window.pdfjsLib) throw new Error("PDF 엔진을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pdf.numPages > 30) throw new Error("PDF는 최대 30페이지까지 분석할 수 있습니다.");
  const pageTexts = [];
  const pageLayouts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.7 });
    const positionedItems = content.items
      .filter((item) => typeof item.str === "string" && item.str.trim() && Array.isArray(item.transform))
      .map((item) => {
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        return {
          text: item.str,
          x,
          y: y - item.height * viewport.scale,
          width: item.width * viewport.scale,
          height: item.height * viewport.scale,
        };
      });
    const embeddedText = positionedItems.map((item) => item.text).join(" ").trim();
    if (embeddedText.length > 35) {
      const formatted = formatLayoutRows(positionedItems, pageNumber, viewport.width);
      pageTexts.push(formatted.text);
      pageLayouts.push(formatted.layoutText);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const { data } = await worker.recognize(canvas);
      const formatted = formatLayoutRows(
        (data.words || []).map((word) => ({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        })),
        pageNumber,
        viewport.width,
      );
      pageTexts.push(`--- ${pageNumber}페이지 ---\n${data.text.trim()}`);
      pageLayouts.push(formatted.layoutText);
      canvas.width = 0;
      canvas.height = 0;
    }
    const progress = 8 + Math.round((pageNumber / pdf.numPages) * 67);
    setProgress(progress, "OCR IN PROGRESS", `${pdf.numPages}페이지 중 ${pageNumber}페이지를 읽고 있습니다`, `PDF ${pageNumber} / ${pdf.numPages}페이지`);
  }
  return {
    text: pageTexts.join("\n\n").trim(),
    layoutText: pageLayouts.filter(Boolean).join("\n\n").trim(),
  };
}

function formatLayoutRows(items, pageNumber, pageWidth) {
  const positionedItems = items
    .filter((item) => typeof item.text === "string" && item.text.trim() && Number.isFinite(item.x) && Number.isFinite(item.y))
    .map((item) => ({
      ...item,
      width: Number.isFinite(item.width) ? item.width : 0,
      height: Number.isFinite(item.height) && item.height > 0 ? item.height : 10,
    }))
    .sort((left, right) => left.y - right.y || left.x - right.x);
  if (!positionedItems.length) return { text: "", layoutText: "" };

  const rows = [];
  for (const item of positionedItems) {
    let row = rows.at(-1);
    if (!row || Math.abs(item.y - row.centerY) > Math.max(4, Math.min(item.height, row.height) * 0.55)) {
      row = { items: [], centerY: item.y, height: item.height };
      rows.push(row);
    }
    row.items.push(item);
    row.centerY = row.items.reduce((total, entry) => total + entry.y, 0) / row.items.length;
    row.height = Math.max(row.height, item.height);
  }

  const pageWidthValue = Number.isFinite(pageWidth) && pageWidth > 0
    ? pageWidth
    : Math.max(...positionedItems.map((item) => item.x + item.width), 1);
  const formattedRows = rows.map((row, index) => {
    const cells = [];
    for (const item of row.items.sort((left, right) => left.x - right.x)) {
      const previous = cells.at(-1);
      const gap = previous ? item.x - previous.right : 0;
      if (!previous || gap > Math.max(6, Math.min(item.height, previous.height) * 0.65)) {
        cells.push({ x: item.x, right: item.x + item.width, height: item.height, text: item.text.trim() });
      } else {
        previous.right = Math.max(previous.right, item.x + item.width);
        previous.text = `${previous.text} ${item.text.trim()}`;
        previous.height = Math.max(previous.height, item.height);
      }
    }
    const parts = cells.map((cell) => {
      const column = Math.max(0, Math.min(100, Math.round((cell.x / pageWidthValue) * 100)));
      return `[x=${column}%] ${cell.text}`;
    });
    return `[행 ${index + 1}] ${parts.join(" | ")}`;
  });

  return {
    text: `--- ${pageNumber}페이지 ---\n${rows.map((row) => row.items.map((item) => item.text.trim()).join(" ")).join("\n")}`,
    layoutText: `--- ${pageNumber}페이지 표·좌표 구조 ---\n${formattedRows.join("\n")}`,
  };
}

async function analyzeText(text, layoutText) {
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, layoutText }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `AI 요청 실패 (${response.status})`);
  return payload.result;
}

function renderResult(result) {
  const scheduleCards = result.schedules.map((schedule) => {
    const card = document.createElement("article");
    card.className = "schedule-card";
    const heading = document.createElement("div");
    heading.className = "task-card-heading";
    const title = document.createElement("h3");
    title.textContent = schedule.title;
    heading.append(title);
    if (schedule.needs_review) {
      const review = document.createElement("span");
      review.className = "review-badge";
      review.textContent = "확인 필요";
      heading.append(review);
    }

    const fields = document.createElement("dl");
    fields.className = "task-fields";
    for (const [labelText, valueText] of [
      ["날짜", schedule.date || "미정"],
      ["시간", schedule.time || "미정"],
      ["장소", schedule.location || "미정"],
      ["내용", schedule.details || "내용 없음"],
      ["근거", schedule.evidence || "근거 없음"],
    ]) {
      const row = document.createElement("div");
      row.className = "task-field";
      const label = document.createElement("dt");
      label.textContent = labelText;
      const value = document.createElement("dd");
      value.textContent = valueText;
      row.append(label, value);
      fields.append(row);
    }
    card.append(heading, fields);
    return card;
  });
  if (!scheduleCards.length) {
    const empty = document.createElement("p");
    empty.className = "task-empty";
    empty.textContent = "문서에서 확인된 일정이 없습니다.";
    scheduleCards.push(empty);
  }
  elements["schedule-list"].replaceChildren(...scheduleCards);

  const taskCards = result.tasks.map((task) => {
    const card = document.createElement("article");
    card.className = "task-card";

    const heading = document.createElement("div");
    heading.className = "task-card-heading";
    const title = document.createElement("h3");
    title.textContent = task.title;
    heading.append(title);
    if (task.needs_review) {
      const review = document.createElement("span");
      review.className = "review-badge";
      review.textContent = "확인 필요";
      heading.append(review);
    }

    const action = document.createElement("p");
    action.className = "task-action";
    action.textContent = task.action;
    const fields = document.createElement("dl");
    fields.className = "task-fields";
    const taskDetails = [
      ["마감일", task.deadline || "미정"],
      ["준비물", task.materials.length ? task.materials.join(", ") : "없음"],
      ["비용", task.cost === null ? "미정" : `${task.cost.toLocaleString("ko-KR")}원`],
      ["제출처", task.submission || "미정"],
      ["근거", task.evidence || "근거 없음"],
    ];
    for (const [labelText, valueText] of taskDetails) {
      const row = document.createElement("div");
      row.className = "task-field";
      const label = document.createElement("dt");
      label.textContent = labelText;
      const value = document.createElement("dd");
      value.textContent = valueText;
      row.append(label, value);
      fields.append(row);
    }

    card.append(heading, action, fields);
    return card;
  });
  if (!taskCards.length) {
    const empty = document.createElement("p");
    empty.className = "task-empty";
    empty.textContent = "문서에서 확인된 할 일이 없습니다.";
    taskCards.push(empty);
  }
  elements["task-list"].replaceChildren(...taskCards);
  if (IS_EXTENSION_PAGE) {
    const calendarEntries = collectCalendarEntries(result);
    const eligibleCount = calendarEntries.filter((entry) => entry.event).length;
    const skippedCount = calendarEntries.length - eligibleCount;
    elements["calendar-actions"].hidden = false;
    elements["add-calendar-events"].disabled = eligibleCount === 0;
    elements["calendar-import-status"].textContent = eligibleCount
      ? `${eligibleCount}개 등록 가능${skippedCount ? ` · ${skippedCount}개는 날짜 확인 또는 검토가 필요해 제외` : ""}`
      : "날짜가 확정된 항목이 없거나 확인이 필요한 항목뿐입니다.";
  }
  elements["ocr-text"].textContent = result.ocrText;
  elements["ocr-character-count"].textContent = `${result.ocrText.length.toLocaleString("ko-KR")}자`;
}

function collectCalendarEntries(result) {
  const schedules = result.schedules.map((schedule) => ({
    kind: "schedule",
    item: schedule,
    event: makeCalendarEvent("schedule", schedule),
  }));
  const tasks = result.tasks.map((task) => ({
    kind: "task",
    item: task,
    event: makeCalendarEvent("task", task),
  }));
  return [...schedules, ...tasks];
}

function makeCalendarEvent(kind, item) {
  if (item.needs_review) return null;
  const dateRange = parseCalendarDateRange(kind === "schedule" ? item.date : item.deadline);
  if (!dateRange) return null;

  const source = selectedFile?.name ? `출처 문서: ${selectedFile.name}` : "";
  const details = kind === "schedule"
    ? [item.details, item.evidence ? `근거: ${item.evidence}` : "", source]
    : [
        item.action ? `할 일: ${item.action}` : "",
        item.materials?.length ? `준비물: ${item.materials.join(", ")}` : "",
        item.cost !== null && item.cost !== undefined ? `비용: ${item.cost.toLocaleString("ko-KR")}원` : "",
        item.submission ? `제출처: ${item.submission}` : "",
        item.evidence ? `근거: ${item.evidence}` : "",
        source,
      ];
  const event = {
    summary: item.title,
    description: [...details.filter(Boolean), "해줌 AI에서 등록"].join("\n\n"),
  };

  if (kind === "schedule" && item.location) event.location = item.location;
  const time = kind === "schedule" && !dateRange.isRange ? parseCalendarTime(item.time) : null;
  if (time) {
    const startDateTime = `${dateRange.start}T${time}:00+09:00`;
    event.start = { dateTime: startDateTime, timeZone: "Asia/Seoul" };
    event.end = {
      dateTime: new Date(Date.parse(startDateTime) + 60 * 60 * 1000).toISOString(),
      timeZone: "Asia/Seoul",
    };
  } else {
    event.start = { date: dateRange.start };
    event.end = { date: dateRange.end };
  }
  return event;
}

function parseCalendarDateRange(value) {
  if (typeof value !== "string") return null;
  const tokens = [...value.matchAll(/20\d{2}\s*(?:년\s*\d{1,2}\s*월\s*\d{1,2}\s*일?|[./-]\s*\d{1,2}\s*[./-]\s*\d{1,2})/g)]
    .map(([token]) => token);
  if (!tokens.length) return null;
  const isRange = /부터|까지|~|～|–|—|\bto\b/i.test(value);
  if (tokens.length > 1 && !isRange) return null;
  const start = parseCalendarDate(tokens[0]);
  const last = parseCalendarDate(tokens.at(-1));
  if (!start || !last || start > last) return null;
  const isDateRange = isRange && tokens.length > 1;
  return {
    start,
    end: addCalendarDays(last, 1),
    isRange: isDateRange,
  };
}

function parseCalendarDate(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\([^)]*\)/g, "").trim();
  const match = normalized.match(/^([0-9]{4})\s*(?:년|[./-])\s*([0-9]{1,2})\s*(?:월|[./-])\s*([0-9]{1,2})\s*일?$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function parseCalendarTime(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(오전|오후)?\s*([0-9]{1,2})(?::([0-9]{2})|시(?:\s*([0-9]{1,2})분?)?)?$/);
  if (!match) return null;
  const [, meridiem, hourText, minuteText, koreanMinuteText] = match;
  let hour = Number(hourText);
  const minute = Number(minuteText || koreanMinuteText || 0);
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "오후" ? 12 : 0);
  } else if (!minuteText || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getCalendarAccessToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else if (!token) {
        reject(new Error("Google Calendar 인증 토큰을 받지 못했습니다."));
      } else {
        resolve(token);
      }
    });
  });
}

async function getCalendarEntryKey(event) {
  const data = new TextEncoder().encode(JSON.stringify(event));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function addResultsToGoogleCalendar() {
  const entries = collectCalendarEntries(extractedResult || { schedules: [], tasks: [] });
  const candidates = entries.filter((entry) => entry.event);
  const skippedCount = entries.length - candidates.length;
  const button = elements["add-calendar-events"];
  button.disabled = true;
  elements["calendar-import-status"].textContent = "Google 계정 연결을 확인하는 중...";

  try {
    const token = await getCalendarAccessToken();
    const stored = await chrome.storage.local.get("haezoomCalendarEventIds");
    const eventIds = stored.haezoomCalendarEventIds || {};
    let createdCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (const candidate of candidates) {
      try {
        const key = await getCalendarEntryKey(candidate.event);
        if (eventIds[key]) {
          duplicateCount += 1;
          continue;
        }
        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(candidate.event),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || response.statusText);
        eventIds[key] = payload.id;
        await chrome.storage.local.set({ haezoomCalendarEventIds: eventIds });
        createdCount += 1;
      } catch (error) {
        console.error("Google Calendar 일정 등록 실패:", error);
        failedCount += 1;
      }
    }

    const summary = [`등록 ${createdCount}개`, `이미 등록 ${duplicateCount}개`];
    if (skippedCount) summary.push(`확인 필요로 제외 ${skippedCount}개`);
    if (failedCount) summary.push(`실패 ${failedCount}개`);
    elements["calendar-import-status"].textContent = summary.join(" · ");
  } catch (error) {
    elements["calendar-import-status"].textContent = `Google Calendar 연결 실패: ${error.message}`;
  } finally {
    button.disabled = candidates.length === 0;
  }
}

function downloadResult() {
  if (!extractedResult) return;
  const file = new Blob([JSON.stringify({ tasks: extractedResult.tasks, schedules: extractedResult.schedules }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selectedFile?.name.replace(/\.[^.]+$/, "") || "document"}-analysis.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function showState(state) {
  elements["empty-state"].hidden = state !== "empty";
  elements["progress-state"].hidden = state !== "progress";
  elements["error-state"].hidden = state !== "error";
  elements["results"].hidden = state !== "results";
}

function setProgress(percent, step, message, detail) {
  elements["progress-step"].textContent = step;
  elements["progress-message"].textContent = message;
  elements["progress-percent"].textContent = `${percent}%`;
  elements["progress-fill"].style.width = `${percent}%`;
  elements["progress-detail"].textContent = detail;
}

function getReadableError(error) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? error.message || error.error || error.reason || JSON.stringify(error)
        : String(error);
  if (message.includes("401")) return IS_EXTENSION_PAGE
    ? "Cloudflare 서버의 AI 인증이 거부됐습니다. Secret 설정을 확인해 주세요."
    : "API 키가 올바르지 않습니다. .env 파일의 키를 확인해 주세요.";
  if (message.includes("429")) return "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  if (message.includes("Failed to fetch")) return IS_EXTENSION_PAGE
    ? "Cloudflare 분석 서버에 연결할 수 없습니다. api-config.js의 주소를 확인해 주세요."
    : "로컬 서버에 연결할 수 없습니다. npm start로 서버를 실행해 주세요.";
  if (message.includes("Network error while fetching")) {
    return `OCR 언어 데이터를 불러오지 못했습니다: ${message}`;
  }
  return message;
}

function cleanText(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showToast(message) {
  elements["toast"].textContent = message;
  elements["toast"].classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements["toast"].classList.remove("visible"), 2800);
}