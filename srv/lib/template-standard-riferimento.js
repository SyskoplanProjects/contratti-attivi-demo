// Estratto rappresentativo e distintivo delle CGC/CPC standard del Gruppo Bancario Cooperativo
// Iccrea (fonte: "POC SAP - Analisi Contratti/02. Standard Contrattuali/CGC PASSIVE ICT DORA_
// Accettazione_30.04.2025.docx" e "CPC Servizi Passivi ICT_Accettazione_30.04.2025.docx").
// Non è il testo integrale dei due documenti: solo i passaggi più caratteristici e stabili,
// che restano identici anche quando i campi vuoti del template (nomi parti, date, importi)
// vengono compilati — usati come profilo di riferimento per il riconoscimento per similarity
// (embedding) in srv/lib/template-recognizer.js.
const TESTO_RIFERIMENTO_CGC_CPC = `
GRUPPO BANCARIO COOPERATIVO ICCREA
Condizioni Generali di Contratto per Servizi ICT
Applicabili agli appalti di Servizi ICT affidati da una o più società del Gruppo Bancario Cooperativo ICCREA in qualità di Committente.
Contratto: le Condizioni Generali di Contratto, le Condizioni Particolari di Contratto, gli Allegati ed ogni altro documento che le Parti riterranno necessario allegare.
GBCI: il Gruppo inteso come l'insieme delle società controllate da ICCREA Banca S.p.A. oltre che ICCREA Banca S.p.A. stessa e le banche di credito cooperativo affiliate ai sensi degli artt. 37 bis e ss. del D.Lgs. 385/1993 (Testo Unico Bancario).
Autorità di Vigilanza: la Banca d'Italia, la Banca Centrale Europea, l'Autorità Bancaria Europea (ABE), l'IVASS, l'AGCM, il Garante per la protezione dei dati personali.
Contratto di appalto per la prestazione di servizi ICT — Condizioni Particolari di Contratto.
Le Premesse e gli Allegati costituiscono parte integrante e sostanziale delle presenti Condizioni Particolari di Contratto (di seguito anche "CPC"). Ciascuno dei Servizi erogati dall'Appaltatore alla Committente è dettagliato nello specifico Allegato tecnico, individuato univocamente con la lettera A seguita da un numero progressivo a partire dall'Allegato A1.
Allegati Tecnici - Specifiche tecniche e modalità operative di erogazione dei Servizi; Allegati Economici - Condizioni economiche; Livelli di Servizio, indicatori chiave di Prestazione (KPI) e penali; Nomina a Responsabile ovvero Sub-responsabile del trattamento dei dati; Elenco Subfornitori e Sub-responsabili del trattamento; Requisiti di Sicurezza delle informazioni, dei sistemi ICT e della Continuità e Resilienza Operativa; Indirizzi delle Parti e PEC.
`.trim();

module.exports = { TESTO_RIFERIMENTO_CGC_CPC };
