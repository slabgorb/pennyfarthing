/* Shared chart logic for the Pennyfarthing pipeline-replay benchmark pages.
   State, helpers, and the renderScatter/renderHeatmap/renderPhaseAttr functions are
   extracted verbatim from internal/results/benchmark-dashboard.html. The standalone
   page glue (initData/wireControls/startPanel) at the bottom is the only hand-written
   part — it replaces the dashboard's buildFilters()/renderAll()/loadData() wiring so
   each page renders a single panel. Regenerate the extracted regions from the dashboard. */

// ── State ──
let DATA = null;
const SLICING_DIMS = ['genre','zeitgeist','scrutiny','cooperation_model','conflict_approach','authority_model','formality','intellectual_style','stakes'];
let state = {
  scenario: null,
  models: new Set(),  // populated from data, all active by default
  tiers: new Set(['S','A','B','C','D','U']),
  oceanColor: 'none',
  oceanRole: 'avg',
  dimFilters: {},  // {dimName: selectedValue or ''}
  dimColor: 'none',
  selectedTheme: null,
};

// ── Color scales ──
const oceanColorScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([5, 1]);
const defaultDotColor = '#4fc3f7';

function getOceanValue(themeMeta, trait, role) {
  const ocean = themeMeta.ocean || {};
  if (role === 'avg') {
    const roles = ['tea','dev','reviewer'];
    const vals = roles.map(r => (ocean[r] || {})[trait] || 3);
    return vals.reduce((a,b) => a+b, 0) / vals.length;
  }
  return (ocean[role] || {})[trait] || 3;
}

// Categorical color palette for dimension coloring
const dimCategoryColors = d3.scaleOrdinal(d3.schemeTableau10);

function dotColor(themeMeta) {
  // Dimension-based categorical coloring
  if (state.dimColor !== 'none') {
    const val = (themeMeta.dimensions || {})[state.dimColor] || 'unknown';
    return dimCategoryColors(val);
  }
  if (state.oceanColor === 'none') return defaultDotColor;
  const val = getOceanValue(themeMeta, state.oceanColor, state.oceanRole);
  return oceanColorScale(val);
}

// ── Tooltip ──
const tooltip = d3.select('#tooltip');
function showTooltip(evt, html) {
  tooltip.style('display','block').html(html);
  const tw = tooltip.node().offsetWidth;
  const th = tooltip.node().offsetHeight;
  let x = evt.pageX + 12;
  let y = evt.pageY - 10;
  if (x + tw > window.innerWidth - 20) x = evt.pageX - tw - 12;
  if (y + th > window.innerHeight - 20) y = evt.pageY - th - 10;
  tooltip.style('left', x+'px').style('top', y+'px');
}
function hideTooltip() { tooltip.style('display','none'); }

// ── Prepare theme list ──
function getFilteredThemes() {
  const scenario = DATA.scenarios[state.scenario];
  if (!scenario) return [];
  return Object.entries(scenario.themes)
    .map(([key, val]) => ({ key, ...val }))
    .filter(t => {
      // Control is ALWAYS shown regardless of tier/dim filters
      if (t.key !== 'control') {
        const dims = t.meta.dimensions || {};
        const tier = t.meta.tier || 'D';
        if (!state.tiers.has(tier)) return false;
        for (const dim of SLICING_DIMS) {
          const fval = state.dimFilters[dim];
          if (fval && dims[dim] !== fval) return false;
        }
      }
      return true;
    })
    .map(t => {
      // Filter runs by model
      const filteredRuns = t.runs.filter(r => state.models.has(r.model || 'opus'));
      if (filteredRuns.length === 0) return null;
      // Recompute stats for filtered runs
      const scores = filteredRuns.map(r => r.score_pct);
      const n = scores.length;
      const mean = scores.reduce((a,b) => a+b, 0) / n;
      const std = n > 1 ? Math.sqrt(scores.reduce((s,v) => s + (v-mean)**2, 0) / n) : 0;
      // Recompute finding catch rates
      const findingCatchRates = {};
      for (const r of filteredRuns) {
        for (const f of r.findings) {
          if (!findingCatchRates[f.finding_id]) findingCatchRates[f.finding_id] = {caught:0, total:0, caught_by:{}};
          findingCatchRates[f.finding_id].total++;
          if (f.caught) {
            findingCatchRates[f.finding_id].caught++;
            if (f.caught_by) findingCatchRates[f.finding_id].caught_by[f.caught_by] = (findingCatchRates[f.finding_id].caught_by[f.caught_by]||0)+1;
          }
        }
      }
      // Recompute phase attribution
      const phaseTotals = {tea:0, dev:0, reviewer:0};
      for (const r of filteredRuns) for (const [p,c] of Object.entries(r.caught_by_phase)) phaseTotals[p] = (phaseTotals[p]||0) + c;
      const totalCatches = Object.values(phaseTotals).reduce((a,b)=>a+b,0);
      const phasePct = {};
      if (totalCatches > 0) for (const [p,c] of Object.entries(phaseTotals)) phasePct[p] = +(c/totalCatches*100).toFixed(1);
      return {
        ...t,
        runs: filteredRuns,
        stats: { n, mean: +mean.toFixed(1), std: +std.toFixed(1), min: +Math.min(...scores).toFixed(1), max: +Math.max(...scores).toFixed(1) },
        finding_catch_rates: findingCatchRates,
        phase_attribution: phasePct,
      };
    })
    .filter(Boolean)
    .sort((a,b) => b.stats.mean - a.stats.mean);
}

