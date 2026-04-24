// Renderiza cada página del PDF a canvas y ejecuta OCR con Tesseract.js.
// Si el PDF ya trae texto digital lo devuelve sin OCR (más rápido y preciso).
// Depende de pdfjsLib y Tesseract cargados globalmente.

(function (global) {
  "use strict";

  const RENDER_SCALE = 2.0;      // escala al rasterizar (más escala = mejor OCR, más lento)
  const OCR_LANG = "spa";
  const TEXT_THRESHOLD_CHARS = 40; // si la página digital trae menos de esto, intentamos OCR

  let _worker = null;

  async function getWorker(onLog) {
    if (_worker) return _worker;
    _worker = await Tesseract.createWorker(OCR_LANG, 1, {
      logger: m => {
        if (onLog && m && m.status) onLog(m);
      }
    });
    return _worker;
  }

  async function terminateWorker() {
    if (_worker) {
      try { await _worker.terminate(); } catch (_) { /* noop */ }
      _worker = null;
    }
  }

  async function tryDigitalText(pdfPage) {
    try {
      const tc = await pdfPage.getTextContent();
      const text = tc.items.map(it => it.str).join(" ").trim();
      return text.length >= TEXT_THRESHOLD_CHARS ? text : null;
    } catch (_) {
      return null;
    }
  }

  async function renderPageToCanvas(pdfPage) {
    const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  // Procesa un PDF y devuelve un array de strings (texto por página).
  // onProgress({pageIndex, pageCount, stage, ratio}) es opcional.
  async function ocrPdf(file, onProgress) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    const worker = await getWorker();

    for (let i = 1; i <= pdf.numPages; i++) {
      const pageIndex = i;
      const pageCount = pdf.numPages;
      if (onProgress) onProgress({ pageIndex, pageCount, stage: "abriendo", ratio: 0 });

      const page = await pdf.getPage(i);

      const digital = await tryDigitalText(page);
      if (digital) {
        pages.push(digital);
        if (onProgress) onProgress({ pageIndex, pageCount, stage: "texto digital", ratio: 1 });
        continue;
      }

      if (onProgress) onProgress({ pageIndex, pageCount, stage: "renderizando", ratio: 0.1 });
      const canvas = await renderPageToCanvas(page);

      if (onProgress) onProgress({ pageIndex, pageCount, stage: "OCR", ratio: 0.3 });
      const { data } = await worker.recognize(canvas);
      pages.push(data.text || "");

      // Liberar memoria del canvas.
      canvas.width = 0;
      canvas.height = 0;

      if (onProgress) onProgress({ pageIndex, pageCount, stage: "listo", ratio: 1 });
    }

    return pages;
  }

  global.OcrModule = { ocrPdf, terminateWorker };
})(window);
