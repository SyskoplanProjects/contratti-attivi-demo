(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else sap.ui.define([], factory);
}(this, function () {
  "use strict";

  var DEFAULT_COLORS = ["#0a6ed1", "#e9730c", "#107e3e", "#bb0000", "#6a6d70"];
  var MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  var SURVEY_META = {
    ok: { label: "Completata", color: "#107e3e" },
    non_conforme: { label: "Non conforme", color: "#bb0000" },
    in_corso: { label: "In corso", color: "#0a6ed1" }
  };

  function countBy(lista, keyFn) {
    var m = {};
    lista.forEach(function (v) {
      var k = keyFn(v);
      if (k !== null && k !== undefined) m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function buildTipologia(contratti) {
    var counts = countBy(contratti, function (c) { return c.categoria; });
    return Object.keys(counts).map(function (k, i) {
      return { label: k, value: counts[k], color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] };
    });
  }

  function buildSurvey(contratti) {
    var counts = countBy(contratti, function (c) { return c.esitoVerifica || 'in_corso'; });
    return Object.keys(counts).map(function (k) {
      var meta = SURVEY_META[k] || { label: k, color: DEFAULT_COLORS[4] };
      return { label: meta.label, value: counts[k], color: meta.color };
    });
  }

  function meseValido(sData) {
    if (!sData) return -1;
    var d = new Date(sData);
    return isNaN(d.getTime()) ? -1 : d.getMonth();
  }

  function buildTrend(contratti) {
    var mesi = [];
    for (var m = 0; m < 12; m++) mesi.push({ mese: MESI[m], attivati: 0, scadenza: 0 });
    contratti.forEach(function (c) {
      var mAttivati = meseValido(c.dataStipula);
      if (mAttivati >= 0) mesi[mAttivati].attivati++;
      var mScadenza = meseValido(c.dataScadenza);
      if (mScadenza >= 0) mesi[mScadenza].scadenza++;
    });
    return mesi;
  }

  function buildTopFornitori(fornitori) {
    return fornitori
      .filter(function (f) { return f.fatturatoTot != null; })
      .map(function (f) { return { nome: f.nomeFornitore, value: f.fatturatoTot }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
  }

  // Stesso criterio di fuzzy-match di dashboardUtils.matchFornitore (duplicato qui per
  // tenere questo modulo senza dipendenze: nomeFornitore/intestatario provengono da
  // fonti diverse - anagrafica Fornitore vs testo libero sul Contratto - quindi il
  // confronto è case/spazi-insensitive con contenimento in entrambe le direzioni).
  function matchFornitoreNome(sNomeFornitore, sIntestatario) {
    if (!sNomeFornitore || !sIntestatario) return false;
    var a = String(sNomeFornitore).trim().toLowerCase();
    var b = String(sIntestatario).trim().toLowerCase();
    if (!a || !b) return false;
    return a === b || b.indexOf(a) !== -1 || a.indexOf(b) !== -1;
  }

  function buildTopFornitoriNumero(contratti, fornitori) {
    return fornitori
      .map(function (f) {
        var n = contratti.filter(function (c) { return matchFornitoreNome(f.nomeFornitore, c.intestatario); }).length;
        return { nome: f.nomeFornitore, value: n };
      })
      .filter(function (r) { return r.value > 0; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
  }

  function aggregateCockpit(input) {
    var contratti = (input.contratti || []).filter(function (c) { return c.stato !== 'ARCHIVIATO'; });
    var fornitori = input.fornitori || [];
    return {
      totaleContratti: contratti.length,
      importoTotaleAnno: contratti.reduce(function (n, c) { return n + (Number(c.importo) || 0); }, 0),
      donutTipologia: buildTipologia(contratti),
      donutSurvey: buildSurvey(contratti),
      trend: buildTrend(contratti),
      topFornitori: buildTopFornitori(fornitori),
      topFornitoriNumero: buildTopFornitoriNumero(contratti, fornitori)
    };
  }

  aggregateCockpit.buildTipologia = buildTipologia;
  aggregateCockpit.buildSurvey = buildSurvey;
  aggregateCockpit.buildTrend = buildTrend;
  aggregateCockpit.buildTopFornitori = buildTopFornitori;
  aggregateCockpit.buildTopFornitoriNumero = buildTopFornitoriNumero;
  aggregateCockpit.countBy = countBy;

  return aggregateCockpit;
}));