// ── Scatter ──
function renderScatter() {
  const themes = getFilteredThemes();
  const svg = d3.select('#scatter');
  svg.selectAll('*').remove();

  const container = svg.node().parentNode;
  const width = container.clientWidth - 32;
  const height = Math.min(420, width * 0.55);
  const margin = { top: 30, right: 30, bottom: 45, left: 55 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  svg.attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Scales
  const xExtent = d3.extent(themes, d => d.stats.mean);
  const xPad = Math.max(5, (xExtent[1] - xExtent[0]) * 0.1);
  const x = d3.scaleLinear()
    .domain([Math.max(0, (xExtent[0]||0) - xPad), Math.min(100, (xExtent[1]||100) + xPad)])
    .range([0, w]);

  const consistency = d => d.stats.n > 1 ? 100 - d.stats.std : null;
  const yVals = themes.filter(t => t.stats.n > 1).map(consistency);
  const yExtent = d3.extent(yVals);
  const yPad = Math.max(3, ((yExtent[1]||100) - (yExtent[0]||80)) * 0.15);
  const y = d3.scaleLinear()
    .domain([Math.max(0, (yExtent[0]||80) - yPad), Math.min(100, (yExtent[1]||100) + yPad)])
    .range([h, 0]);

  const rScale = d => Math.max(4, Math.sqrt(d.stats.n) * 5);

  // Axes
  g.append('g').attr('class','axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(-h).tickFormat(d => d+'%'))
    .call(g => g.selectAll('.tick line').attr('stroke', 'var(--grid)'))
    .call(g => g.select('.domain').remove());

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(6).tickSize(-w).tickFormat(d => d.toFixed(0)))
    .call(g => g.selectAll('.tick line').attr('stroke', 'var(--grid)'))
    .call(g => g.select('.domain').remove());

  // Axis labels
  g.append('text').attr('class','axis-label')
    .attr('x', w/2).attr('y', h + 38).attr('text-anchor','middle')
    .text('Mean Weighted Score %');
  g.append('text').attr('class','axis-label')
    .attr('transform','rotate(-90)')
    .attr('x', -h/2).attr('y', -42).attr('text-anchor','middle')
    .text('Consistency (100 - std)');

  // Quadrant lines (at control values)
  const control = themes.find(t => t.key === 'control');
  if (control && control.stats.n > 1) {
    const cx = control.stats.mean;
    const cy = 100 - control.stats.std;
    g.append('line').attr('class','quadrant-line')
      .attr('x1', x(cx)).attr('x2', x(cx)).attr('y1', 0).attr('y2', h);
    g.append('line').attr('class','quadrant-line')
      .attr('x1', 0).attr('x2', w).attr('y1', y(cy)).attr('y2', y(cy));

    // Quadrant overlays
    const qx = x(cx), qy = y(cy);
    const quads = [
      { x: qx, y: 0, w: w - qx, h: qy, color: 'rgba(76,175,80,0.06)', label: 'More Accurate\nMore Consistent', tx: w-8, ty: 16, anchor: 'end' },
      { x: qx, y: qy, w: w - qx, h: h - qy, color: 'rgba(255,183,77,0.06)', label: 'More Accurate\nLess Consistent', tx: w-8, ty: h-8, anchor: 'end' },
      { x: 0, y: 0, w: qx, h: qy, color: 'rgba(144,164,174,0.06)', label: 'Less Accurate\nMore Consistent', tx: 8, ty: 16, anchor: 'start' },
      { x: 0, y: qy, w: qx, h: h - qy, color: 'rgba(239,83,80,0.06)', label: 'Less Accurate\nLess Consistent', tx: 8, ty: h-8, anchor: 'start' },
    ];
    quads.forEach(q => {
      g.append('rect')
        .attr('x', q.x).attr('y', q.y)
        .attr('width', q.w).attr('height', q.h)
        .attr('fill', q.color)
        .attr('pointer-events', 'none');
      const lines = q.label.split('\n');
      lines.forEach((line, li) => {
        g.append('text').attr('class','scatter-quadrant')
          .attr('x', q.tx).attr('y', q.ty + li * 13).attr('text-anchor', q.anchor)
          .text(line);
      });
    });
  }

  // Dots (n>1)
  const multiRun = themes.filter(t => t.stats.n > 1);
  const singleRun = themes.filter(t => t.stats.n === 1);

  // Strip plot dots for selected theme
  function renderStrip(theme) {
    g.selectAll('.strip-dot,.strip-tick').remove();
    if (!theme) return;
    const cy0 = y(consistency(theme));
    const tickH = 10;
    theme.runs.forEach(r => {
      const rx = x(r.score_pct);
      // Vertical tick mark — the primary signal
      g.append('line').attr('class','strip-tick')
        .attr('x1', rx).attr('x2', rx)
        .attr('y1', cy0 - tickH).attr('y2', cy0 + tickH)
        .attr('stroke', 'var(--accent)')
        .attr('stroke-opacity', 0.5)
        .attr('stroke-width', 1);
      // Dot on top for hover target
      g.append('circle').attr('class','strip-dot')
        .attr('cx', rx)
        .attr('cy', cy0 + (Math.random()-0.5)*14)
        .attr('r', 3);
    });
  }

  // Build nodes with true data positions, then use d3-force to separate overlaps
  const nodes = multiRun.map(t => ({
    theme: t,
    r: rScale(t),
    tx: x(t.stats.mean),          // true x
    ty: y(consistency(t)),         // true y
    x: x(t.stats.mean),           // will be adjusted by force
    y: y(consistency(t)),
  }));

  // Run force simulation to nudge overlapping dots apart
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(d => d.tx).strength(0.7))
    .force('y', d3.forceY(d => d.ty).strength(0.7))
    .force('collide', d3.forceCollide(d => d.r + 3).strength(1).iterations(4))
    .stop();
  // Run synchronously — 60 ticks is plenty for convergence
  for (let i = 0; i < 60; i++) sim.tick();

  nodes.forEach(node => {
    const t = node.theme;
    const isControl = t.key === 'control';
    const cx = node.x;
    const cy = node.y;
    const r = node.r;
    const col = dotColor(t.meta);

    // Draw a subtle connector line if dot was nudged away from its true position
    const nudgeDist = Math.hypot(cx - node.tx, cy - node.ty);
    if (nudgeDist > 4) {
      g.append('line')
        .attr('x1', node.tx).attr('y1', node.ty)
        .attr('x2', cx).attr('y2', cy)
        .attr('stroke', col).attr('stroke-opacity', 0.25)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2')
        .attr('pointer-events', 'none');
    }

    if (isControl) {
      const s = r + 2;
      g.append('path')
        .attr('class','scatter-dot')
        .attr('d', `M${cx},${cy-s} L${cx+s},${cy} L${cx},${cy+s} L${cx-s},${cy} Z`)
        .attr('fill', col).attr('fill-opacity', 0.7)
        .attr('stroke', col).attr('stroke-width', 1.5)
        .datum(t)
        .on('mouseover', (evt, d) => showScatterTip(evt, d))
        .on('mouseout', hideTooltip)
        .on('click', (evt, d) => { state.selectedTheme = state.selectedTheme === d.key ? null : d.key; renderStrip(state.selectedTheme ? d : null); });
    } else {
      g.append('circle')
        .attr('class','scatter-dot')
        .attr('cx', cx).attr('cy', cy).attr('r', r)
        .attr('fill', col).attr('fill-opacity', 0.65)
        .attr('stroke', col).attr('stroke-width', 1)
        .datum(t)
        .on('mouseover', (evt, d) => showScatterTip(evt, d))
        .on('mouseout', hideTooltip)
        .on('click', (evt, d) => { state.selectedTheme = state.selectedTheme === d.key ? null : d.key; renderStrip(state.selectedTheme ? d : null); });
    }
  });

  // Labels with collision avoidance (use nudged positions)
  const labelPositions = nodes.map(n => ({
    x: n.x, y: n.y - n.r - 4, name: n.theme.meta.name || n.theme.key,
    nudged: Math.hypot(n.x - n.tx, n.y - n.ty) > 4
  }));
  labelPositions.sort((a,b) => a.x - b.x);
  for (let i = 1; i < labelPositions.length; i++) {
    const prev = labelPositions[i-1];
    const curr = labelPositions[i];
    const dx = Math.abs(curr.x - prev.x);
    const dy = Math.abs(curr.y - prev.y);
    if (dx < 60 && dy < 14) {
      curr.y = prev.y - 14;
    }
  }
  labelPositions.forEach(lp => {
    g.append('text')
      .attr('x', lp.x).attr('y', lp.y)
      .attr('text-anchor','middle')
      .attr('font-size','10px')
      .attr('fill', lp.nudged ? 'var(--text)' : 'var(--text-muted)')
      .text(lp.name);
  });

  // n=1 themes: put at bottom with a note
  singleRun.forEach((t, i) => {
    const cx = x(t.stats.mean);
    const cyPos = h - 10;
    const col = dotColor(t.meta);

    g.append('circle')
      .attr('class','scatter-dot')
      .attr('cx', cx).attr('cy', cyPos).attr('r', 4)
      .attr('fill', col).attr('fill-opacity', 0.4)
      .attr('stroke', col).attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .datum(t)
      .on('mouseover', (evt, d) => showScatterTip(evt, d))
      .on('mouseout', hideTooltip);

    g.append('text').attr('class','n1-badge')
      .attr('x', cx).attr('y', cyPos + 14).attr('text-anchor','middle')
      .text(t.meta.name || t.key);
  });

  if (singleRun.length > 0) {
    g.append('text')
      .attr('x', w).attr('y', h - 22)
      .attr('text-anchor','end')
      .attr('font-size','9px')
      .attr('fill','var(--text-muted)')
      .attr('font-style','italic')
      .text('n=1 themes shown at bottom (insufficient data for consistency)');
  }
}

