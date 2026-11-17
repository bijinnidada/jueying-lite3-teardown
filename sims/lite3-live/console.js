// Console overlay: control deck (left), live telemetry (right), tour caption bar.
// Every readout comes from the same pose function that drives the model.
import {GAITS, LEGS, LIMITS, SPEC, G, SUBSYSTEMS, DOCS, JOINTS, BOM} from './kin.js';
import {PHASE_CN} from './mission.js';
import {GAME_KINDS, GAME_PHASE_CN, kindOf} from './game.js';

const DEG = 180 / Math.PI;
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const f0 = (n) => String(Math.round(n));

const GAME_ICONS = {
  ext: '<svg viewBox="0 0 24 24"><path d="M9.5 8.5h5V20h-5z M12 8.5V5.5 M10 5.5h4 M14.5 10.5c2.2 0 3.5 1.2 3.5 3.2"/></svg>',
  hyd: '<svg viewBox="0 0 24 24"><path d="M8 20h8 M9.5 20V9.5a2.5 2.5 0 0 1 5 0V20 M6.5 12.5h3 M14.5 12.5h3 M12 7V4.5 M10 4.5h4"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 3.5c2 3 5 5.2 5 8.7a5 5 0 0 1-10 0c0-2.4 1.4-4.4 3-6 .3 1.2 1 2 2 2.5-.2-2 -.3-3.6 0-5.2z"/></svg>',
};

// Screen-space technical-poster atmosphere: concentric blueprint rings + radial
// ticks + crosshairs + degree numerals, over a warm light-pool, grain and vignette.
function atmoMarkup() {
  let bp = '';
  for (const r of [150, 250, 350, 450]) bp += `<circle r="${r}" fill="none" stroke-dasharray="6 7"/>`;
  for (let a = 0; a < 360; a += 15) {
    const rad = a * Math.PI / 180, r1 = 450, r2 = a % 90 === 0 ? 482 : 466;
    bp += `<line x1="${(Math.cos(rad) * r1).toFixed(1)}" y1="${(Math.sin(rad) * r1).toFixed(1)}" x2="${(Math.cos(rad) * r2).toFixed(1)}" y2="${(Math.sin(rad) * r2).toFixed(1)}"/>`;
  }
  for (let a = 45; a < 360; a += 90) {
    const rad = a * Math.PI / 180, cx = Math.cos(rad) * 250, cy = Math.sin(rad) * 250, s = 14;
    bp += `<line x1="${cx - s}" y1="${cy}" x2="${cx + s}" y2="${cy}"/><line x1="${cx}" y1="${cy - s}" x2="${cx}" y2="${cy + s}"/>`;
  }
  for (let a = 0; a < 360; a += 30) {
    const rad = (a - 90) * Math.PI / 180, x = Math.cos(rad) * 497, y = Math.sin(rad) * 497;
    bp += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" stroke="none">${a}°</text>`;
  }
  return `<div class="atmo" aria-hidden="true">
    <svg class="atmo-bp" id="atmo-bp" viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid slice">${bp}</svg>
    <div class="atmo-grain"></div>
    <div class="atmo-vig"></div>
  </div>`;
}

