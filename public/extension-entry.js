import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";

window.pdfjsLib = pdfjsLib;

const tesseractScript = document.createElement("script");
tesseractScript.src = new URL("./vendor/tesseract/tesseract.min.js", import.meta.url).href;
tesseractScript.onload = () => import("./app.js");
tesseractScript.onerror = () => {
	const errorState = document.getElementById("error-state");
	const errorMessage = document.getElementById("error-message");
	if (errorMessage) errorMessage.textContent = "로컬 OCR 엔진을 불러오지 못했습니다. 페이지를 새로고침해 주세요.";
	if (errorState) errorState.hidden = false;
};
document.head.appendChild(tesseractScript);