function showScatterTip(evt, d) {
  const chars = d.meta.characters || {};
  const charsLine = ['tea','dev','reviewer']
    .filter(r => chars[r])
    .map(r => `<span style="color:${r==='tea'?'var(--tea-color)':r==='dev'?'var(--dev-color)':'var(--rev-color)'}">${chars[r]}</span>`)
    .join(' / ');
  const runs = d.runs.map(r => r.score_pct.toFixed(1) + '%').join(', ');
  const html = `
    <div class="tt-name">${d.meta.name || d.key}</div>
    ${charsLine ? `<div style="font-size:11px;margin-bottom:4px">${charsLine}</div>` : ''}
    <div class="tt-row"><span class="tt-label">Mean</span><span class="tt-val mono">${d.stats.mean.toFixed(1)}%</span></div>
    <div class="tt-row"><span class="tt-label">Std</span><span class="tt-val mono">${d.stats.std.toFixed(1)}</span></div>
    <div class="tt-row"><span class="tt-label">n</span><span class="tt-val mono">${d.stats.n}</span></div>
    <div class="tt-row"><span class="tt-label">Tier</span><span class="tt-val">${d.meta.tier || '?'}</span></div>
    <div class="tt-row"><span class="tt-label">Zeitgeist</span><span class="tt-val mono">${d.meta.zeitgeist != null ? d.meta.zeitgeist : '?'}</span></div>
    <div class="tt-row"><span class="tt-label">Genre</span><span class="tt-val">${(d.meta.dimensions||{}).genre || '?'}</span></div>
    <div class="tt-row"><span class="tt-label">Scrutiny</span><span class="tt-val">${(d.meta.dimensions||{}).scrutiny || '—'}</span></div>
    <div class="tt-row"><span class="tt-label">Cooperation</span><span class="tt-val">${(d.meta.dimensions||{}).cooperation_model || '—'}</span></div>
    <div class="tt-row"><span class="tt-label">Conflict</span><span class="tt-val">${(d.meta.dimensions||{}).conflict_approach || '—'}</span></div>
    <div class="tt-row"><span class="tt-label">Authority</span><span class="tt-val">${(d.meta.dimensions||{}).authority_model || '—'}</span></div>
    <div class="tt-row"><span class="tt-label">Formality</span><span class="tt-val">${(d.meta.dimensions||{}).formality || '—'}</span></div>
    <div class="tt-row"><span class="tt-label">Intellect</span><span class="tt-val">${(d.meta.dimensions||{}).intellectual_style || '—'}</span></div>
    <div class="tt-row"><span class="tt-label">Stakes</span><span class="tt-val">${(d.meta.dimensions||{}).stakes || '—'}</span></div>
    <div class="tt-runs">Runs: ${runs}</div>
  `;
  showTooltip(evt, html);
}

