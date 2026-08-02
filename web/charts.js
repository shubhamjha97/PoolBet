/*
 * charts.js — self-contained SVG chart helpers for the PoolBet PWA.
 *
 * Plain browser JS, no build step, no dependencies. Load via <script src="charts.js">.
 * Exposes a global `window.Charts` object. Every function is PURE and returns an
 * SVG string (responsive: root <svg> has viewBox + width:100%;height:auto, no fixed px width).
 *
 * Theme: OLED-black. Colors pull from CSS custom properties with hex fallbacks:
 *   --neon #00FF9C (green)  --no #FF2E7E (magenta)  --ink #f4f5f3
 *   --ink-2 #9a9c98  --muted #5e615c  --surface-2 #121214  --hairline rgba(255,255,255,0.08)
 *
 * API
 * ---
 *   Charts.sparkline(values, opts)      // values: number[]                        -> svg string
 *   Charts.probability(points, opts)    // points: [{t:number|ISOstr, yes:0..1}]   -> svg string
 *   Charts.bars(items, opts)            // items:  [{label, value, highlight?}]     -> svg string
 *   Charts.multiLine(series, opts)      // series: [{name, points:[{t,v}], highlight?}] -> svg string
 *
 * Example
 * -------
 *   el.innerHTML = Charts.sparkline([1,3,2,5,4,7]);
 *   el.innerHTML = Charts.probability([{t:0,yes:0.4},{t:1,yes:0.62}], {tLabels:['9am','now']});
 *   el.innerHTML = Charts.bars([{label:'Ava',value:120,highlight:true},{label:'Bo',value:80}]);
 */
