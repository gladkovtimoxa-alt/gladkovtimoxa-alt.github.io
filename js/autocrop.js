// Авто-обрезка/выравнивание кадра документа — геометрия считается в браузере
// (OpenCV.js), фото никуда не отправляется. Если на снимке уверенно нашёлся
// четырёхугольный контур листа — подменяем файл выпрямленным/обрезанным
// вариантом до распознавания (выигрыш в точности OCR автоматический). Не
// нашли уверенно — тихо оставляем кадр как есть, без ошибок пользователю.
(function (global) {
  "use strict";

  function cvReady() {
    return new Promise((resolve) => {
      if (global.cv && global.cv.Mat) return resolve(true);
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (global.cv && global.cv.Mat) { clearInterval(timer); resolve(true); }
        else if (tries > 100) { clearInterval(timer); resolve(false); } // ~20с — opencv.js не подгрузился, не блокируем работу
      }, 200);
    });
  }

  function orderCorners(pts) {
    const sums = pts.map((p) => p.x + p.y);
    const diffs = pts.map((p) => p.x - p.y);
    const tl = pts[sums.indexOf(Math.min(...sums))];
    const br = pts[sums.indexOf(Math.max(...sums))];
    const tr = pts[diffs.indexOf(Math.max(...diffs))];
    const bl = pts[diffs.indexOf(Math.min(...diffs))];
    return [tl, tr, br, bl];
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function findPageQuad(cv, canvas) {
    let src, gray, blur, edges, contours, hierarchy;
    try {
      src = cv.imread(canvas);
      gray = new cv.Mat(); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      blur = new cv.Mat(); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      edges = new cv.Mat(); cv.Canny(blur, edges, 50, 150);
      cv.dilate(edges, edges, cv.Mat.ones(3, 3, cv.CV_8U));
      contours = new cv.MatVector(); hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      const frameArea = canvas.width * canvas.height;
      let best = null, bestArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const peri = cv.arcLength(c, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.02 * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const area = Math.abs(cv.contourArea(approx));
          // лист должен занимать заметную часть кадра — иначе это случайный мелкий контур, не страница
          if (area > frameArea * 0.25 && area > bestArea) {
            bestArea = area;
            const pts = [];
            for (let j = 0; j < 4; j++) pts.push({ x: approx.intPtr(j, 0)[0], y: approx.intPtr(j, 0)[1] });
            best = pts;
          }
        }
        approx.delete(); c.delete();
      }
      return best;
    } finally {
      [src, gray, blur, edges, contours, hierarchy].forEach((m) => m && m.delete && m.delete());
    }
  }

  function warp(cv, bitmap, quad, scale) {
    const pts = orderCorners(quad).map((p) => ({ x: p.x / scale, y: p.y / scale }));
    const [tl, tr, br, bl] = pts;
    const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
    const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
    if (outW < 200 || outH < 200) return null; // подозрительно маленький результат — не доверяем

    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = bitmap.width; fullCanvas.height = bitmap.height;
    fullCanvas.getContext("2d").drawImage(bitmap, 0, 0);

    let fullSrc, srcTri, dstTri, M, dst;
    try {
      fullSrc = cv.imread(fullCanvas);
      srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
      M = cv.getPerspectiveTransform(srcTri, dstTri);
      dst = new cv.Mat();
      cv.warpPerspective(fullSrc, dst, M, new cv.Size(outW, outH));
      const outCanvas = document.createElement("canvas");
      outCanvas.width = outW; outCanvas.height = outH;
      cv.imshow(outCanvas, dst);
      return outCanvas;
    } finally {
      [fullSrc, srcTri, dstTri, M, dst].forEach((m) => m && m.delete && m.delete());
    }
  }

  async function straighten(bitmap) {
    const ok = await cvReady();
    if (!ok) return null;
    const cv = global.cv;
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const small = document.createElement("canvas");
    small.width = Math.round(bitmap.width * scale);
    small.height = Math.round(bitmap.height * scale);
    small.getContext("2d").drawImage(bitmap, 0, 0, small.width, small.height);
    try {
      const quad = findPageQuad(cv, small);
      if (!quad) return null;
      return warp(cv, bitmap, quad, scale);
    } catch (e) {
      console.warn("autocrop: контур не посчитан", e);
      return null;
    }
  }

  async function straightenFile(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const canvas = await straighten(bitmap);
      if (!canvas) return null;
      return await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b ? new File([b], file.name, { type: "image/jpeg" }) : null), "image/jpeg", 0.92);
      });
    } catch (e) {
      console.warn("autocrop: файл не обработан", e);
      return null;
    } finally {
      bitmap && bitmap.close && bitmap.close();
    }
  }

  global.KatiaiAutocrop = { straightenFile };
})(window);