// ── Heatmap ──
function renderHeatmap() {
  const themes = getFilteredThemes();
  const scenario = DATA.scenarios[state.scenario];
  if (!scenario) return;

  const findings = scenario.ground_truth || [];
  const svg = d3.select('#heatmap');
  svg.selectAll('*').remove();

  const container = svg.node().parentNode;
  const availWidth = container.clientWidth - 32;

  // Flipped: themes = rows, findings = columns
  const rowH = 22;
  const labelW = 140;  // theme name column
  const colW = Math.max(36, Math.min(52, (availWidth - labelW - 20) / Math.max(findings.length, 1)));
  const headerH = 50;  // space for column headers
  const width = labelW + findings.length * colW + 20;
  const height = headerH + themes.length * rowH + 10;

  svg.attr('width', width).attr('height', height);

  const g = svg.append('g').attr('transform', 'translate(0,0)');

  // Column headers (finding IDs — short, e.g. C1, I1, I2)
  findings.forEach((f, i) => {
    const cx = labelW + i * colW + colW / 2;
    // Finding ID
    g.append('text')
      .attr('class','heatmap-label')
      .attr('x', cx).attr('y', 16)
      .attr('text-anchor','middle')
      .attr('font-size','10px')
      .attr('font-weight','600')
      .attr('fill', f.severity === 'critical' ? '#ef5350' : 'var(--text-secondary)')
      .text(f.id);
    // Weight badge
    g.append('text')
      .attr('x', cx).attr('y', 30)
      .attr('text-anchor','middle')
      .attr('font-size','8px')
      .attr('fill','var(--text-muted)')
      .attr('font-family','"SF Mono", monospace')
      .text(`w${f.weight}`);
    // Tooltip with full title
    g.append('rect')
      .attr('x', cx - colW/2).attr('y', 0)
      .attr('width', colW).attr('height', headerH)
      .attr('fill','transparent')
      .append('title').text(`${f.id}: ${f.title} (weight: ${f.weight})`);
  });

  // Separator line under headers
  g.append('line')
    .attr('x1', labelW).attr('x2', labelW + findings.length * colW)
    .attr('y1', headerH - 8).attr('y2', headerH - 8)
    .attr('stroke','var(--text-muted)').attr('stroke-opacity', 0.3);

  const yOff = headerH;

  // Rows = themes
  themes.forEach((t, ti) => {
    const ry = yOff + ti * rowH;

    // Row label (theme name — horizontal, readable)
    g.append('text')
      .attr('class','heatmap-label')
      .attr('x', labelW - 8)
      .attr('y', ry + rowH/2 + 3)
      .attr('text-anchor','end')
      .attr('font-size','10px')
      .attr('fill', t.key === 'control' ? 'var(--accent)' : 'var(--text-muted)')
      .text(t.meta.name || t.key);

    // Cells = findings
    findings.forEach((f, fi) => {
      const rates = t.finding_catch_rates[f.id];
      const caught = rates ? rates.caught : 0;
      const total = rates ? rates.total : t.stats.n;
      const rate = total > 0 ? caught / total : 0;

      const cx = labelW + fi * colW;

      g.append('rect')
        .attr('class','heatmap-cell')
        .attr('x', cx + 1).attr('y', ry + 1)
        .attr('width', colW - 2).attr('height', rowH - 2)
        .attr('rx', 2)
        .attr('fill', rate > 0 ? d3.interpolateBlues(rate * 0.8 + 0.2) : 'rgba(255,255,255,0.02)')
        .attr('opacity', rate > 0 ? 0.9 : 0.3);

      if (total > 0) {
        g.append('text')
          .attr('class','heatmap-cell-text')
          .attr('x', cx + colW/2).attr('y', ry + rowH/2 + 3)
          .attr('text-anchor','middle')
          .attr('fill', rate > 0.5 ? '#0a0a1a' : 'var(--text-muted)')
          .text(`${caught}/${total}`);
      }
    });
  });

  // Populate finding legend
  const legendEl = document.getElementById('finding-legend');
  if (legendEl && findings.length > 0) {
    legendEl.innerHTML = '<div class="finding-legend-title">Finding Key</div>' +
      findings.map(f =>
        `<div class="finding-legend-item"><span class="finding-legend-id ${f.severity === 'critical' ? 'critical' : ''}">${f.id}</span><span>${f.title} <span style="opacity:0.5">(w${f.weight})</span></span></div>`
      ).join('');
  }
}

