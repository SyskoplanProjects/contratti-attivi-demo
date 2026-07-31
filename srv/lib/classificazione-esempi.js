const cds = require('@sap/cds');
const openai = require('../modules/openai-module');

const TRUNCATE_LEN = 6000;

let _poolCache = null;

async function salvaEsempio({ categoria, sottoTipo, testo, fonte, categoriaProposta, confidenzaProposta }) {
  const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');
  const testoTroncato = String(testo || '').slice(0, TRUNCATE_LEN);
  const [embedding] = await openai.embeddings([testoTroncato]);

  await INSERT.into(EsempioClassificazione).entries({
    ID: cds.utils.uuid(),
    categoria,
    sottoTipo: sottoTipo || null,
    testo: testoTroncato,
    embedding: JSON.stringify(embedding),
    fonte,
    categoriaProposta: categoriaProposta || null,
    confidenzaProposta: confidenzaProposta != null ? confidenzaProposta : null
  });

  _poolCache = null;
}

async function caricaEsempi() {
  if (_poolCache) return _poolCache;
  const { EsempioClassificazione } = cds.entities('com.reply.contrattiattivi');
  const righe = await SELECT.from(EsempioClassificazione).where({ embedding: { '!=': null } });
  _poolCache = righe.map(r => ({
    key: r.sottoTipo || r.categoria,
    embedding: JSON.parse(r.embedding)
  }));
  return _poolCache;
}

module.exports = { salvaEsempio, caricaEsempi };
