# Dashboard dati reali + fix FE

Data: 2026-08-07
Stato: approved
Competenza: Dashboard cockpit + seed demo

## Problema

Dashboard basata su dati mock (`mockCockpit.js`: 47 contratti, 12.48M€; `mockFornitori.js`: 18 fornitori finti). Dati non reali. Inoltre:
- Titolo "Dettaglio contratti" tagliato (troncato) a FE.
- Card KPI (contratti totali, importo totale) esteticamente scadenti.

## Obiettivo

1. Dashboard basata su dati reali dal DB, zero mock.
2. KPI calcolati dai contratti reali a DB.
3. Top fornitori dai 377 fornitori reali importati (sort per `fatturatoTot`).
4. Mantenere i contratti reali a DB (4 esistenti) e **espandere il seed demo a ~15 contratti** realistici per dashboard viva.
5. Fix FE: titolo tabella "Dettaglio contratti" non troncato; card KPI ripulite.

## Approccio (scelto C)

OData reali + seed demo espanso. KPI da contratti DB, top fornitori da 377, grafici generati da dati reali.

## Cambiamenti

### 1. Rimozione mock
- Elimina `app/contratti/webapp/model/mockCockpit.js`.
- Elimina `app/contratti/webapp/model/mockFornitori.js`.
- `dashboardUtils.js` resta, usato per render HTML (donut, trend, top fornitori).

### 2. Controller Dashboard (`Dashboard.controller.js`)
- `onInit`: carica dati reali.
  - KPI: read `Contratto` (filtro stato != ARCHIVIATO) → totale, importo somma, donut tipologia (già `categoria`), trend da date stipula/scadenza, stato survey.
  - Top fornitori: read `Fornitore` → top 8 per `fatturatoTot`.
- `_buildCockpitViewData` non usa più mock — costruisce da dati letti via OData.
- Mantiene binding della tabella `/Contratto` reale esistente.

### 3. `dashboardUtils.js`
- `buildTopFornitoriHtml(aFornitori, sMetric)`: adatta a campi Fornitore reali:
  - campo nome: `nomeFornitore`
  - metric default `numero` → usa `fatturatoTot` (unico dato numerico coerente) OPPURE `numAddetti`.
  - decade `contrattiAttivi`/`contrattiPassivi`/`importoAttiviEuro` (non esistono su Fornitore).
- Donut/trend invariati (dati passati aggregati dal controller).

### 4. FE fix
- `DashboardCockpit.fragment.xml`: sposta `Title text="Dettaglio contratti"` FUORI dal `.app-table-wrap` (il wrap ha `overflow:hidden` e tronca l'header). Oppure rimuovi `overflow:hidden` e aggiungi padding al wrap.
- Card KPI: `style.css` allinea `.app-dash-kpi-card`, `.app-dash-kpi-value`, `.app-dash-kpi-label` per layout pulito (align, spacing, colore, griglia responsive).

### 5. Seed demo espanso (`srv/lib/demo-data.js`)
- Da 3 a ~15 contratti con intestatari realistici, importi, date stipula/scadenza, stati vari.
- Idempotente (resta via `trovaContrattoPerIntestatario`).
- Intestatari anche da listino (es. STEP SPA) per collegare top fornitori.

## Testing
- Jest: seed demo produce ~15 contratti; idempotente.
- Jest: `buildTopCapitoliHtml` con dati Fornitore reali produce HTML senza errori, ordina per fatturato.
- Manuale: dashboard a FE con KPI reali, top fornitori 377, titolo non troncato, card KPI pulite.

## Fuori scope
- Grafica donut/trend (stesse funzioni).
- CRUD contratti.
- Modifica schema.