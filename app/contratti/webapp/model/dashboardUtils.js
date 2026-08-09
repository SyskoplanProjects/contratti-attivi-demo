(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    sap.ui.define([], factory);
  }
}(this, function () {
  "use strict";

  var DEFAULT_COLORS = ["#0a6ed1", "#e9730c", "#107e3e", "#bb0000", "#6a6d70"];

  function escapeHtml(sText) {
    return String(sText == null ? "" : sText)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function matchFornitore(sNomeFornitore, sIntestatario) {
    if (!sNomeFornitore || !sIntestatario) return false;
    var a = String(sNomeFornitore).trim().toLowerCase();
    var b = String(sIntestatario).trim().toLowerCase();
    if (!a || !b) return false;
    return a === b || b.indexOf(a) !== -1 || a.indexOf(b) !== -1;
  }

  function buildDonutGradient(aSegments) {
    var fTotal = aSegments.reduce(function (n, s) { return n + s.value; }, 0);
    var fCursor = 0;
    var aStops = aSegments.map(function (s, i) {
      var fStart = fTotal ? (fCursor / fTotal * 360) : 0;
      fCursor += s.value;
      var fEnd = fTotal ? (fCursor / fTotal * 360) : 0;
      var sColor = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      return sColor + " " + fStart.toFixed(2) + "deg " + fEnd.toFixed(2) + "deg";
    });
    return "conic-gradient(" + aStops.join(", ") + ")";
  }

  function buildDonutHtml(aSegments) {
    var fTotal = aSegments.reduce(function (n, s) { return n + s.value; }, 0);
    var aSafeSegments = aSegments.map(function (s, i) {
      return {
        value: s.value,
        color: escapeHtml(s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]),
        label: s.label
      };
    });
    var sGradient = buildDonutGradient(aSafeSegments);
    var sLegend = aSafeSegments.map(function (s) {
      var fPct = fTotal ? Math.round(s.value / fTotal * 1000) / 10 : 0;
      return '<div class="app-donut-legend-row">' +
        '<span class="app-donut-dot" style="background:' + s.color + '"></span>' +
        '<span class="app-donut-legend-label">' + escapeHtml(s.label) + '</span>' +
        '<span class="app-donut-legend-value">' + s.value + ' (' + fPct + '%)</span>' +
        '</div>';
    }).join('');
    return '<div class="app-donut-wrap">' +
      '<div class="app-donut" style="background:' + sGradient + '">' +
      '<div class="app-donut-hole"><span>' + fTotal + '</span></div></div>' +
      '<div class="app-donut-legend">' + sLegend + '</div>' +
      '</div>';
  }

  function buildTrendHtml(aTrend) {
    var fMax = aTrend.reduce(function (n, m) { return Math.max(n, m.attivati, m.scadenza); }, 1);
    var sCols = aTrend.map(function (m) {
      var fHAttivati = Math.round(m.attivati / fMax * 100);
      var fHScadenza = Math.round(m.scadenza / fMax * 100);
      return '<div class="app-trend-col">' +
        '<div class="app-trend-bars">' +
        '<div class="app-trend-bar app-trend-bar-attivati" style="height:' + fHAttivati + '%" title="Attivati: ' + m.attivati + '"></div>' +
        '<div class="app-trend-bar app-trend-bar-scadenza" style="height:' + fHScadenza + '%" title="In scadenza: ' + m.scadenza + '"></div>' +
        '</div>' +
        '<span class="app-trend-month">' + escapeHtml(m.mese) + '</span>' +
        '</div>';
    }).join('');
    return '<div class="app-trend-chart">' + sCols + '</div>';
  }

  function buildTopFornitoriHtml(aTop, sMetric) {
    var aRows = (aTop || []).slice().sort(function (x, y) { return (y.value || 0) - (x.value || 0); }).slice(0, 8);
    var fMax = aRows.reduce(function (n, r) { return Math.max(n, r.value || 0); }, 1);
    var sRows = aRows.map(function (r) {
      var fW = Math.round((r.value || 0) / fMax * 100);
      var sText = r.value == null ? '' : (sMetric === 'numero' ? String(r.value) : '€ ' + Math.round(r.value / 1000) + 'k');
      return '<div class="app-topf-row">' +
        '<span class="app-topf-name">' + escapeHtml(r.nome) + '</span>' +
        '<div class="app-topf-bars">' +
        '<div class="app-topf-bar app-topf-bar-fatturato" style="width:' + fW + '%"><span>' + sText + '</span></div>' +
        '</div>' +
        '</div>';
    }).join('');
    return '<div class="app-topf-chart">' + sRows + '</div>';
  }

  return {
    matchFornitore: matchFornitore,
    buildDonutGradient: buildDonutGradient,
    buildDonutHtml: buildDonutHtml,
    buildTrendHtml: buildTrendHtml,
    buildTopFornitoriHtml: buildTopFornitoriHtml
  };
}));