// ── Phase Attribution (Histogram) ──
function renderPhaseAttr() {
  const themes = getFilteredThemes();
  const svg = d3.select('#phase-attr');
  svg.selectAll('*').remove();

  const barH = 18;
  const gap = 4;
  const container = svg.node().parentNode;
  const availW = container.clientWidth - 16;

  // Compute per-phase avg catches per run for each theme
  const scenarioData = DATA.scenarios[state.scenario];
  const totalFindings = scenarioData.ground_truth.length;
  const phaseKeys = ['tea', 'dev', 'reviewer'];

  const themeData = themes.map(t => {
    const fcr = t.finding_catch_rates || {};
    const n = t.stats.n || 1;
    const phaseTotals = { tea: 0, dev: 0, reviewer: 0 };
    Object.values(fcr).forEach(f => {
      const cb = f.caught_by || {};
      phaseKeys.forEach(p => { phaseTotals[p] += (cb[p] || 0); });
    });
    const phaseAvg = {};
    phaseKeys.forEach(p => { phaseAvg[p] = phaseTotals[p] / n; });
    const totalAvg = phaseAvg.tea + phaseAvg.dev + phaseAvg.reviewer;
    return { theme: t, phaseAvg, totalAvg };
  });

  // Sort by total avg caught descending
  themeData.sort((a, b) => b.totalAvg - a.totalAvg);

  const maxAvg = Math.max(totalFindings, ...themeData.map(d => d.totalAvg));

  // Measure longest label
  const tempSvg = d3.select(container).append('svg').attr('class','measure-tmp').style('position','absolute').style('visibility','hidden');
  let maxLabelW = 0;
  themeData.forEach(d => {
    const txt = tempSvg.append('text').attr('font-size','10px').text((d.theme.meta.name || d.theme.key) + ` (n=${d.theme.stats.n})`);
    maxLabelW = Math.max(maxLabelW, txt.node().getComputedTextLength());
    txt.remove();
  });
  tempSvg.remove();
  const labelW = Math.ceil(maxLabelW) + 12;
  const barW = Math.max(120, availW - labelW - 50);
  const width = labelW + barW + 50;
  const axisH = 20;
  const height = themeData.length * (barH + gap) + axisH + 10;

  svg.attr('width', width).attr('height', height);
  const g = svg.append('g');

  const xScale = d3.scaleLinear().domain([0, maxAvg]).range([0, barW]);

  const phases = [
    { key: 'tea', color: 'var(--tea-color)' },
    { key: 'dev', color: 'var(--dev-color)' },
    { key: 'reviewer', color: 'var(--rev-color)' },
  ];

  themeData.forEach((d, i) => {
    const fy = i * (barH + gap);
    const t = d.theme;

    g.append('text')
      .attr('class','phase-bar-label')
      .attr('x', labelW - 6).attr('y', fy + barH/2 + 3)
      .attr('text-anchor','end')
      .attr('font-size','10px')
      .attr('fill', t.key === 'control' ? 'var(--accent)' : 'var(--text-muted)')
      .text((t.meta.name || t.key) + ` (n=${t.stats.n})`);

    let xOff = labelW;
    phases.forEach(p => {
      const val = d.phaseAvg[p.key];
      const bw = xScale(val);
      if (bw > 0.5) {
        g.append('rect')
          .attr('x', xOff).attr('y', fy)
          .attr('width', bw).attr('height', barH)
          .attr('fill', p.color)
          .attr('rx', 1)
          .attr('opacity', 0.8);
        if (bw > 20) {
          g.append('text')
            .attr('x', xOff + bw/2).attr('y', fy + barH/2 + 3)
            .attr('text-anchor','middle')
            .attr('font-size','9px')
            .attr('fill','#0a0a1a')
            .attr('font-family','"SF Mono", monospace')
            .text(val.toFixed(1));
        }
        xOff += bw;
      }
    });

    // Total label at end of bar
    g.append('text')
      .attr('x', xOff + 4).attr('y', fy + barH/2 + 3)
      .attr('font-size','9px')
      .attr('fill','var(--text-muted)')
      .attr('font-family','"SF Mono", monospace')
      .text(d.totalAvg.toFixed(1));
  });

  // X-axis with tick marks
  const axisY = themeData.length * (barH + gap) + 2;
  const ticks = xScale.ticks(5);
  ticks.forEach(tick => {
    const x = labelW + xScale(tick);
    g.append('line')
      .attr('x1', x).attr('x2', x)
      .attr('y1', 0).attr('y2', axisY)
      .attr('stroke', 'var(--border)').attr('stroke-width', 0.5)
      .attr('stroke-dasharray', '2,2');
    g.append('text')
      .attr('x', x).attr('y', axisY + 12)
      .attr('text-anchor','middle')
      .attr('font-size','9px')
      .attr('fill','var(--text-muted)')
      .text(tick);
  });
  // Axis label
  g.append('text')
    .attr('x', labelW + barW/2).attr('y', axisY + axisH + 2)
    .attr('text-anchor','middle')
    .attr('font-size','9px')
    .attr('fill','var(--text-muted)')
    .text('avg findings caught / run');
}

