// Builds a self-contained HTML that reproduces the Group Solar Curtailment
// report (chrome + cards + SVG charts) from a data-<scenario>.json file.
//   node build-html.mjs data-full-day.json index-full-day.html
//   node build-html.mjs data-short.json    index-short.html
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const inArg = process.argv[2] || 'data-full-day.json'
const outArg = process.argv[3] || 'index.html'
const inPath = isAbsolute(inArg) ? inArg : join(here, inArg)
const outPath = isAbsolute(outArg) ? outArg : join(here, outArg)
const data = readFileSync(inPath, 'utf8')

// heroicon-style outline icon
const ic = (d) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Group curtailment — Demo Solar Curtailment Pool</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  :root{
    --dark-blue:#1D1543;--dark-purple:#6245DE;--medium-purple:#9C87F8;--light-purple:#C6C5FF;
    --light-purple-3:#EBE3F7;--beige:#F5F4F2;--beige-2:#D5D3CE;--orange:#FF8500;--green:#16B364;
    --light-green:#CEEFE1;--pink:#DB2777;--text-gray:#696969;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:'Figtree',ui-sans-serif,system-ui,-apple-system,'Helvetica Neue',sans-serif;
    color:var(--dark-blue);background:#fff;-webkit-font-smoothing:antialiased}
  .app{display:flex;min-height:100vh}
  /* sidebar */
  .side{width:272px;flex:0 0 272px;border-right:1px solid #ECEAE6;padding:28px 24px;display:flex;flex-direction:column;gap:26px}
  .brand{display:flex;align-items:center;gap:12px}
  .brand .logo{width:34px;height:34px;border-radius:9px;background:
    conic-gradient(from 210deg,#FFD602,#FF8500 40%,#6245DE 75%,#9C87F8)}
  .brand b{font-weight:700;font-size:15px;line-height:1.15}
  .nav{display:flex;flex-direction:column;gap:5px;margin-top:4px}
  .nav a{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:11px;color:var(--dark-blue);
    text-decoration:none;font-size:14px;font-weight:500}
  .nav a .ic{width:19px;height:19px;flex:0 0 19px;color:var(--text-gray)}
  .nav a.dim{color:#B7B4AE}
  .nav .grp{font-size:11px;letter-spacing:.08em;color:#B7B4AE;font-weight:700;margin:14px 12px 2px}
  .side .foot{margin-top:auto;border-top:1px solid #ECEAE6;padding-top:16px;font-size:13px}
  .side .foot .em{font-weight:600}
  .side .foot .so{color:var(--text-gray);font-size:12px;margin-top:2px}
  /* main */
  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:14px;padding:22px 40px;border-bottom:1px solid #ECEAE6}
  .topbar .lbl{font-size:11px;letter-spacing:.08em;color:var(--text-gray);font-weight:700}
  .selector{display:flex;align-items:center;justify-content:space-between;min-width:230px;border:1px solid var(--beige-2);
    border-radius:12px;padding:11px 14px;font-size:14px;font-weight:500}
  .selector .chev{color:var(--text-gray)}
  .addr{flex:1;display:flex;align-items:center;justify-content:space-between;border:1px solid var(--beige-2);
    border-radius:14px;padding:11px 16px;color:var(--text-gray);font-size:14px}
  .content{padding:26px 40px 60px;max-width:1000px}
  .backrow{display:flex;align-items:center;gap:8px;color:var(--dark-blue);font-size:14px;font-weight:500;margin-bottom:14px}
  .kicker{display:flex;align-items:center;gap:8px;color:var(--orange);font-weight:700;font-size:12px;letter-spacing:.08em;margin-bottom:6px}
  .kicker .dot{width:9px;height:9px;border-radius:50%;background:var(--orange)}
  h1{font-size:34px;font-weight:800;margin:0 0 10px;letter-spacing:-.01em}
  .lede{color:#4a4650;font-size:15px;max-width:640px;margin:0 0 22px;line-height:1.5}
  .card{border:1px solid #ECEAE6;border-radius:22px;padding:22px 24px;margin-bottom:20px;
    box-shadow:0 12px 16px -4px rgba(16,24,40,.05),0 4px 6px -2px rgba(16,24,40,.03)}
  .row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:26px}
  .field .flabel{font-size:13px;font-weight:600;color:var(--text-gray);margin-bottom:7px}
  .seg{display:inline-flex;border:1px solid var(--beige-2);border-radius:12px;overflow:hidden}
  .seg span{padding:9px 16px;font-size:13px;font-weight:600}
  .seg .on{background:var(--dark-purple);color:#fff}
  .seg .off{color:var(--text-gray)}
  .inp{border:1px solid var(--beige-2);border-radius:12px;padding:10px 14px;font-size:14px;font-weight:500;min-width:150px}
  .pill{margin-left:auto;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--beige-2);
    border-radius:14px;padding:11px 18px;font-size:14px;font-weight:600}
  .hint{color:var(--text-gray);font-size:11px;margin:14px 0 0}
  .hsplit{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
  .hsplit h3{font-size:15px;font-weight:700;margin:0 0 4px}
  .hsplit p{color:var(--text-gray);font-size:13px;margin:0}
  .gen{color:var(--text-gray);font-size:12px;margin-top:8px}
  .btns{display:flex;gap:12px}
  .btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--beige-2);border-radius:14px;
    padding:11px 18px;font-size:14px;font-weight:600}
  .btn.dim{color:#B7B4AE}
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-bottom:20px}
  .metric{border:1px solid #ECEAE6;border-radius:20px;padding:20px 22px;
    box-shadow:0 12px 16px -4px rgba(16,24,40,.05),0 4px 6px -2px rgba(16,24,40,.03)}
  .metric .ml{font-size:11px;letter-spacing:.06em;font-weight:700;color:var(--text-gray)}
  .metric .mv{font-size:30px;font-weight:800;margin-top:8px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  thead th{text-align:left;font-size:11px;letter-spacing:.06em;color:var(--text-gray);font-weight:700;
    padding:12px 8px;border-bottom:1px solid #ECEAE6}
  tbody td{padding:16px 8px;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border-bottom:1px solid #F2F1EE}
  tbody tr:last-child td{border-bottom:none}
  .tt{font-weight:700;font-family:'Figtree',sans-serif}
  .tt.inv{color:var(--orange)}
  .tt.adr{color:var(--green)}
  .tt.grp{color:var(--dark-purple)}
  .found{color:var(--text-gray);font-size:13px;margin-bottom:4px}
  .conf{display:inline-flex;align-items:center;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;
    background:var(--light-green);color:var(--green)}
  .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:16px 0 14px}
  .tile{border:1px solid #ECEAE6;border-radius:18px;padding:18px 20px}
  .tile.accent{border-color:rgba(98,69,222,.22);background:rgba(235,227,247,.4)}
  .tile .tl{font-size:11px;letter-spacing:.06em;font-weight:700;color:var(--text-gray)}
  .tile .tv{font-size:24px;font-weight:800;margin-top:6px}
  .tile .ts{font-size:11px;color:var(--text-gray);margin-top:3px}
  .note{color:var(--text-gray);font-size:11px;line-height:1.5;margin:0}
  .chips{display:flex;gap:8px;font-size:11px;font-weight:600}
  .chip{border-radius:999px;padding:5px 12px}
  .chip.p{background:var(--light-purple-3);color:var(--dark-purple)}
  .chip.g{background:#EFEDE9;color:var(--text-gray)}
  .legend{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;margin-top:8px;font-size:12px;color:#3f3b46}
  .legend .li{display:flex;align-items:center;gap:7px}
  .legend .sw{width:16px;height:0;border-top-width:3px;border-top-style:solid}
  .select-block{display:flex;align-items:center;gap:16px}
  .tabs{display:flex;gap:22px;font-size:14px;font-weight:600}
  .tabs .t.dim{color:#B7B4AE}
  .dsel{display:flex;align-items:center;justify-content:space-between;min-width:150px;border:1px solid var(--beige-2);
    border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600}
  .subhdr{color:var(--text-gray);font-size:13px;margin:2px 0 0}
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand"><div class="logo"></div><b>Developer<br/>Playground</b></div>
    <nav class="nav">
      <a>${ic('M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.5a.75.75 0 00.75.75h4.5a.75.75 0 00.75-.75V15a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v5.25c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75V9.75')}Dashboard</a>
      <a>${ic('M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z')}Addresses</a>
      <a>${ic('M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25')}Devices</a>
      <a>${ic('M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5')}Schedules</a>
      <a>${ic('M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z')}Flex</a>
      <a>${ic('M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A2.25 2.25 0 0118.628 21H5.372a2.25 2.25 0 01-2.24-2.493l1.264-12A2.25 2.25 0 016.632 4.5h10.736a2.25 2.25 0 012.24 2.007z')}Orders</a>
      <a class="dim">${ic('M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z')}Reports</a>
      <a>${ic('M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z')}API Console</a>
      <div class="grp">RESOURCES</div>
      <a>${ic('M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z')}What's new</a>
      <a>${ic('M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5')}API reference</a>
      <a>${ic('M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25')}Developer docs</a>
    </nav>
    <div class="foot"><div class="em">kasper@chargee.energy</div><div class="so">Sign out</div></div>
  </aside>

  <main class="main">
    <div class="topbar">
      <span class="lbl">GROUP</span>
      <div class="selector"><span id="grpName"></span><span class="chev">⌄</span></div>
      <span class="lbl">ADDRESS</span>
      <div class="addr"><span>Select an address</span><span class="chev">⌄</span></div>
    </div>

    <div class="content">
      <div class="backrow">← Back</div>
      <div class="kicker"><span class="dot"></span>GROUP</div>
      <h1>Group curtailment</h1>
      <p class="lede">Curtailment activity for the group on a chosen day or date range: every flex schedule and the time period it applied, with its grid target.</p>

      <div class="card">
        <div class="row">
          <div class="field"><div class="flabel">Period</div>
            <div class="seg"><span class="on">Single day</span><span class="off">Date range</span></div></div>
          <div class="field"><div class="flabel">Date</div><div class="inp" id="dateInput"></div></div>
          <div class="pill">&lt;/&gt; Raw + Docs</div>
        </div>
        <p class="hint">Group-level view. Each flex schedule sets a grid target that holds until the next schedule takes over.</p>
      </div>

      <div class="card">
        <div class="hsplit">
          <div><h3>Group curtailment</h3>
            <p>Curtailment activity for the group on a chosen day or date range: every flex schedule and the time period it applied, with its grid target.</p>
            <p class="gen" id="genAt"></p></div>
          <div class="btns"><span class="btn dim">↻ Regenerate</span><span class="btn">⤓ Download CSV</span></div>
        </div>
      </div>

      <div class="metrics" id="metrics"></div>

      <div class="card" id="cardPeriods">
        <div class="found" id="found"></div>
        <table><thead><tr>
          <th>START</th><th>END</th><th>DURATION</th><th>TARGET TYPE</th><th>TARGET</th>
        </tr></thead><tbody id="periods"></tbody></table>
      </div>

      <div class="card" id="cardImpact">
        <div class="hsplit"><h3>Curtailment impact</h3><span class="conf" id="conf"></span></div>
        <div class="tiles" id="tiles"></div>
        <p class="note">Curtailed energy is estimated against a clear-sky solar shape (assuming an NL location), scaled per curtailment period to the group's uncurtailed production around it. The dashed line shows the estimated potential within each period.</p>
      </div>

      <div class="card" id="cardOverview">
        <div class="hsplit">
          <div><h3>Day overview</h3><p class="subhdr" id="overSub"></p></div>
          <div class="chips"><span class="chip p" id="invChip"></span><span class="chip g" id="mtrChip"></span></div>
        </div>
        <div id="overChart"></div>
        <div class="legend" id="overLegend"></div>
        <p class="hint">Group flex aggregation with 1h of context around curtailment, as per-minute averages with a solar min–max band. Use Block detail below for full 1-second resolution.</p>
      </div>

      <div class="card" id="cardDetail">
        <div class="hsplit">
          <div><h3>Block detail</h3><p class="subhdr" id="detSub"></p></div>
          <div class="select-block"><div class="tabs"><span class="t dim">Start block</span><span class="t">End block</span></div>
            <div class="dsel"><span id="detBlockSel"></span><span class="chev">⌄</span></div></div>
        </div>
        <div id="detChart"></div>
        <div class="legend" id="detLegend"></div>
      </div>
    </div>
  </main>
</div>

<script>
const DATA = ${data};
${renderScript()}
</script>
</body>
</html>`

function renderScript() {
  return `
const NS='http://www.w3.org/2000/svg';
const C={solar:'#6245DE',steer:'#9C87F8',delivery:'#FF8500',return:'#16B364',pot:'#DB2777',band:'#6245DE',grid:'#D5D3CE',axis:'#696969'};
function el(t,a){const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;}
function niceCeil(v){if(v<=0)return 0;const m=Math.pow(10,Math.floor(Math.log10(v)));const s=m/2;return Math.ceil(v/s)*s;}
function toMin(iso){const [,hms]=iso.split('T');const[h,m,s]=hms.split(':').map(Number);return h*60+m+(s||0)/60;}
function fmt1(v){return v.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});}

// ---- header + tiles ----
grpName.textContent=DATA.group;
const dmy=ymd=>{const [y,m,d]=ymd.split('-');return d+'/'+m+'/'+y;};
dateInput.textContent=dmy(DATA.date);
{const [d,tm]=DATA.generatedAt.split('T');genAt.textContent='Generated '+dmy(d)+', '+tm;}
const M=DATA.metrics;
metrics.innerHTML=[['CURTAILMENT PERIODS',M.curtailmentPeriods],['TIME CURTAILED',M.timeCurtailed],['TOTAL FLEX SCHEDULES',M.totalFlexSchedules]]
  .map(([l,v])=>'<div class="metric"><div class="ml">'+l+'</div><div class="mv">'+v+'</div></div>').join('');
found.textContent=DATA.periods.length+' results found';
periods.innerHTML=DATA.periods.map(p=>{
  const cls={inverter:'inv',group:'grp',address:'adr'}[p.targetType]||'adr';
  const tlabel={inverter:'Inverter capacity',group:'Group grid',address:'Address grid'}[p.targetType]||p.targetType;
  const d=v=>new Date(v.replace('T',' ')).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');
  return '<tr><td>'+d(p.start)+'</td><td>'+d(p.end)+'</td><td>'+p.durationLabel+'</td><td class="tt '+cls+'">'+tlabel+'</td><td>'+p.target+'</td></tr>';
}).join('');
const I=DATA.impact;
conf.textContent=(I.confidence==='high'?'High':'Low')+' confidence';
tiles.innerHTML=[
  ['CURTAILED',fmt1(I.curtailedKwh)+' kWh','estimated',true],
  ['REDUCTION',I.reductionPct+'%','estimated',true],
  ['POTENTIAL',fmt1(I.potentialKwh)+' kWh','',false],
  ['SOLAR PRODUCED',fmt1(I.producedKwh)+' kWh','',false],
  ['GRID EXPORTED',fmt1(I.exportedKwh)+' kWh','',false],
  ['GRID IMPORTED',fmt1(I.importedKwh)+' kWh','',false],
].map(([l,v,s,a])=>'<div class="tile'+(a?' accent':'')+'"><div class="tl">'+l+'</div><div class="tv">'+v+'</div>'+(s?'<div class="ts">'+s+'</div>':'')+'</div>').join('');
invChip.textContent=DATA.counts.inverters+' solar inverters';
mtrChip.textContent=DATA.counts.meters+' smart meters';
const fmtDT=iso=>new Date(iso.replace('T',' ')).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');
overSub.textContent=fmtDT(DATA.window.start)+' → '+fmtDT(DATA.window.end)+' · curtailment period shaded';
const hmOf=iso=>iso.split('T')[1].slice(0,5);
detSub.textContent=hmOf(DATA.detailWindow.start)+' → '+hmOf(DATA.detailWindow.end)+' · full resolution';
detBlockSel.textContent=DATA.detailBlock;

// ---- chart drawing ----
function drawChart(mount,opts){
  const W=920,H=opts.height||320,mL=54,mR=18,mT=14,mB=40;
  const iw=W-mL-mR, ih=H-mT-mB;
  const [x0,x1]=opts.domain;
  const ymax=niceCeil(opts.ymax*1.1);
  const X=m=>mL+((m-x0)/(x1-x0))*iw;
  const Y=v=>mT+ih-(v/ymax)*ih;
  const svg=el('svg',{viewBox:'0 0 '+W+' '+H,width:'100%',preserveAspectRatio:'xMidYMid meet'});
  // y grid + labels
  const ticks=opts.yticks||5;
  for(let i=0;i<ticks;i++){const v=ymax*i/(ticks-1);const y=Y(v);
    svg.appendChild(el('line',{x1:mL,y1:y,x2:W-mR,y2:y,stroke:C.grid,'stroke-dasharray':'3 3','stroke-width':1}));
    const tx=el('text',{x:mL-10,y:y+4,'text-anchor':'end','font-size':11,fill:C.axis});tx.textContent=Math.round(v);svg.appendChild(tx);}
  const yl=el('text',{x:14,y:mT+ih/2,'font-size':11,fill:C.axis,transform:'rotate(-90 14 '+(mT+ih/2)+')','text-anchor':'middle'});yl.textContent='kW';svg.appendChild(yl);
  // shaded band
  (opts.bands||[]).forEach(b=>{const bx=X(Math.max(b[0],x0)),bx2=X(Math.min(b[1],x1));
    svg.appendChild(el('rect',{x:bx,y:mT,width:Math.max(0,bx2-bx),height:ih,fill:C.band,'fill-opacity':.08,stroke:C.band,'stroke-opacity':.25}));});
  // solar min-max area
  if(opts.bandSeries){const pts=opts.data.filter(d=>d[opts.bandSeries]);
    let up=pts.map(d=>X(d[opts.xk])+','+Y(d[opts.bandSeries][1]));
    let dn=pts.slice().reverse().map(d=>X(d[opts.xk])+','+Y(d[opts.bandSeries][0]));
    svg.appendChild(el('polygon',{points:up.concat(dn).join(' '),fill:C.solar,'fill-opacity':.15,stroke:'none'}));}
  // x ticks
  (opts.xticks||[]).forEach(m=>{const t=el('text',{x:X(m),y:H-mB+20,'text-anchor':'middle','font-size':11,fill:C.axis});t.textContent=opts.xfmt(m);svg.appendChild(t);});
  // lines
  function line(key,color,dashed){
    let d='',pen=false;
    for(const p of opts.data){const v=p[key];
      if(v==null||Number.isNaN(v)){pen=false;continue;}
      d+=(pen?'L':'M')+X(p[opts.xk]).toFixed(1)+' '+Y(v).toFixed(1)+' ';pen=true;}
    svg.appendChild(el('path',{d,fill:'none',stroke:color,'stroke-width':2,'stroke-linejoin':'round',
      ...(dashed?{'stroke-dasharray':'6 5'}:{})}));
  }
  opts.series.forEach(s=>line(s.key,s.color,s.dashed));
  mount.innerHTML='';mount.appendChild(svg);
}

// day overview
const mins=DATA.minutes;
const potMap=I.potentialByMin;
mins.forEach(m=>{m.potential=potMap[m.min]!=null?potMap[m.min]:null;});
const oymax=Math.max(...mins.map(m=>Math.max(m.solarBand[1],m.potential||0,m.solarProduction,m.steerablePowerZeroExport)));
const oxt=[];for(let t=toMin(DATA.window.start);t<=toMin(DATA.window.end)+0.1;t+=(toMin(DATA.window.end)-toMin(DATA.window.start))/14)oxt.push(t);
drawChart(overChart,{
  data:mins,xk:'min',domain:[toMin(DATA.window.start),toMin(DATA.window.end)],ymax:oymax,height:340,
  bands:DATA.curtailment.map(c=>[toMin(c.start),toMin(c.end)]),
  bandSeries:'solarBand',
  xticks:oxt,xfmt:m=>{const h=Math.floor(m/60),mm=Math.round(m%60);return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0');},
  series:[
    {key:'delivery',color:C.delivery},{key:'return',color:C.return},
    {key:'steerablePowerZeroExport',color:C.steer},{key:'solarProduction',color:C.solar},
    {key:'potential',color:C.pot,dashed:true},
  ],
});
overLegend.innerHTML=[
  ['Est. potential (no curtailment)',C.pot,1],['Grid delivery',C.delivery],['Grid return',C.return],
  ['Solar production',C.solar],['Solar production (min–max)',C.solar],['Steerable power (zero export)',C.steer],
].map(([l,c,d])=>'<span class="li"><span class="sw" style="border-top-color:'+c+';border-top-style:'+(d?'dashed':'solid')+'"></span>'+l+'</span>').join('');

// block detail
const det=DATA.detail;
const dymax=Math.max(...det.map(d=>Math.max(d.solarProduction,d.steerablePowerZeroExport,d.delivery,d.return)));
const dxt=[];for(let i=0;i<=11;i++)dxt.push(toMin(DATA.detailWindow.start)+i*(45/11));
drawChart(detChart,{
  data:det,xk:'sec',domain:[0,45*60],ymax:dymax,height:320,
  bands:DATA.curtailment.map(c=>[(toMin(c.start)-toMin(DATA.detailWindow.start))*60,(toMin(c.end)-toMin(DATA.detailWindow.start))*60]),
  xticks:dxt.map(m=>(m-toMin(DATA.detailWindow.start))*60),
  xfmt:sec=>{const tot=Math.round(sec+toMin(DATA.detailWindow.start)*60);const h=Math.floor(tot/3600),mm=Math.floor((tot%3600)/60),ss=tot%60;return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');},
  series:[
    {key:'delivery',color:C.delivery},{key:'return',color:C.return},
    {key:'steerablePowerZeroExport',color:C.steer},{key:'solarProduction',color:C.solar},
  ],
});
detLegend.innerHTML=[
  ['Grid delivery',C.delivery],['Grid return',C.return],['Solar production',C.solar],['Steerable power (zero export)',C.steer],
].map(([l,c])=>'<span class="li"><span class="sw" style="border-top-color:'+c+'"></span>'+l+'</span>').join('');

// ---- crop / slide views -----------------------------------------------------
// ?bare                 chrome-free full report
// ?view=impact|overview|detail|summary|story   isolate a section (tight crop)
// ?slide=1 &view=...    frame the section on a 1600x900 (16:9) slide
// ?room=1               (with slide) leave a right-hand column for text
// ?h=Title              (with slide) add a heading
(function(){
  const q=new URLSearchParams(location.search);
  const bare=q.has('bare'), view=q.get('view'), slide=q.has('slide'), room=q.has('room'), heading=q.get('h');
  if(!(bare||view||slide))return;
  const side=document.querySelector('.side'); if(side)side.style.display='none';
  const top=document.querySelector('.topbar'); if(top)top.style.display='none';
  const groups={impact:['cardImpact'],overview:['cardOverview'],detail:['cardDetail'],summary:['metrics','cardPeriods'],story:['cardImpact','cardOverview']};
  const ids=view?groups[view]:null;
  const content=document.querySelector('.content');
  if(ids){const keep=ids.map(id=>document.getElementById(id)).filter(Boolean);content.innerHTML='';keep.forEach(n=>content.appendChild(n));}

  if(!slide){
    const wide=['overview','detail','story','summary'].includes(view);
    content.style.maxWidth=(wide?'1000px':view?'840px':'1040px');
    content.style.margin='0';content.style.padding='30px';
    if(content.lastElementChild)content.lastElementChild.style.marginBottom='0';
    // expose measured size so the screenshot window can be sized exactly to content
    const r=content.getBoundingClientRect();
    document.title='SIZE:'+Math.ceil(r.width)+'x'+Math.ceil(r.height);
    return;
  }

  const W=1600,H=900,pad=56;
  const stage=document.createElement('div');
  stage.style.cssText='position:relative;width:'+W+'px;height:'+H+'px;overflow:hidden;'+
    'background:linear-gradient(155deg,#F3F0FF 0%,#FFFFFF 58%);'+
    'display:flex;flex-direction:column;justify-content:center;'+(room?'align-items:flex-start;':'align-items:center;')+'padding:'+pad+'px';
  const colW=room?Math.round(W*0.56):(W-2*pad);
  if(heading){const hd=document.createElement('div');hd.style.cssText='font-weight:800;font-size:32px;color:#1D1543;letter-spacing:-.01em;margin-bottom:20px;width:'+colW+'px';hd.textContent=heading;stage.appendChild(hd);}
  const holder=document.createElement('div');holder.style.cssText='width:'+colW+'px';
  (ids||['cardImpact']).forEach(id=>{const n=document.getElementById(id);if(n){n.style.marginBottom='16px';holder.appendChild(n);}});
  if(holder.lastElementChild)holder.lastElementChild.style.marginBottom='0';
  stage.appendChild(holder);
  document.body.innerHTML='';document.body.style.cssText='margin:0;width:'+W+'px;height:'+H+'px';document.body.appendChild(stage);
  const availH=H-2*pad-(heading?52:0);
  const hH=holder.scrollHeight;
  if(hH>availH){
    const s=availH/hH;
    holder.style.transform='scale('+s+')';
    holder.style.transformOrigin=room?'top left':'top center';
    // scaled height now equals availH, so top-align + padding centres it (avoids flex/transform clip)
    stage.style.justifyContent='flex-start';
  }
})();
`
}

writeFileSync(outPath, html)
console.log('wrote', outPath)