export function createConsole(app, act) {
  const el = document.createElement('div');
  el.className = 'cn';
  el.innerHTML = `
  ${atmoMarkup()}
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
      <span class="chip ex" id="c-explode" hidden>拆解 <b id="c-expct">0</b>%</span>
      <span class="chip sim" id="c-sim" hidden><b id="c-simname">消防巡检</b><u id="c-simphase">进入场景</u></span>
    </div>
    <div class="topbtns">
      <button id="b-game" class="tbtn game" title="搜救挑战 · 选目标让狗自主搜索"><span class="ico">◈</span><em>搜救挑战</em></button>
      <button id="b-sound" class="tbtn on" title="声音开关 (M)"><span class="ico">♪</span><em>声音 开</em></button>
      <button id="b-tour" class="tbtn on" title="自动导览 (T)"><span class="ico">▶</span><em>导览 开</em></button>
      <button id="b-help" class="tbtn" title="快捷键"><span class="ico">?</span></button>
    </div>
  </div>

  <div class="cn-left" id="deck">
    <div class="sec sec-sim">
      <div class="sh"><b>场景模拟</b><span>SCENARIO</span></div>
      <div class="simgrid">
        <button data-sim="game" class="simbtn game"><b>搜救挑战</b><i>RESCUE GAME</i><span>选目标 · 狗自主搜索 · 集齐三类放烟花</span></button>
        <button data-sim="fire" class="simbtn fire"><b>消防巡检</b><i>FIRE PATROL</i><span>仓库通道 · 灭火器 / 消火栓 / 火源</span></button>
        <button data-sim="power" class="simbtn power"><b>电力巡检</b><i>POWER PATROL</i><span>配电室 · 表计 / 红外热斑 / 绝缘子</span></button>
      </div>
      <div class="simrow" id="simrow" hidden>
        <span id="sim-state">巡检中</span>
        <button id="sim-follow" class="sbtn on">跟随相机</button>
        <button id="sim-restart" class="sbtn">重跑</button>
        <button id="sim-exit" class="sbtn">退出</button>
      </div>
      <div class="gameboard" id="gameboard" hidden>
        <div class="ghead"><span id="g-state">选择目标 · 0/3</span><b id="g-timer">0.0s</b></div>
        <div class="gcards">
          ${GAME_KINDS.map((k) => `<button class="gcard" data-target="${k.id}">${GAME_ICONS[k.id]}<b>${k.cn}</b><i>${k.en}</i><u>待搜索</u></button>`).join('')}
        </div>
        <div class="simrow">
          <button id="game-follow" class="sbtn on">跟随相机</button>
          <button id="game-restart" class="sbtn">重开</button>
          <button id="game-exit" class="sbtn">退出</button>
        </div>
      </div>
    </div>
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
      <div class="sh"><b>结构</b><span>STRUCTURE</span></div>
      <label class="slider"><span>拆解程度<b id="v-explode">0%</b></span>
        <input type="range" id="s-explode" min="0" max="100" value="0" step="1" data-k="explode" data-u="%"></label>
      <button id="b-explode" class="xbtn">拆解结构<i>EXPLODE</i></button>
      <div class="sh sub-sh"><b>总成</b><span>ASSEMBLIES</span></div>
      <div class="fgrid" id="focus">
        <button data-f="ALL" class="fbtn on">全部</button>
        ${SUBSYSTEMS.map((s) => `<button data-f="${s.id}" class="fbtn">${s.short}</button>`).join('')}
      </div>
      <div class="toggles" id="struct-modes"><button data-m="turntable" class="tg on">转盘</button></div>
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
        ${LEGS.map((L) => `<div class="jcol"><h>${L.code}<u class="jst st-eng" id="js-${L.id}">结合</u><em>${L.cn}</em></h>${['R', 'H', 'K'].map((j) => `<div class="jrow"><span id="jk-${L.id}-${j}">${j}</span><b id="j-${L.id}-${j}">0</b><i><u id="jb-${L.id}-${j}"></u></i></div>`).join('')}</div>`).join('')}
      </div>
      <div class="jorder" id="jorder">
        ${JOINTS.map((j) => `<button class="jchip" data-p="${j.id}" title="${j.cn} · ${j.range[0]}~${j.range[1]}° · ${j.peak} N·m">${j.id}</button>`).join('')}
      </div>
      <div class="jonote">官方关节顺序 FL→FR→HL→HR · 高亮 = 当前角速度最大</div>
    </div>
    <div class="sec">
      <div class="sh"><b>足端接触</b><span>FOOT CONTACT</span></div>
      <div class="feet" id="feet">
        ${LEGS.map((L) => `<div class="foot" id="f-${L.id}"><i></i><b>${L.code}</b><u><v id="fb-${L.id}"></v></u></div>`).join('')}
      </div>
    </div>
    <div class="sec sec-report" id="sec-report" hidden>
      <div class="sh"><b>巡检报告</b><span>INSPECTION LOG</span><em class="repcount" id="rep-count">0</em></div>
      <div class="repsum" id="rep-sum" hidden></div>
      <div class="replog" id="replog"></div>
    </div>
    <div class="sec sec-tree" id="sec-tree">
      <div class="sh"><b>内部结构</b><span>STRUCTURE BOM</span></div>
      <div class="tree" id="tree">
        ${BOM.map((g) => `
        <div class="tgroup${g.id === 'torso' || g.leg === 'FL' ? ' open' : ''}">
          <button class="thead" data-toggle="${g.id}"${g.leg ? ' data-f="legs"' : ''}>
            <i class="caret"></i><b>${g.cn}</b><span>${g.en}</span>
            ${g.leg ? `<em class="st st-eng" id="stl-${g.leg}">结合</em>` : `<em class="tcount">${g.items.length} 件</em>`}
          </button>
          <div class="titems">
            ${g.items.map((it) => `
            <button class="trow" data-p="${it.id}"${it.sub !== 'legs' ? ` data-f="${it.sub}"` : ''}>
              <div class="sname"><b>${it.cn}</b><span>${it.en}${it.mass != null ? ` · ${it.mass} kg` : ''}</span></div>
              <em class="tspec">${it.spec}</em>
              ${it.sub !== 'legs' ? `<em class="st st-eng" id="st-${it.id}">ENGAGED</em>` : ''}
            </button>`).join('')}
          </div>
        </div>`).join('')}
      </div>
      <details class="dims">
        <summary>机身尺寸<span>BODY · OFFICIAL</span></summary>
        <div class="dwrap"><table>${DOCS.body.map((r) => `<tr><td>${r[0]}</td><td class="dv">${r[1]}</td><td class="dn">${r[2]}</td></tr>`).join('')}</table></div>
      </details>
      <details class="dims">
        <summary>腿部尺寸<span>LEG · OFFICIAL</span></summary>
        <div class="dwrap"><table>${DOCS.leg.map((r) => `<tr><td>${r[0]}</td><td class="dv">${r[1]}</td><td class="dn">${r[2]}</td></tr>`).join('')}</table></div>
      </details>
      <div class="dsrcs">数据来源${DOCS.sources.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join('')}</div>
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
    <div class="sec sec-detail" id="sec-detail">
      <div id="detail"></div>
    </div>
  </div>

  <div class="cn-bottom">
    <div class="cap" id="cap"><b id="cap-k"></b><span id="cap-t"></span><span class="cap-sub" id="cap-sub"></span></div>
    <div class="timeline" id="timeline"><i id="tl-fill"></i>${''}<div class="ticks" id="tl-ticks"></div></div>
    <div class="tl-time"><span id="tl-mode">自动导览</span><b id="tl-time">0.0s</b></div>
  </div>

  <canvas class="leaders" id="leaders"></canvas>
  <div class="labels" id="labels"></div>
  <div class="cursor" id="cursor" hidden><i></i></div>
  <div class="toast" id="toast" hidden></div>
  <div class="gend" id="game-end" hidden>
    <div class="gendpanel">
      <div class="sh"><b>搜救完成</b><span>ALL TARGETS FOUND</span></div>
      <div class="gendtime"><b id="ge-time">0.0</b><span>秒总用时</span></div>
      <div class="gendlist" id="ge-list"></div>
      <div class="simrow">
        <button id="ge-again" class="sbtn on">再玩一次</button>
        <button id="ge-exit" class="sbtn">退出挑战</button>
      </div>
    </div>
  </div>
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
        <div><b>E</b>拆解 / 重合</div><div><b>H</b>隐藏界面</div>
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
    exChip: $('#c-explode'), exPct: $('#c-expct'), exBtn: $('#b-explode'),
    capSub: $('#cap-sub'), tree: $('#tree'), detail: $('#detail'), jorder: $('#jorder'),
    secTree: $('#sec-tree'), secDetail: $('#sec-detail'),
    secReport: $('#sec-report'), replog: $('#replog'), repSum: $('#rep-sum'), repCount: $('#rep-count'),
    simRow: $('#simrow'), simState: $('#sim-state'), simFollow: $('#sim-follow'),
    simChip: $('#c-sim'), simName: $('#c-simname'), simPhase: $('#c-simphase'),
    gameBtn: $('#b-game'),
    simGrid: $('.simgrid'), gameboard: $('#gameboard'), gState: $('#g-state'), gTimer: $('#g-timer'),
    gFollow: $('#game-follow'), gEnd: $('#game-end'), geTime: $('#ge-time'), geList: $('#ge-list'),
    deck: $('#deck'), tele: $('#tele'),
    atmoBp: $('#atmo-bp'),
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
      if (k === 'explode') act.explode(v / 100);
      else act.param(k, k === 'speedK' || k === 'heightK' ? v / 100 : v);
    });
  });
  $('#b-explode').addEventListener('click', () => act.explodeToggle());
  $('#modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) act.mode(b.dataset.m, !b.classList.contains('on'));
  });
  $('#isolate').addEventListener('change', (e) => act.isolate(e.target.value));
  $('#focus').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) act.focus(b.dataset.f); });
  $('#tree').addEventListener('click', (e) => {
    const row = e.target.closest('[data-p]');
    if (row) { act.selectPart(row.dataset.p); return; }
    const th = e.target.closest('[data-toggle]');
    if (th) th.closest('.tgroup').classList.toggle('open');
  });
  refs.jorder.addEventListener('click', (e) => { const c = e.target.closest('[data-p]'); if (c) act.selectPart(c.dataset.p); });
  refs.secDetail.addEventListener('click', (e) => { if (e.target.closest('.dclear')) act.clearPart(); });
  $('#struct-modes').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) act.mode(b.dataset.m, !b.classList.contains('on')); });
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
  el.querySelector('.simgrid').addEventListener('click', (e) => { const b = e.target.closest('[data-sim]'); if (b) act.sim(b.dataset.sim); });
  $('#sim-follow').addEventListener('click', () => act.simFollow());
  $('#sim-restart').addEventListener('click', () => act.simRestart());
  $('#sim-exit').addEventListener('click', () => act.simExit());
  refs.gameboard.addEventListener('click', (e) => { const b = e.target.closest('[data-target]'); if (b) act.gamePick(b.dataset.target); });
  refs.gameBtn.addEventListener('click', () => act.gameTop());
  $('#game-follow').addEventListener('click', () => act.gameFollow());
  $('#game-restart').addEventListener('click', () => act.gameRestart());
  $('#game-exit').addEventListener('click', () => act.gameExit());
  $('#ge-again').addEventListener('click', () => act.gameRestart());
  $('#ge-exit').addEventListener('click', () => act.gameExit());
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
    syncControls(P, modes, camName, quality, soundOn, tourOn, ex, exT, focus) {
      ex = ex ?? api._sync?.ex ?? 0;
      exT = exT ?? api._sync?.exT ?? 0;
      focus = focus ?? api._sync?.focus ?? 'ALL';
      el.querySelectorAll('[data-g]').forEach((b) => b.classList.toggle('on', b.dataset.g === P.gait));
      const set = (k, v, u) => { const s = $(`#s-${k}`); if (s) { s.value = v; $(`#v-${k}`).textContent = `${Math.round(v)}${u}`; } };
      set('speedK', P.speedK * 100, '%'); set('heightK', P.heightK * 100, '%');
      set('pitch', P.pitch, '°'); set('roll', P.roll, '°');
      set('explode', ex * 100, '%');
      refs.exBtn.classList.toggle('on', exT > 0.5);
      const exLbl = exT > 0.5 ? 're' : 'ex';
      if (api._exLbl !== exLbl) { api._exLbl = exLbl; refs.exBtn.innerHTML = exLbl === 're' ? '重合结构<i>REASSEMBLE</i>' : '拆解结构<i>EXPLODE</i>'; }
      el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', !!modes[b.dataset.m]));
      $('#isolate').value = modes.isolate || 'ALL';
      el.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === focus));
      el.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === camName));
      $('#quality').value = quality;
      refs.sound.classList.toggle('on', soundOn);
      refs.sound.querySelector('em').textContent = soundOn ? '声音 开' : '声音 关';
      refs.tour.classList.toggle('on', tourOn);
      refs.tour.querySelector('em').textContent = tourOn ? '导览 开' : '导览 关';
      api._sync = {cam: camName, quality, sound: soundOn, tour: tourOn, ex, exT, focus};
    },
    setTicks(beats, duration) {
      refs.tlTicks.innerHTML = beats.map((b) => `<i style="left:${(b.at / duration) * 100}%" title="${b.cn}"></i>`).join('');
    },
    setBlueprint(k, turn = 0) {
      const op = (0.16 + 0.44 * Math.min(1, Math.max(0, k))).toFixed(3);
      const rot = (turn * 0.15 * DEG).toFixed(2);
      const key = op + '|' + rot;
      if (api._bpKey !== key) {
        api._bpKey = key;
        refs.atmoBp.style.opacity = op;
        refs.atmoBp.style.transform = `rotate(${rot}deg)`;
      }
    },
    update(S) {
      const {pose, P, modes, t, fps, tier, battery, tour} = S;
      const focus = S.focus || 'ALL', parts = S.parts || {};
      const ls = api._sync || {cam: 'hero', quality: 'auto', sound: true, tour: false};
      api.syncControls(P, modes, tour ? '' : ls.cam, ls.quality, ls.sound, ls.tour, S.explode, S.explodeTarget, focus);
      api.updateStates(parts, focus, S.explode || 0, S.turnDeg || 0);
      refs.exChip.hidden = !(S.explode > 0.02);
      refs.exPct.textContent = String(Math.round((S.explode || 0) * 100));
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
      api.updateJointOrder(S.jVel);
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
      const exActive = (S.explode || 0) > 0.02;
      refs.cap.classList.toggle('poster', exActive);
      if (S.game) {
        const G = S.game;
        api.updateGame(G);
        refs.cap.classList.add('show');
        refs.capK.textContent = 'RESCUE GAME';
        const T = G.mp.scan ? G.S.targets[G.mp.scan.id] : null;
        refs.capT.textContent = G.phase === 'end' ? '搜救完成 · 烟花庆祝' : T ? `自主搜索 · ${T.cn}` : G.phase === 'hunt' ? '自主搜索' : `选择目标 · ${G.found.length}/3`;
        refs.capSub.hidden = false;
        refs.capSub.textContent = `${G.found.length}/3 TARGETS · ${G.elapsed.toFixed(1)}s`;
        refs.tlFill.style.width = `${(G.found.length / 3) * 100}%`;
        refs.tlTime.textContent = `${G.elapsed.toFixed(1)}s`;
        refs.tlMode.textContent = '搜救挑战';
      } else if (S.mission) {
        const M = S.mission;
        api.updateMission(M);
        refs.cap.classList.add('show');
        refs.capK.textContent = M.S.en;
        const T = M.mp.scan ? M.S.targets[M.mp.scan.id] : null;
        refs.capT.textContent = M.mp.done ? `${M.S.cn}完成 · 上报 ${M.fired} 条` : T ? `${PHASE_CN[M.mp.kind]} · ${T.cn}` : `${M.S.cn} · ${PHASE_CN[M.mp.kind]}`;
        refs.capSub.hidden = false;
        refs.capSub.textContent = `${M.fired}/${M.stops} REPORTS · ${Math.min(100, Math.round((M.t / M.duration) * 100))}%`;
        refs.tlFill.style.width = `${Math.min(100, (M.t / M.duration) * 100)}%`;
        refs.tlTime.textContent = `${M.t.toFixed(1)}s / ${M.duration.toFixed(0)}s`;
        refs.tlMode.textContent = '场景模拟';
      } else if (tour) {
        refs.cap.classList.add('show');
        refs.capK.textContent = tour.kicker || '';
        refs.capT.textContent = tour.caption || '';
        refs.tlFill.style.width = `${(tour.t / tour.duration) * 100}%`;
        refs.tlTime.textContent = `${tour.t.toFixed(1)}s / ${tour.duration}s`;
        refs.tlMode.textContent = '自动导览';
      } else {
        const subName = focus !== 'ALL' ? (SUBSYSTEMS.find((s) => s.id === focus) || {}).cn || '' : '';
        refs.cap.classList.toggle('show', exActive);
        refs.capK.textContent = exActive ? (focus !== 'ALL' ? `${subName} OPEN` : 'TEARDOWN') : '';
        refs.capT.textContent = '';
        refs.tlMode.textContent = '手动控制';
        refs.tlTime.textContent = `${t.toFixed(1)}s`;
        refs.tlFill.style.width = '0%';
      }
    },
    updateStates(parts, focus, ex, turnDeg) {
      const rank = {ENGAGED: 0, DETACHED: 1, OPEN: 2};
      const agg = {};
      for (const id in parts) {
        const p = parts[id];
        if (!p || !p.sub) continue;
        if (!agg[p.sub] || rank[p.state] > rank[agg[p.sub]]) agg[p.sub] = p.state;
      }
      api._stCache = api._stCache || {};
      const setChip = (elx, state, cacheKey, labels) => {
        if (!elx) return;
        const cls = state === 'OPEN' ? 'st-open' : state === 'DETACHED' ? 'st-det' : 'st-eng';
        if (api._stCache[cacheKey] !== state) {
          api._stCache[cacheKey] = state;
          elx.className = elx.className.replace(/\bst-(eng|det|open)\b/g, '').trim() + ' ' + cls;
          elx.textContent = labels[state] || labels.ENGAGED;
        }
      };
      for (const s of SUBSYSTEMS) {
        if (s.id === 'legs') continue;
        setChip($(`#st-${s.id}`), agg[s.id] || 'ENGAGED', 'sub-' + s.id, {ENGAGED: 'ENGAGED', DETACHED: 'DETACHED', OPEN: 'OPEN'});
      }
      for (const L of LEGS) {
        setChip($(`#stl-${L.id}`), (parts[`leg-${L.id}`] || {}).state || 'ENGAGED', 'legc-' + L.id, {ENGAGED: '结合', DETACHED: '分离', OPEN: '打开'});
      }
      const jmap = {R: 'leg', H: 'thigh', K: 'knee'};
      for (const L of LEGS) {
        const lp = parts[`leg-${L.id}`];
        setChip($(`#js-${L.id}`), lp ? lp.state : 'ENGAGED', 'leg-' + L.id, {ENGAGED: '结合', DETACHED: '分离', OPEN: '打开'});
        for (const j of ['R', 'H', 'K']) {
          const pp = parts[`${jmap[j]}-${L.id}`];
          const sp = $(`#jk-${L.id}-${j}`);
          if (sp) sp.classList.toggle('hot', !!(pp && pp.k > 0.5));
        }
      }
      if (ex > 0.02) {
        const pct = Math.round(ex * 100);
        if (focus !== 'ALL') {
          const subName = (SUBSYSTEMS.find((s) => s.id === focus) || {}).cn || '';
          refs.capSub.textContent = `${subName} OPEN · ${pct}% APART`;
        } else {
          refs.capSub.textContent = `转盘 ${Math.round(turnDeg)}° · ${pct}% APART`;
        }
        refs.capSub.hidden = false;
      } else {
        refs.capSub.hidden = true;
      }
    },
    setMission(m) {
      api._mission = m || null;
      api._game = null;
      refs.gameboard.hidden = true;
      refs.gEnd.hidden = true;
      refs.simGrid.hidden = false;
      refs.secReport.hidden = !m;
      refs.simRow.hidden = !m;
      refs.simChip.hidden = !m;
      refs.simChip.classList.remove('gameon');
      refs.gameBtn.classList.remove('on');
      refs.gameBtn.querySelector('em').textContent = '搜救挑战';
      el.querySelectorAll('[data-sim]').forEach((b) => b.classList.toggle('on', !!m && b.dataset.sim === m.kind));
      if (m) { refs.simName.textContent = m.S.cn; refs.repSum.hidden = true; }
      placeStruct();
    },
    setGame(g) {
      api._game = g || null;
      refs.simGrid.hidden = !!g;
      refs.simRow.hidden = true;
      refs.gameboard.hidden = !g;
      refs.gEnd.hidden = true;
      refs.simChip.hidden = !g;
      refs.simChip.classList.toggle('gameon', !!g);
      refs.gameBtn.classList.toggle('on', !!g);
      refs.gameBtn.querySelector('em').textContent = g ? '退出挑战' : '搜救挑战';
      refs.secReport.hidden = !g;
      el.querySelectorAll('[data-sim]').forEach((b) => b.classList.toggle('on', !!g && b.dataset.sim === 'game'));
      if (g) {
        refs.simName.textContent = '搜救挑战';
        refs.repSum.hidden = true;
        el.querySelectorAll('[data-target]').forEach((c) => {
          const found = g.found.includes(c.dataset.target);
          c.classList.toggle('found', found);
          c.classList.remove('hunting');
          c.disabled = found;
          c.querySelector('u').textContent = found ? '已找到' : '待搜索';
        });
        api.updateGame(g);
      }
      placeStruct();
    },
    gameCard(kind, state) {
      const c = el.querySelector(`[data-target="${kind}"]`);
      if (!c) return;
      c.classList.toggle('hunting', state === 'hunting');
      c.classList.toggle('found', state === 'found');
      c.disabled = state !== 'idle';
      c.querySelector('u').textContent = state === 'found' ? '已找到' : state === 'hunting' ? '搜索中' : '待搜索';
    },
    updateGame(G) {
      const n = G.found.length;
      const target = G.target || (G.hunt ? G.hunt.target : null);
      const scanning = G.mp ? !!G.mp.scan : false;
      refs.gState.textContent = G.phase === 'end' ? '搜救完成 · 3/3' : G.phase === 'hunt' ? `自主搜索 · ${kindOf(target).cn}` : `选择目标 · ${n}/3`;
      refs.gTimer.textContent = `${G.elapsed.toFixed(1)}s`;
      refs.simPhase.textContent = G.phase === 'hunt' && scanning ? '扫描提交' : GAME_PHASE_CN[G.phase];
      refs.gFollow.classList.toggle('on', !G.camFree);
      el.querySelectorAll('[data-target]').forEach((c) => {
        if (G.phase === 'hunt') c.disabled = true;
        else if (!G.found.includes(c.dataset.target)) c.disabled = false;
      });
    },
    gameEnd(G) {
      refs.geTime.textContent = G.elapsed.toFixed(1);
      refs.geList.innerHTML = G.order.map((o, i) => `<i class="${o.k}"><em>${i + 1}</em>${GAME_KINDS.find((k) => k.id === o.k).cn}<u>${o.t.toFixed(1)}s</u></i>`).join('');
      refs.gEnd.hidden = false;
      api.updateGame(G);
    },
    clearReports() {
      refs.replog.innerHTML = '';
      refs.repCount.textContent = '0';
      refs.repSum.hidden = true;
    },
    report(ev, t) {
      const d = document.createElement('div');
      d.className = 'rep ' + ev.sev;
      d.innerHTML = `<i></i><div><b>${ev.report}</b><span>${ev.cn} · ${ev.detail}</span></div><u>${t.toFixed(1)}s</u>`;
      refs.replog.prepend(d);
      refs.repCount.textContent = String(refs.replog.children.length);
    },
    finishMission(m, t) {
      const n = {ok: 0, warn: 0, danger: 0};
      for (const ev of m.events) n[ev.sev]++;
      refs.repSum.hidden = false;
      refs.repSum.innerHTML = `<b>巡检完成</b><span>${m.S.cn} · ${t.toFixed(1)}s · ${m.stops} 个巡检点</span>
        <div class="repnums"><i class="ok">正常 ${n.ok}</i><i class="warn">关注 ${n.warn}</i><i class="danger">告警 ${n.danger}</i></div>`;
    },
    updateMission(M) {
      refs.simPhase.textContent = PHASE_CN[M.mp.kind] || '';
      const at = Math.min(M.stops, M.fired + (M.mp.kind === 'scan' || M.mp.kind === 'report' ? 1 : 0));
      refs.simState.textContent = `${PHASE_CN[M.mp.kind]} · ${at}/${M.stops} 点`;
      refs.simFollow.classList.toggle('on', !M.camFree);
    },
    setSelected(id) {
      api._sel = id || null;
      el.querySelectorAll('[data-p]').forEach((n) => n.classList.toggle('sel', n.dataset.p === id));
      if (id) {
        const row = refs.tree.querySelector(`[data-p="${id}"]`);
        if (row) row.closest('.tgroup').classList.add('open');
      }
      api.renderDetail(id);
    },
    renderDetail(id) {
      const it = id ? BOM.flatMap((g) => g.items.map((x) => ({...x, g}))).find((x) => x.id === id) : null;
      refs.secDetail.classList.toggle('pin', !!it);
      if (!it) {
        refs.detail.innerHTML = `
          <div class="dhead"><b>官方结构参数</b><span>OFFICIAL BOM</span></div>
          <div class="dgrid">
            <div>关节<b>12 · BLDC</b></div><div>单腿<b>1.12 kg</b></div>
            <div>机身 mbody<b>11 kg</b></div><div>整机（含电池）<b>12.2 kg</b></div>
          </div>`;
        return;
      }
      const j = it.joint ? JOINTS.find((x) => x.id === it.joint) : null;
      const src = j ? '关节表' : /Foot$/.test(it.id) ? 'URDF' : '机械结构';
      refs.detail.innerHTML = `
        <div class="dhead"><b>${it.cn}</b><span>${it.en}</span>${j ? `<em class="dframe">${it.id}</em>` : ''}<button class="dclear" title="清除选择">×</button></div>
        <div class="dgrid">
          <div>质量<b>${it.mass != null ? `${it.mass} kg` : '—'}</b></div>
          <div>活动范围<b>${j ? `${j.range[0]} ~ ${j.range[1]}°` : '—'}</b></div>
          <div>额定扭矩<b>${j ? `${j.rated} N·m` : '—'}</b></div>
          <div>峰值扭矩<b>${j ? `${j.peak} N·m` : '—'}</b></div>
          <div>最大转速<b>${j ? `${j.vel} rad/s` : '—'}</b></div>
          <div>规格<b>${it.spec}</b></div>
        </div>
        ${j ? `<div class="dinertia">惯性 kg·mm²<b>${j.inertia.join(' / ')}</b></div>` : ''}
        <p class="ddesc">${it.desc} · 属 ${it.g.cn}</p>
        <em class="dtag">官方开发者文档 · ${src}</em>`;
    },
    updateJointOrder(jVel) {
      let bi = -1, bv = 2; // deg/s: a standing dog highlights nothing
      if (jVel) for (let i = 0; i < jVel.length; i++) if (jVel[i] > bv) { bv = jVel[i]; bi = i; }
      if (api._hotJ === bi) return;
      api._hotJ = bi;
      const chips = refs.jorder.children;
      for (let i = 0; i < chips.length; i++) chips[i].classList.toggle('hot', i === bi);
    },
    drawPhase(pose, P) {
      const cv = refs.phase, W = cv.width, H = cv.height;
      pctx.clearRect(0, 0, W, H);
      const g = GAITS[P.gait] || GAITS.stand;
      const laneH = 20, x0 = 34, w = W - x0 - 8;
      pctx.font = '600 11px "JetBrains Mono", monospace';
      for (let i = 0; i < 4; i++) {
        const y = 6 + i * (laneH + 4);
        pctx.fillStyle = '#6b665e';
        pctx.fillText(LEGS[i].code, 4, y + 14);
        pctx.fillStyle = 'rgba(38,34,28,0.06)';
        pctx.fillRect(x0, y, w, laneH);
        if (g.stride > 0) {
          const off = g.offsets[i];
          for (let rep = -1; rep <= 1; rep++) {
            const s = ((off + rep) % 1 + 1) % 1;
            const sx = x0 + s * w, sw = g.duty * w;
            pctx.fillStyle = pose.legs[i].contact > 0.5 ? '#26221c' : 'rgba(38,34,28,0.30)';
            if (sx + sw <= x0 + w) pctx.fillRect(sx, y + 2, sw, laneH - 4);
            else { pctx.fillRect(sx, y + 2, x0 + w - sx, laneH - 4); pctx.fillRect(x0, y + 2, sx + sw - (x0 + w), laneH - 4); }
          }
        } else {
          pctx.fillStyle = '#26221c';
          pctx.fillRect(x0, y + 2, w, laneH - 4);
        }
      }
      const px = x0 + ((pose.phase % 1) * w);
      pctx.strokeStyle = '#e8481c';
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
      hctx.fillStyle = '#c9dcec'; hctx.fillRect(-c, -c * 2 + py, c * 2, c * 2);
      hctx.fillStyle = '#d6c1a4'; hctx.fillRect(-c, py, c * 2, c * 2);
      hctx.strokeStyle = '#ffffff'; hctx.lineWidth = 2;
      hctx.beginPath(); hctx.moveTo(-c, py); hctx.lineTo(c, py); hctx.stroke();
      hctx.restore();
      hctx.strokeStyle = '#e8481c'; hctx.lineWidth = 2.5;
      hctx.beginPath(); hctx.moveTo(c - 14, c); hctx.lineTo(c - 5, c); hctx.moveTo(c + 5, c); hctx.lineTo(c + 14, c); hctx.moveTo(c, c - 4); hctx.lineTo(c, c + 4); hctx.stroke();
      hctx.strokeStyle = 'rgba(38,34,28,0.25)'; hctx.lineWidth = 2;
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
        const lw = d.offsetWidth || 120;
        // never let the label box sit on top of the part it names
        let left = it.side < 0;
        if (!left && it.x > xMax - lw - 24) left = true;
        else if (left && it.x < xMin + lw + 24) left = false;
        let ly = Math.min(yMax, Math.max(90, it.y));
        for (const u of used) if (Math.abs(u - ly) < 46) ly = u + 46 * Math.sign(ly - u || 1);
        ly = Math.min(yMax, Math.max(90, ly));
        used.push(ly);
        const lx = left ? xMin : Math.max(xMin, xMax - lw);
        d.style.left = lx + 'px';
        d.style.top = (ly - 18) + 'px';
        d.classList.toggle('r', !left);
        const ex = left ? lx + lw + 8 : lx - 8;
        lctx.globalAlpha = it.opacity;
        lctx.strokeStyle = 'rgba(38,34,28,0.75)';
        lctx.lineWidth = 1.5;
        lctx.beginPath();
        lctx.moveTo(ex, ly);
        lctx.lineTo(ex + (it.x - ex) * 0.35, ly);
        lctx.lineTo(it.x, it.y);
        lctx.stroke();
        lctx.fillStyle = '#e8481c';
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
  // narrow screens: the structure tree + detail card become drawer columns
  const mqNarrow = matchMedia('(max-width: 860px)');
  const placeStruct = () => {
    if (mqNarrow.matches) {
      const sim = refs.deck.querySelector('.sec-sim');
      if (api._mission || api._game) refs.deck.insertBefore(refs.secReport, sim.nextSibling);
      else refs.deck.appendChild(refs.secReport);
      refs.deck.appendChild(refs.secTree); refs.deck.appendChild(refs.secDetail);
    } else {
      refs.tele.insertBefore(refs.secTree, refs.tele.querySelector('.imu'));
      if (api._mission || api._game) refs.tele.insertBefore(refs.secReport, refs.tele.firstChild);
      else refs.tele.insertBefore(refs.secReport, refs.secTree);
      refs.tele.appendChild(refs.secDetail);
    }
  };
  mqNarrow.addEventListener('change', placeStruct);
  placeStruct();
  api.setSelected(null);
  return api;
}