// ── Standalone page glue (replaces dashboard buildFilters/renderAll/loadData) ──
function initData() {
  DATA = window.BENCHMARK_DATA;
  // Match the dashboard: these scenarios render empty (null aggregate mean).
  const HIDDEN_SCENARIOS = ['dpgd-114', 'dpgd-117'];
  if (DATA && DATA.scenarios) HIDDEN_SCENARIOS.forEach(id => delete DATA.scenarios[id]);
  const allModels = new Set();
  Object.values(DATA.scenarios).forEach(s =>
    Object.values(s.themes).forEach(t =>
      t.runs.forEach(r => allModels.add(r.model || 'opus'))));
  state.models = allModels;
  state.scenario = Object.keys(DATA.scenarios)[0];
}

function wireControls(rerender) {
  const scenarios = Object.keys(DATA.scenarios);
  const sc = d3.select('#scenario-chips');
  if (!sc.empty()) {
    scenarios.forEach(s => {
      sc.append('span').attr('class', 'chip' + (s === state.scenario ? ' active' : ''))
        .text(s).on('click', function () {
          state.scenario = s;
          state.selectedTheme = null;
          sc.selectAll('.chip').classed('active', false);
          d3.select(this).classed('active', true);
          rerender();
        });
    });
  }
  const tc = d3.select('#tier-checks');
  if (!tc.empty()) {
    ['S', 'A', 'B', 'C', 'D', 'U'].forEach(t => {
      const label = tc.append('label').attr('class', 'tier-check');
      label.append('input').attr('type', 'checkbox').property('checked', true)
        .on('change', function () {
          if (this.checked) state.tiers.add(t); else state.tiers.delete(t);
          rerender();
        });
      label.append('span').text(t);
    });
  }
  if (!d3.select('#ocean-color').empty()) {
    d3.select('#ocean-color').on('change', function () { state.oceanColor = this.value; rerender(); });
    d3.select('#ocean-role').on('change', function () { state.oceanRole = this.value; rerender(); });
  }
}

function startPanel(rerender) {
  if (!window.BENCHMARK_DATA) {
    document.body.insertAdjacentHTML('beforeend',
      '<p style="color:#ff5252;padding:40px">Failed to load benchmark-data.js</p>');
    return;
  }
  initData();
  wireControls(rerender);
  rerender();
  window.addEventListener('resize', rerender);
}
