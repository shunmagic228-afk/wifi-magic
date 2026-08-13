// On-device OCR (Tesseract.js, fully offline via bundled vendor files).
// Extracts SSID-looking candidate strings from a Wi-Fi settings screenshot.
const OCR = (() => {
  let workerPromise = null;

  // Known Japanese iPhone Wi-Fi screen UI text — never valid SSIDs, always filtered out.
  const UI_BLOCKLIST = [
    '設定', '編集', 'Wi-Fi', 'WiFi', 'ネットワーク', 'マイネットワーク', 'ほかのネットワーク',
    'その他', '接続を確認', '通知', 'しない', 'インターネット共有', '自動接続',
    '詳しい情報', 'パスワード', 'キャンセル', '接続', 'いつも', '一度だけ',
    'NETWORKS', 'OTHER', 'ASK TO JOIN', 'AUTO-JOIN', 'CANCEL', 'JOIN',
    'このネットワークについて', '使用可能なネットワーク', 'ホットスポット',
    '許可', '管理', 'デバイス', '近くの'
  ];

  function getWorker() {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker('eng', 1, {
        workerPath: 'vendor/tesseract/worker.min.js',
        corePath: 'vendor/tesseract/tesseract-core.wasm.js',
        langPath: 'vendor/tesseract/lang',
        gzip: true,
        workerBlobURL: true,
        logger: () => {}
      }).then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1'
        });
        return worker;
      });
    }
    return workerPromise;
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Downscale + grayscale/contrast boost to help OCR on white-card black-text rows.
  // Also crops off the rightmost slice of each row, where the lock/Wi-Fi/info
  // icon cluster lives — left in, Tesseract tends to hallucinate stray
  // characters (e.g. "az@") from those icon shapes and appends them to the
  // SSID text.
  const RIGHT_CROP_RATIO = 0.78; // keep only the left 78% of the image width

  function preprocess(img) {
    const maxW = 1100;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const fullW = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const w = Math.round(fullW * RIGHT_CROP_RATIO);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      0, 0, img.width * RIGHT_CROP_RATIO, img.height,
      0, 0, w, h
    );
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      // simple contrast stretch around mid-gray
      const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
      d[i] = d[i + 1] = d[i + 2] = boosted;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  function isLikelyUiText(line) {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return UI_BLOCKLIST.some(bad => trimmed.includes(bad));
  }

  function isLikelySsid(line) {
    let t = line.trim();
    if (t.length < 2 || t.length > 40) return false;
    if (isLikelyUiText(t)) return false;
    // needs at least one alphanumeric character
    if (!/[A-Za-z0-9぀-ヿ一-鿿]/.test(t)) return false;
    // reject lines that are almost entirely punctuation/symbols
    const alnum = (t.match(/[A-Za-z0-9぀-ヿ一-鿿]/g) || []).length;
    if (alnum / t.length < 0.4) return false;
    return true;
  }

  function cleanLine(line) {
    return line
      .replace(/[|]/g, 'I')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  async function extractSsids(file, onProgress) {
    const img = await loadImageFile(file);
    const canvas = preprocess(img);
    const worker = await getWorker();
    if (onProgress) onProgress('recognizing');
    const { data } = await worker.recognize(canvas);
    const rawText = data.text || '';
    const seen = new Set();
    const candidates = [];
    rawText.split('\n').forEach(raw => {
      const line = cleanLine(raw);
      if (!isLikelySsid(line)) return;
      const key = line.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(line);
    });
    return { candidates, rawText };
  }

  return { extractSsids };
})();
