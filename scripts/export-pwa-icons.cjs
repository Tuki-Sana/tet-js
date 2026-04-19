/**
 * icons/generate-icons.html と同じ Canvas 内容を描画し、PWA 用 PNG を書き出す。
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

(async () => {
  const htmlPath = path.join(__dirname, '..', 'icons', 'generate-icons.html');
  const outDir = path.join(__dirname, '..', 'icons');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });

  const blobs = await page.evaluate(() => {
    const c = document.getElementById('c');
    const size = 512;
    function pngBase64(w) {
      const can = document.createElement('canvas');
      can.width = can.height = w;
      const cx = can.getContext('2d');
      cx.drawImage(c, 0, 0, size, size, 0, 0, w, w);
      const url = can.toDataURL('image/png');
      return url.replace(/^data:image\/png;base64,/, '');
    }
    return { b192: pngBase64(192), b512: pngBase64(512) };
  });

  fs.writeFileSync(path.join(outDir, 'icon-192.png'), Buffer.from(blobs.b192, 'base64'));
  fs.writeFileSync(path.join(outDir, 'icon-512.png'), Buffer.from(blobs.b512, 'base64'));

  await browser.close();
  console.log('wrote', path.join(outDir, 'icon-192.png'));
  console.log('wrote', path.join(outDir, 'icon-512.png'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