(function () {
  'use strict';

  // --- theme tokens (var() with hex fallback so SVG works even if a prop is missing) ---
  var C = {
    neon: 'var(--neon, #00FF9C)',
    no: 'var(--no, #FF2E7E)',
    ink: 'var(--ink, #f4f5f3)',
    ink2: 'var(--ink-2, #9a9c98)',
    muted: 'var(--muted, #5e615c)',
    surface2: 'var(--surface-2, #121214)',
    hairline: 'var(--hairline, rgba(255,255,255,0.08))'
  };

  var TAB = 'font-variant-numeric:tabular-nums;font-family:inherit';

  // Escape text injected into markup (labels/names/etc.).
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Round to a compact string (avoid long float tails in path data).
  function n(x) {
    if (!isFinite(x)) return '0';
    return (Math.round(x * 100) / 100).toString();
  }

  // Linear scale: maps value in [d0,d1] to [r0,r1]. Flat domain -> midpoint of range.
  function scale(d0, d1, r0, r1) {
    var span = d1 - d0;
    return function (v) {
      if (span === 0) return (r0 + r1) / 2;
      return r0 + ((v - d0) / span) * (r1 - r0);
    };
  }

  // Coerce a t (number or ISO string) into a sortable number.
  function toNum(t) {
    if (typeof t === 'number') return t;
    var p = Date.parse(t);
    return isNaN(p) ? 0 : p;
  }

  // Unique id fragment so multiple charts on a page don't share gradient/filter ids.
  var _uid = 0;
  function uid(prefix) {
    _uid += 1;
    return prefix + '_' + _uid;
  }

  // Build a polyline "x,y x,y ..." point string from parallel coords.
  function polyPoints(xs, ys) {
    var out = [];
    for (var i = 0; i < xs.length; i++) out.push(n(xs[i]) + ',' + n(ys[i]));
    return out.join(' ');
  }

  function svgOpen(w, h, extra) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" ' +
      'preserveAspectRatio="xMidYMid meet" ' +
      'style="width:100%;height:auto;display:block"' + (extra || '') + '>'
    );
  }

  // ------------------------------------------------------------------
  // 1) sparkline(values, opts)
  //    values: number[] (any range, auto-scaled). opts.color (default neon).
  //    Tiny trend line ~120x34, 2px stroke, rounded caps, filled dot at last point.
  // ------------------------------------------------------------------
  function sparkline(values, opts) {
    opts = opts || {};
    var color = opts.color || C.neon;
    var W = 120, H = 34, pad = 4;
    var vals = (values || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });

    // Fewer than 2 points -> flat faint line.
    if (vals.length < 2) {
      var midY = H / 2;
      return (
        svgOpen(W, H) +
        '<line x1="' + pad + '" y1="' + midY + '" x2="' + (W - pad) + '" y2="' + midY + '" ' +
        'stroke="' + C.muted + '" stroke-width="2" stroke-linecap="round" opacity="0.55"/>' +
        '</svg>'
      );
    }

    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var sx = scale(0, vals.length - 1, pad, W - pad);
    var sy = scale(min, max, H - pad, pad); // invert: higher value -> smaller y

    var xs = [], ys = [];
    for (var i = 0; i < vals.length; i++) { xs.push(sx(i)); ys.push(sy(vals[i])); }

    var lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];

    return (
      svgOpen(W, H) +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" points="' + polyPoints(xs, ys) + '"/>' +
      '<circle cx="' + n(lastX) + '" cy="' + n(lastY) + '" r="2.6" fill="' + color + '"/>' +
      '</svg>'
    );
  }

  // ------------------------------------------------------------------
  // 2) probability(points, opts)
  //    points: [{t:number|ISOstring, yes: 0..1}]. Hero chart, viewBox ~320x160.
  //    Neon line 0..1 (100% top), soft green area fill, dashed 50% baseline,
  //    y labels 0%/50%/100%, glowing last dot. opts.tLabels -> [firstLabel,lastLabel].
  // ------------------------------------------------------------------
  function probability(points, opts) {
    opts = opts || {};
    var W = 320, H = 160;
    var padL = 34, padR = 14, padT = 12, padB = 20;
    var plotL = padL, plotR = W - padR, plotT = padT, plotB = H - padB;

    var gid = uid('pg'), fid = uid('pf');

    // y maps 0..1 to bottom..top (1 -> plotT, 0 -> plotB)
    var sy = scale(0, 1, plotB, plotT);

    // filters + gradient defs (glow on line, vertical green fade for area)
    var defs =
      '<defs>' +
      '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + C.neon + '" stop-opacity="0.28"/>' +
      '<stop offset="100%" stop-color="' + C.neon + '" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<filter id="' + fid + '" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feDropShadow dx="0" dy="0" stdDeviation="2.4" flood-color="#00FF9C" flood-opacity="0.55"/>' +
      '</filter>' +
      '</defs>';

    // gridlines + y labels at 0/50/100%
    function yLabel(frac, text) {
      var y = sy(frac);
      var dashed = frac === 0.5 ? ' stroke-dasharray="3 4"' : '';
      var op = frac === 0.5 ? '0.9' : '0.6';
      return (
        '<line x1="' + plotL + '" y1="' + n(y) + '" x2="' + plotR + '" y2="' + n(y) + '" ' +
        'stroke="' + C.hairline + '"' + dashed + ' opacity="' + op + '"/>' +
        '<text x="' + (plotL - 6) + '" y="' + n(y + 3) + '" text-anchor="end" ' +
        'font-size="9" fill="' + C.muted + '" style="' + TAB + '">' + text + '</text>'
      );
    }

    var grid = yLabel(1, '100%') + yLabel(0.5, '50%') + yLabel(0, '0%');

    // Clean, sorted, valid points.
    var pts = (points || [])
      .filter(function (p) { return p && typeof p.yes === 'number' && isFinite(p.yes); })
      .map(function (p) { return { t: toNum(p.t), yes: Math.max(0, Math.min(1, p.yes)) }; })
      .sort(function (a, b) { return a.t - b.t; });

    var body = '';

    if (pts.length === 0) {
      // Empty: just baseline + grid, no message.
      body = '';
    } else if (pts.length === 1) {
      // Single point: draw a flat line at its level + a glowing dot on the right.
      var y1 = sy(pts[0].yes);
      body =
        '<line x1="' + plotL + '" y1="' + n(y1) + '" x2="' + plotR + '" y2="' + n(y1) + '" ' +
        'stroke="' + C.neon + '" stroke-width="2" stroke-linecap="round" filter="url(#' + fid + ')"/>' +
        glowDot(plotR, y1);
    } else {
      var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      var sx = scale(t0, t1, plotL, plotR);
      var xs = [], ys = [];
      for (var i = 0; i < pts.length; i++) { xs.push(sx(pts[i].t)); ys.push(sy(pts[i].yes)); }

      var linePts = polyPoints(xs, ys);

      // Area path: line then down to baseline and back.
      var area = 'M ' + n(xs[0]) + ' ' + n(ys[0]);
      for (var j = 1; j < xs.length; j++) area += ' L ' + n(xs[j]) + ' ' + n(ys[j]);
      area += ' L ' + n(xs[xs.length - 1]) + ' ' + n(plotB) + ' L ' + n(xs[0]) + ' ' + n(plotB) + ' Z';

      body =
        '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<polyline fill="none" stroke="' + C.neon + '" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" points="' + linePts + '" ' +
        'filter="url(#' + fid + ')"/>' +
        glowDot(xs[xs.length - 1], ys[ys.length - 1]);
    }

    function glowDot(cx, cy) {
      return (
        '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="4.2" fill="' + C.neon + '" filter="url(#' + fid + ')"/>' +
        '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="1.6" fill="#0a0a0b"/>'
      );
    }

    // Optional x labels (first/last time).
    var xLabels = '';
    if (opts.tLabels && opts.tLabels.length && pts.length) {
      var l0 = esc(opts.tLabels[0]);
      var l1 = esc(opts.tLabels[opts.tLabels.length - 1]);
      xLabels =
        '<text x="' + plotL + '" y="' + (H - 6) + '" text-anchor="start" font-size="9" ' +
        'fill="' + C.muted + '" style="' + TAB + '">' + l0 + '</text>' +
        '<text x="' + plotR + '" y="' + (H - 6) + '" text-anchor="end" font-size="9" ' +
        'fill="' + C.muted + '" style="' + TAB + '">' + l1 + '</text>';
    }

    return svgOpen(W, H) + defs + grid + body + xLabels + '</svg>';
  }

  // ------------------------------------------------------------------
  // 3) bars(items, opts)
  //    items: [{label, value, highlight?:bool}]. Horizontal bars, viewBox width 320.
  //    Neon fill (magenta if highlight), label left, value right (tabular).
  //    Auto-scaled to max value, rounded ends, row height ~30, gap ~8.
  // ------------------------------------------------------------------
  function bars(items, opts) {
    opts = opts || {};
    var W = 320;
    var rowH = 30, gap = 8, padY = 6;
    var labelW = 74;         // left gutter for labels
    var valueW = 44;         // right gutter for values
    var barL = labelW;
    var barR = W - valueW;
    var barMaxW = barR - barL;

    var list = (items || []).filter(function (it) {
      return it && typeof it.value === 'number' && isFinite(it.value);
    });

    var H = padY * 2 + list.length * rowH + Math.max(0, list.length - 1) * gap;
    if (list.length === 0) H = padY * 2 + rowH;

    var max = 0;
    for (var m = 0; m < list.length; m++) max = Math.max(max, list[m].value);
    if (max <= 0) max = 1;

    var rows = '';
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var y = padY + i * (rowH + gap);
      var cy = y + rowH / 2;
      var w = Math.max(2, (it.value / max) * barMaxW);
      var fill = it.highlight ? C.no : C.neon;
      var trackFill = C.surface2;

      rows +=
        // track
        '<rect x="' + barL + '" y="' + n(y + 6) + '" width="' + barMaxW + '" height="' + (rowH - 12) +
        '" rx="4" fill="' + trackFill + '"/>' +
        // bar
        '<rect x="' + barL + '" y="' + n(y + 6) + '" width="' + n(w) + '" height="' + (rowH - 12) +
        '" rx="4" fill="' + fill + '"/>' +
        // label (left)
        '<text x="0" y="' + n(cy + 3.5) + '" font-size="11" fill="' + C.ink + '" ' +
        'style="font-family:inherit">' + esc(it.label) + '</text>' +
        // value (right, tabular)
        '<text x="' + W + '" y="' + n(cy + 3.5) + '" text-anchor="end" font-size="11" ' +
        'fill="' + C.ink + '" style="' + TAB + '">' + esc(formatVal(it.value, opts)) + '</text>';
    }

    return svgOpen(W, H) + rows + '</svg>';
  }

  function formatVal(v, opts) {
    if (opts && typeof opts.format === 'function') return opts.format(v);
    // compact default: integers as-is, else 1 decimal
    return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString();
  }

  // ------------------------------------------------------------------
  // 4) multiLine(series, opts)
  //    series: [{name, points:[{t,v}], highlight?:bool}]. viewBox ~340x180.
  //    Shared auto-scaled y across all series. Highlight = neon 2.5px + glow + end dot
  //    + name label; others dim gray 1.5px opacity ~0.5. Faint baseline grid.
  //    Series with <2 points are skipped.
  // ------------------------------------------------------------------
  function multiLine(series, opts) {
    opts = opts || {};
    var W = 340, H = 180;
    var padL = 30, padR = 46, padT = 12, padB = 18;
    var plotL = padL, plotR = W - padR, plotT = padT, plotB = H - padB;

    var fid = uid('mlf');
    var defs =
      '<defs>' +
      '<filter id="' + fid + '" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#00FF9C" flood-opacity="0.5"/>' +
      '</filter>' +
      '</defs>';

    var all = (series || []).map(function (s) {
      var pts = (s.points || [])
        .filter(function (p) { return p && typeof p.v === 'number' && isFinite(p.v); })
        .map(function (p) { return { t: toNum(p.t), v: p.v }; })
        .sort(function (a, b) { return a.t - b.t; });
      return { name: s.name, highlight: !!s.highlight, pts: pts };
    });

    // Global domain across ALL points (so lines share one y-axis).
    var minV = Infinity, maxV = -Infinity, minT = Infinity, maxT = -Infinity;
    all.forEach(function (s) {
      s.pts.forEach(function (p) {
        if (p.v < minV) minV = p.v;
        if (p.v > maxV) maxV = p.v;
        if (p.t < minT) minT = p.t;
        if (p.t > maxT) maxT = p.t;
      });
    });

    // No usable data -> just an empty framed plot with a baseline.
    if (!isFinite(minV) || !isFinite(maxV)) {
      var by = (plotT + plotB) / 2;
      return (
        svgOpen(W, H) +
        '<line x1="' + plotL + '" y1="' + n(by) + '" x2="' + plotR + '" y2="' + n(by) + '" ' +
        'stroke="' + C.hairline + '"/>' +
        '</svg>'
      );
    }
    if (minV === maxV) { minV -= 1; maxV += 1; }
    if (minT === maxT) { minT -= 1; maxT += 1; }

    var sx = scale(minT, maxT, plotL, plotR);
    var sy = scale(minV, maxV, plotB, plotT);

    // Faint baseline grid: top / mid / bottom of value range.
    function grid(frac) {
      var y = plotT + (plotB - plotT) * frac;
      return '<line x1="' + plotL + '" y1="' + n(y) + '" x2="' + plotR + '" y2="' + n(y) + '" ' +
        'stroke="' + C.hairline + '" opacity="0.7"/>';
    }
    var gridEls = grid(0) + grid(0.5) + grid(1);

    // Draw dim series first, highlighted on top.
    var dim = '', hot = '';
    all.forEach(function (s) {
      if (s.pts.length < 2) return; // skip too-short series
      var xs = [], ys = [];
      for (var i = 0; i < s.pts.length; i++) { xs.push(sx(s.pts[i].t)); ys.push(sy(s.pts[i].v)); }
      var pp = polyPoints(xs, ys);

      if (s.highlight) {
        var ex = xs[xs.length - 1], ey = ys[ys.length - 1];
        hot +=
          '<polyline fill="none" stroke="' + C.neon + '" stroke-width="2.5" ' +
          'stroke-linecap="round" stroke-linejoin="round" points="' + pp + '" ' +
          'filter="url(#' + fid + ')"/>' +
          '<circle cx="' + n(ex) + '" cy="' + n(ey) + '" r="4" fill="' + C.neon + '" filter="url(#' + fid + ')"/>' +
          '<circle cx="' + n(ex) + '" cy="' + n(ey) + '" r="1.5" fill="#0a0a0b"/>';
        if (s.name != null) {
          // label to the right of the end dot, clamped inside viewBox
          var ly = Math.max(plotT + 4, Math.min(plotB, ey + 3.5));
          hot +=
            '<text x="' + n(Math.min(ex + 7, W - 2)) + '" y="' + n(ly) + '" ' +
            'font-size="10" fill="' + C.neon + '" style="font-family:inherit">' + esc(s.name) + '</text>';
        }
      } else {
        dim +=
          '<polyline fill="none" stroke="' + C.muted + '" stroke-width="1.5" ' +
          'stroke-linecap="round" stroke-linejoin="round" opacity="0.5" points="' + pp + '"/>';
      }
    });

    return svgOpen(W, H) + defs + gridEls + dim + hot + '</svg>';
  }

  window.Charts = {
    sparkline: sparkline,
    probability: probability,
    bars: bars,
    multiLine: multiLine
  };
})();
