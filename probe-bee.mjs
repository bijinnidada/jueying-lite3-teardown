// Study the reference GIF: timed screenshots of native playback + palette histogram.
import {chromium} from 'playwright';
import {writeFileSync} from 'fs';

const GIF = 'file:///C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-out/bee.gif';
const OUT = 'C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-out/';
const browser = await chromium.launch({args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 880, height: 495}});
writeFileSync(OUT + 'bee-view.html', `<body style="margin:0;background:#fff"><img id="g" src="bee.gif" style="display:block;width:880px;height:495px"></body>`);
await page.goto('file:///C:/Users/Administrator/Documents/Qoder/2026-11-13/b1b1c85d/teardown-out/bee-view.html');
await page.waitForFunction(() => document.getElementById('g').complete && document.getElementById('g').naturalWidth > 0);
const times = [0.3, 1.2, 2.2, 3.2, 4.2, 5.2, 6.5, 8, 10, 12];
let prev = 0;
for (const t of times) {
  await page.waitForTimeout((t - prev) * 1000);
  prev = t;
  await page.screenshot({path: `${OUT}bee-f${String(t).replace('.', '_')}.png`});
}
const pal = await page.evaluate(() => {
  const img = document.getElementById('g');
  const cv = document.createElement('canvas');
  cv.width = 880; cv.height = 495;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, 880, 495).data;
  const hist = new Map();
  for (let i = 0; i < d.length; i += 16) {
    const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  return [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, n]) => '#' + k.split(',').map((v) => (parseInt(v) * 16 + 8).toString(16).padStart(2, '0')).join('') + ' ' + n);
});
writeFileSync(OUT + 'bee-palette.txt', pal.join('\n'));
console.log(pal.join('\n'));
await browser.close();