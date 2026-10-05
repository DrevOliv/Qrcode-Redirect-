import QRCode from 'qrcode';
import jpeg from 'jpeg-js';

// Kept small on purpose: ~10px per module. Use the SVG when printing large.
const SCALE = 10;
const MARGIN = 2;

export const toSvg = (text) =>
  QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: MARGIN });

export const toPng = (text) =>
  QRCode.toBuffer(text, { type: 'png', errorCorrectionLevel: 'M', margin: MARGIN, scale: SCALE });

export function toJpeg(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const { size, data: modules } = qr.modules;
  const px = (size + MARGIN * 2) * SCALE;
  const data = Buffer.alloc(px * px * 4, 255);

  for (let y = 0; y < px; y++) {
    const my = Math.floor(y / SCALE) - MARGIN;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / SCALE) - MARGIN;
      if (mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx]) {
        const i = (y * px + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return jpeg.encode({ data, width: px, height: px }, 95).data;
}
