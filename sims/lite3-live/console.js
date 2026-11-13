// Console overlay: control deck (left), live telemetry (right), tour caption bar.
// Every readout comes from the same pose function that drives the model.
import {GAITS, LEGS, LIMITS, SPEC, G} from './kin.js';

const DEG = 180 / Math.PI;
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const f0 = (n) => String(Math.round(n));

export function createConsole(app, act) {
  const el = document.createElement('div');
  el.className = 'cn';
  el.innerHTML = `
  <div class="cn-top">
    <div class="brand"><i class="mark"></i>
      <div class="bt"><b>绝影 LITE3</b><span>DEEP ROBOTICS · 四足机器人交互拆解</span></div>
    </div>
    <div class="chips">
      <span class="chip gait"><i></i><b id="c-gait">站立</b></span>
      <span class="chip"><b id="c-speed">0.0</b> m/s</span>
      <span class="chip"><b id="c-support">4</b>/4 支撑</span>
      <span class="chip warn" id="c-limit" hidden>关节限位</span>
      <span class="chip pause" id="c-pause" hidden>已暂停 · 空格恢复</span>
    </div>
    <div class="topbtns">
      <button id="b-sound" class="tbtn on" title="声音开关 (M)"><span class="ico">♪</span><em>声音 开</em></button>
      <button id="b-tour" class="tbtn on" title="自动导览 (T)"><span class="ico">▶</span><em>导览 开</em></button>
      <button id="b-help" class="tbtn" title="快捷键"><span class="ico">?</span></button>
    </div>
  </div>

  <div class="cn-left" id="deck">
    <div class="sec">
      <div class="sh"><b>步态</b><span>GAIT</span></div>
      <div class="gaitgrid" id="gaits">
        ${Object.entries(GAITS).map(([k, g]) => `<button data-g="${k}" class="gbtn${k === 'stand' ? ' on' : ''}">${g.cn}<i>${k.toUpperCase()}</i></button>`).join('')}
        <button data-g="prone" class="gbtn">趴下<i>PRONE</i></button>
        <button data-g="sit" class="gbtn">坐下<i>SIT</i></button>
      </div>
    </div>
    <div class="sec">
      <div class="sh"><b>运动</b><span>MOTION</span></div>
      ${[['speedK', '速度', 0, 100, 42, '%'], ['heightK', '机身高度', 0, 100, 100, '%'], ['pitch', '俯仰', -15, 15, 0, '°'], ['roll', '横滚', -12, 12, 0, '°']].map(([k, cn, a, b, v, u]) => `
      <label class="slider"><span>${cn}<b id="v-${k}">${v}${u}</b></span>
        <input type="range" id="s-${k}" min="${a}" max="${b}" value="${v}" step="1" data-k="${k}" data-u="${u}">
      </label>`).join('')}
    </div>
    <div class="sec">
      <div class="sh"><b>显示</b><span>DISPLAY</span></div>
      <div class="toggles" id="modes">
        <button data-m="cut" class="tg">剖切</button>
        <button data-m="xray" class="tg">透视</button>
        <button data-m="wire" class="tg">线框</button>
        <button data-m="trails" class="tg">足端轨迹</button>
        <button data-m="labels" class="tg">标注</button>
        <button data-m="grid" class="tg on">网格</button>
      </div>
      <label class="selrow"><span>隔离腿部</span>
        <select id="isolate">
          <option value="ALL">全部</option>
          ${LEGS.map((L) => `<option value="${L.id}">${L.cn} ${L.id}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="sec">
      <div class="sh"><b>视角</b><span>CAMERA</span></div>
      <div class="camgrid" id="cams">
        <button data-c="hero" class="cbtn on">三维</button>
        <button data-c="side" class="cbtn">侧视</button>
        <button data-c="front" class="cbtn">正视</button>
        <button data-c="top" class="cbtn">顶视</button>
        <button data-c="leg" class="cbtn">腿部特写</button>
      </div>
    </div>
    <div class="sec">
      <div class="sh"><b>系统</b><span>SYSTEM</span></div>
      <label class="selrow"><span>画质</span>
        <select id="quality"><option value="auto">自动</option><option value="high">高</option><option value="med">中</option><option value="low">低</option></select>
      </label>
      <div class="sysbtns">
        <button id="b-reset" class="sbtn">重置</button>
        <button id="b-rand" class="sbtn">随机姿态</button>
        <button id="b-shot" class="sbtn">导出截图</button>
      </div>
      <div class="fpsrow">渲染 <b id="c-fps">60</b> fps · <span id="c-tier">高画质</span></div>
    </div>
  </div>

  <div class="cn-right" id="tele">
    <div class="sec big">
      <div class="sh"><b>速度</b><span>VELOCITY</span></div>
      <div class="speedrow"><b id="t-speed">0.00</b><span>m/s</span>
        <div class="speedbar"><i id="t-speedbar"></i></div>
      </div>
      <div class="subrow">步频 <b id="t-freq">0.0</b> Hz · 相位 <b id="t-phase">0.00</b></div>
    </div>
    <div class="sec">
      <div class="sh"><b>步态相位</b><span>GAIT PHASE</span></div>
      <canvas id="phase" width="300" height="104"></canvas>
      <div class="legend"><i class="st"></i>支撑 <i class="sw"></i>摆动</div>
    </div>
    <div class="sec sec-joints">
      <div class="sh"><b>关节角度</b><span>12 JOINTS · DEG</span></div>
      <div class="jgrid" id="jgrid">
        ${LEGS.map((L) => `<div class="jcol"><h>${L.id}<em>${L.cn}</em></h>${['R', 'H', 'K'].map((j) => `<div class="jrow"><span>${j}</span><b id="j-${L.id}-${j}">0</b><i><u id="jb-${L.id}-${j}"></u></i></div>`).join('')}</div>`).join('')}
      </div>
    </div>
    <div class="sec">
      <div class="sh"><b>足端接触</b><span>FOOT CONTACT</span></div>
      <div class="feet" id="feet">
        ${LEGS.map((L) => `<div class="foot" id="f-${L.id}"><i></i><b>${L.id}</b><u><v id="fb-${L.id}"></v></u></div>`).join('')}
      </div>
    </div>
    <div class="sec imu">
      <div class="sh"><b>姿态 / 电源</b><span>IMU · POWER</span></div>
      <div class="imurow">
        <canvas id="horizon" width="72" height="72"></canvas>
        <div class="imuvals">
          <div>横滚 <b id="t-roll">0.0°</b></div>
          <div>俯仰 <b id="t-pitch">0.0°</b></div>
          <div>偏航 <b id="t-yaw">0.0°</b></div>
        </div>
        <div class="batt">
          <div class="battbar"><i id="t-batt"></i></div>
          <div><b id="t-battpct">98%</b> · <span id="t-volt">25.9V</span></div>
          <div class="battnote">续航约 <b id="t-runtime">90</b> min</div>
        </div>
      </div>
    </div>
    <div class="sec spec">
      <div class="sh"><b>整机参数</b><span>SPEC</span></div>
      <div class="specgrid">
        <div>站立<b>610×370×445</b>mm</div>
        <div>趴下<b>680×370×175</b>mm</div>
        <div>重量<b>12.2</b>kg</div>
        <div>行走负载<b>5</b>kg</div>
        <div>自由度<b>12</b></div>
        <div>爬坡<b>40°</b></div>
        <div>越障<b>18</b>cm</div>
        <div>控制频率<b>1</b>kHz</div>
      </div>
    </div>
  </div>

  <div class="cn-bottom">
    <div class="cap" id="cap"><b id="cap-k"></b><span id="cap-t"></span></div>
    <div class="timeline" id="timeline"><i id="tl-fill"></i>${''}<div class="ticks" id="tl-ticks"></div></div>
    <div class="tl-time"><span id="tl-mode">自动导览</span><b id="tl-time">0.0s</b></div>
  </div>

  <canvas class="leaders" id="leaders"></canvas>
  <div class="labels" id="labels"></div>
  <div class="cursor" id="cursor" hidden><i></i></div>
  <div class="toast" id="toast" hidden></div>
  <div class="help" id="help" hidden>
    <div class="helpbox">
      <h>操作指南</h>
      <div class="helpgrid">
        <div><b>拖拽</b>旋转视角</div><div><b>滚轮</b>缩放</div>
        <div><b>右键拖拽</b>平移</div><div><b>1–6</b>切换步态</div>
        <div><b>C</b>剖切</div><div><b>X</b>透视</div>
        <div><b>V</b>线框</div><div><b>G</b>足端轨迹</div>
        <div><b>L</b>标注</div><div><b>T</b>自动导览</div>
        <div><b>M</b>声音</div><div><b>0</b>重置视角</div>
        <div><b>空格</b>暂停</div><div><b>F</b>全屏</div>
      </div>
      <p>静止 25 秒后自动恢复导览。任何拖拽、点击或按键立即接管控制。</p>
      <button id="help-close" class="sbtn">关闭</button>
    </div>
  </div>`;
  app.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const refs = {
    gait: $('#c-gait'), speed: $('#c-speed'), support: $('#c-support'), limit: $('#c-limit'),
    tSpeed: $('#t-speed'), tSpeedBar: $('#t-speedbar'), tFreq: $('#t-freq'), tPhase: $('#t-phase'),
    phase: $('#phase'), horizon: $('#horizon'),
    roll: $('#t-roll'), pitch: $('#t-pitch'), yaw: $('#t-yaw'),
    batt: $('#t-batt'), battPct: $('#t-battpct'), volt: $('#t-volt'), runtime: $('#t-runtime'),
    fps: $('#c-fps'), tier: $('#c-tier'),
    capK: $('#cap-k'), capT: $('#cap-t'), cap: $('#cap'),
    tlFill: $('#tl-fill'), tlTicks: $('#tl-ticks'), tlTime: $('#tl-time'), tlMode: $('#tl-mode'),
    leaders: $('#leaders'), labels: $('#labels'), cursor: $('#cursor'), toast: $('#toast'),
    sound: $('#b-sound'), tour: $('#b-tour'),
    deck: $('#deck'), tele: $('#tele'),
  };
  const pctx = refs.phase.getContext('2d');
  const hctx = refs.horizon.getContext('2d');
  const lctx = refs.leaders.getContext('2d');

  // ---- events -------------------------------------------------------------
  $('#gaits').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (b) act.gait(b.dataset.g);
  });
  el.querySelectorAll('input[type=range]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      const v = Number(inp.value);
      $(`#v-${k}`).textContent = `${v}${inp.dataset.u}`;
      act.param(k, k === 'speedK' || k === 'heightK' ? v / 100 : v);
    });
  });
  $('#modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) act.mode(b.dataset.m, !b.classList.contains('on'));
  });
  $('#isolate').addEventListener('change', (e) => act.isolate(e.target.value));
  $('#cams').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (b) act.camera(b.dataset.c);
  });
  $('#quality').addEventListener('change', (e) => act.quality(e.target.value));
  $('#b-reset').addEventListener('click', () => act.reset());
  $('#b-rand').addEventListener('click', () => act.random());
  $('#b-shot').addEventListener('click', () => act.shot());
  refs.sound.addEventListener('click', () => act.sound());
  refs.tour.addEventListener('click', () => act.tour());
  $('#b-help').addEventListener('click', () => { $('#help').hidden = !$('#help').hidden; });
  $('#help-close').addEventListener('click', () => { $('#help').hidden = true; });
  $('#help').addEventListener('click', (e) => { if (e.target === $('#help')) $('#help').hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#help').hidden = true; });

  const labelPool = [];
  let toastTimer = 0;
  const api = {
    el, refs,
    toast(msg) {
      refs.toast.textContent = msg;
      refs.toast.hidden = false;
      refs.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 1600);
    },
    syncControls(P, modes, camName, quality, soundOn, tourOn) {
      el.querySelectorAll('[data-g]').forEach((b) => b.classList.toggle('on', b.dataset.g === P.gait));
      const set = (k, v, u) => { const s = $(`#s-${k}`); if (s) { s.value = v; $(`#v-${k}`).textContent = `${Math.round(v)}${u}`; } };
      set('speedK', P.speedK * 100, '%'); set('heightK', P.heightK * 100, '%');
      set('pitch', P.pitch, '°'); set('roll', P.roll, '°');
      el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', !!modes[b.dataset.m]));
      $('#isolate').value = modes.isolate || 'ALL';
      el.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === camName));
      $('#quality').value = quality;
      refs.sound.classList.toggle('on', soundOn);
      refs.sound.querySelector('em').textContent = soundOn ? '声音 开' : '声音 关';
      refs.tour.classList.toggle('on', tourOn);
      refs.tour.querySelector('em').textContent = tourOn ? '导览 开' : '导览 关';
      api._sync = {cam: camName, quality, sound: soundOn, tour: tourOn};
    },
    setTicks(beats, duration) {
      refs.tlTicks.innerHTML = beats.map((b) => `<i style="left:${(b.at / duration) * 100}%" title="${b.cn}"></i>`).join('');
    },
    update(S) {
      const {pose, P, modes, t, fps, tier, battery, tour} = S;
      const ls = api._sync || {cam: 'hero', quality: 'auto', sound: true, tour: false};
      api.syncControls(P, modes, tour ? '' : ls.cam, ls.quality, ls.sound, ls.tour);
      const gname = P.gait === 'prone' ? '趴下' : P.gait === 'sit' ? '坐下' : (GAITS[P.gait] || GAITS.stand).cn;
      refs.gait.textContent = gname;
      refs.speed.textContent = f1(pose.speed);
      refs.support.textContent = pose.support;
      refs.tSpeed.textContent = pose.speed.toFixed(2);
      refs.tSpeedBar.style.width = `${Math.min(100, (pose.speed / SPEC.vmax) * 100)}%`;
      refs.tFreq.textContent = f1(pose.freq);
      refs.tPhase.textContent = (pose.phase % 1).toFixed(2);
      refs.roll.textContent = `${f1(pose.body.roll * DEG)}°`;
      refs.pitch.textContent = `${f1(pose.body.pitch * DEG)}°`;
      refs.yaw.textContent = `${f1(pose.body.yaw * DEG)}°`;
      refs.batt.style.width = `${battery.pct}%`;
      refs.battPct.textContent = `${Math.round(battery.pct)}%`;
      refs.volt.textContent = `${f1(battery.volt)}V`;
      refs.runtime.textContent = f0(battery.runtime);
      refs.fps.textContent = f0(fps);
      refs.tier.textContent = tier === 'high' ? '高画质' : tier === 'med' ? '中画质' : '低画质';
      // joints
      let limited = false;
      for (let i = 0; i < 4; i++) {
        const L = LEGS[i], j = pose.legs[i].j;
        const names = ['R', 'H', 'K'], lim = [LIMITS.roll, LIMITS.hip, LIMITS.knee];
        for (let k = 0; k < 3; k++) {
          const deg = j[k] * DEG;
          const b = $(`#j-${L.id}-${names[k]}`), bar = $(`#jb-${L.id}-${names[k]}`);
          b.textContent = f0(deg);
          const [a, z] = lim[k];
          bar.style.width = `${Math.min(100, Math.max(0, ((deg - a) / (z - a)) * 100))}%`;
          const near = deg < a + 3 || deg > z - 3;
          b.classList.toggle('lim', near);
          if (near && (P.gait === 'prone' || P.gait === 'sit')) limited = true;
        }
      }
      refs.limit.hidden = !limited;
      // feet
      for (let i = 0; i < 4; i++) {
        const L = LEGS[i], c = pose.legs[i].contact;
        const cell = $(`#f-${L.id}`);
        cell.classList.toggle('on', c > 0.5);
        $(`#fb-${L.id}`).style.height = `${c * 100}%`;
      }
      api.drawPhase(pose, P);
      api.drawHorizon(pose);
      // caption + timeline
      if (tour) {
        refs.cap.classList.add('show');
        refs.capK.textContent = tour.kicker || '';
        refs.capT.textContent = tour.caption || '';
        refs.tlFill.style.width = `${(tour.t / tour.duration) * 100}%`;
        refs.tlTime.textContent = `${tour.t.toFixed(1)}s / ${tour.duration}s`;
        refs.tlMode.textContent = '自动导览';
      } else {
        refs.cap.classList.remove('show');
        refs.tlMode.textContent = '手动控制';
        refs.tlTime.textContent = `${t.toFixed(1)}s`;
        refs.tlFill.style.width = '0%';
      }
    },
    drawPhase(pose, P) {
      const cv = refs.phase, W = cv.width, H = cv.height;
      pctx.clearRect(0, 0, W, H);
      const g = GAITS[P.gait] || GAITS.stand;
      const laneH = 20, x0 = 34, w = W - x0 - 8;
      pctx.font = '600 11px "JetBrains Mono", monospace';
      for (let i = 0; i < 4; i++) {
        const y = 6 + i * (laneH + 4);
        pctx.fillStyle = '#5b6470';
        pctx.fillText(LEGS[i].id, 4, y + 14);
        pctx.fillStyle = 'rgba(20,26,34,0.06)';
        pctx.fillRect(x0, y, w, laneH);
        if (g.stride > 0) {
          const off = g.offsets[i];
          for (let rep = -1; rep <= 1; rep++) {
            const s = ((off + rep) % 1 + 1) % 1;
            const sx = x0 + s * w, sw = g.duty * w;
            pctx.fillStyle = pose.legs[i].contact > 0.5 ? '#12a594' : 'rgba(18,165,148,0.45)';
            if (sx + sw <= x0 + w) pctx.fillRect(sx, y + 2, sw, laneH - 4);
            else { pctx.fillRect(sx, y + 2, x0 + w - sx, laneH - 4); pctx.fillRect(x0, y + 2, sx + sw - (x0 + w), laneH - 4); }
          }
        } else {
          pctx.fillStyle = '#12a594';
          pctx.fillRect(x0, y + 2, w, laneH - 4);
        }
      }
      const px = x0 + ((pose.phase % 1) * w);
      pctx.strokeStyle = '#e8590c';
      pctx.lineWidth = 2;
      pctx.beginPath(); pctx.moveTo(px, 2); pctx.lineTo(px, H - 2); pctx.stroke();
    },
    drawHorizon(pose) {
      const cv = refs.horizon, W = cv.width, H = cv.height, c = W / 2;
      hctx.clearRect(0, 0, W, H);
      hctx.save();
      hctx.beginPath(); hctx.arc(c, c, c - 2, 0, Math.PI * 2); hctx.clip();
      hctx.translate(c, c);
      hctx.rotate(-pose.body.roll);
      const py = pose.body.pitch * DEG * 1.6;
      hctx.fillStyle = '#bcd7ee'; hctx.fillRect(-c, -c * 2 + py, c * 2, c * 2);
      hctx.fillStyle = '#c9b299'; hctx.fillRect(-c, py, c * 2, c * 2);
      hctx.strokeStyle = '#ffffff'; hctx.lineWidth = 2;
      hctx.beginPath(); hctx.moveTo(-c, py); hctx.lineTo(c, py); hctx.stroke();
      hctx.restore();
      hctx.strokeStyle = '#e8590c'; hctx.lineWidth = 2.5;
      hctx.beginPath(); hctx.moveTo(c - 14, c); hctx.lineTo(c - 5, c); hctx.moveTo(c + 5, c); hctx.lineTo(c + 14, c); hctx.moveTo(c, c - 4); hctx.lineTo(c, c + 4); hctx.stroke();
      hctx.strokeStyle = 'rgba(20,26,34,0.25)'; hctx.lineWidth = 2;
      hctx.beginPath(); hctx.arc(c, c, c - 2, 0, Math.PI * 2); hctx.stroke();
    },
    drawLeaders(items, w, h, dpr) {
      const cv = refs.leaders;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, w, h);
      while (labelPool.length < items.length) {
        const d = document.createElement('div');
        d.className = 'lab';
        refs.labels.appendChild(d);
        labelPool.push(d);
      }
      const dr = refs.deck.getBoundingClientRect(), tr = refs.tele.getBoundingClientRect();
      const drawer = dr.top > h * 0.5;
      const sideTele = tr.top < h * 0.5 && tr.left > w * 0.6;
      const xMin = drawer ? 12 : dr.right + 12;
      const xMax = (sideTele ? tr.left : w) - 12;
      const yMax = drawer ? dr.top - 56 : h - 150;
      const used = [];
      items.forEach((it, i) => {
        const d = labelPool[i];
        if (!it || it.opacity <= 0.01 || !it.visible) { d.style.opacity = '0'; return; }
        d.style.opacity = String(it.opacity);
        d.innerHTML = `<b>${it.cn}</b><span>${it.en}</span>`;
        const left = it.side < 0;
        let ly = Math.min(yMax, Math.max(90, it.y));
        for (const u of used) if (Math.abs(u - ly) < 46) ly = u + 46 * Math.sign(ly - u || 1);
        ly = Math.min(yMax, Math.max(90, ly));
        used.push(ly);
        const lw = d.offsetWidth || 120;
        const lx = left ? xMin : Math.max(xMin, xMax - lw);
        d.style.left = lx + 'px';
        d.style.top = (ly - 18) + 'px';
        d.classList.toggle('r', !left);
        const ex = left ? lx + lw + 8 : lx - 8;
        lctx.globalAlpha = it.opacity;
        lctx.strokeStyle = 'rgba(16,122,110,0.85)';
        lctx.lineWidth = 1.5;
        lctx.beginPath();
        lctx.moveTo(ex, ly);
        lctx.lineTo(ex + (it.x - ex) * 0.35, ly);
        lctx.lineTo(it.x, it.y);
        lctx.stroke();
        lctx.fillStyle = '#12a594';
        lctx.beginPath(); lctx.arc(it.x, it.y, 4, 0, Math.PI * 2); lctx.fill();
        lctx.strokeStyle = '#fff'; lctx.lineWidth = 1.5; lctx.stroke();
        lctx.globalAlpha = 1;
      });
      for (let i = items.length; i < labelPool.length; i++) labelPool[i].style.opacity = '0';
    },
    setCursor(x, y, click, visible) {
      refs.cursor.hidden = !visible;
      if (!visible) return;
      refs.cursor.style.transform = `translate(${x}px, ${y}px)`;
      refs.cursor.classList.toggle('click', click);
    },
  };
  return api;
}