import type { FichierLu } from './lectureTableau';
import type { Plan, RapportFichier } from './planImport';

/**
 * TUILE « TRANSACTION » — LOT B : LE RAPPORT DE LA REPRISE (B3), en texte. Par fichier et par année : ventes, honoraires TTC / HT,
 * compromis, apporteurs, chaque total du fichier face à l'importé AU CENTIME et chaque écart ligne par ligne ; les ventes « mois à
 * confirmer », les rétrocessions « à répartir », les montants « à rattacher », les rapprochements (D3), ce qui n'est pas importé ; la
 * gestion (onglet GESTION) et, pour information, la location (onglet LOCATION face au Suivi de la Location). PUR.
 */
const eur = (x: number | null): string => (x === null ? '—' : `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const NOMS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function texteFichier(r: RapportFichier, f: FichierLu | undefined, plan: Plan, location: Record<string, number> | null): string[] {
  const l: string[] = [];
  l.push('', '═'.repeat(110), `${r.fichier} — ${r.societe === 'macj' ? 'MACJ' : 'CRITERIMMO'} ${r.annee} (D1 : année du nom du fichier)${r.bloque ? '   ⛔ BLOQUÉ (B4)' : '   ✔ réconcilié'}`, '═'.repeat(110));
  l.push(`Ventes : ${r.nbVentes} — honoraires ${eur(r.ventesTtc)} TTC / ${eur(r.ventesTtc / 1.2)} HT`);
  l.push(`Compromis en cours : ${r.nbCompromis} — ${eur(r.compromisTtc)} TTC / ${eur(r.compromisTtc / 1.2)} HT`);
  l.push(`Apporteurs : ${r.nbRetros} rétrocession(s) — ${eur(r.retrosTtc)} ; dont « à répartir » : ${r.retrosARepartir.length}`);
  for (const c of r.reconciliations) {
    l.push('', `▸ ${c.quoi}`);
    l.push(`    total du fichier ${eur(c.fichierTtc)} TTC · somme de ses cellules ${eur(c.sommeCellules)} · importé ${eur(c.importeTtc)} · reste inexpliqué ${eur(c.resteInexplique / 100)}${c.bloquant ? '  ⛔' : '  ✔'}`);
    for (const e of c.ecarts) l.push(`      ${e.libelle}`);
  }
  if (r.moisAConfirmer.length > 0) {
    l.push('', `▸ Ventes « mois à confirmer » (${r.moisAConfirmer.length}) — D4, jamais devinées :`);
    for (const v of r.moisAConfirmer) l.push(`      ${v.primaire.onglet} l.${v.primaire.ligne} « ${v.libelle} » ${eur(v.honorairesTtc)} : ${v.motifMois}`);
  }
  if (r.retrosARepartir.length > 0) {
    l.push('', `▸ Rétrocessions « à répartir » (${r.retrosARepartir.length}) — D5, à rattacher avec l'outil de la tuile :`);
    for (const x of r.retrosARepartir) l.push(`      ${x.m.onglet}!${x.m.cellule} ${NOMS[x.m.mois - 1]} ${eur(x.m.montant)} (${x.m.libelle}) : ${x.motif}`);
  }
  if (r.aRattacher.length > 0) {
    l.push('', `▸ Montants de la ligne « CA » saisis sans vente (« à rattacher », montrés, jamais ajoutés au CA) :`);
    for (const x of r.aRattacher) l.push(`      ${x.m.onglet}!${x.m.cellule} ${NOMS[x.m.mois - 1]} ${eur(x.m.montant)} — ${x.m.libelle}`);
  }
  if (r.rapprochements.length > 0) { l.push('', '▸ Rapprochements entre onglets (D3) :'); for (const x of r.rapprochements) l.push(`      ${x}`); }
  if (r.nonImportees.length > 0) { l.push('', '▸ Non importé (listé) :'); for (const x of r.nonImportees) l.push(`      ${x}`); }
  if (f?.gestion) {
    const g = plan.gestion.filter((x) => x.fichier === r.fichier);
    const somme = g.reduce((s, x) => s + (x.honorairesHt ?? 0), 0);
    l.push('', `▸ Gestion (onglet GESTION) : ${g.length} mois — honoraires HT ${eur(somme)} · total du fichier ${eur(f.gestion.totalFichier)} (${f.gestion.celluleTotal ?? '—'})${f.gestion.totalFichier !== null && Math.round(f.gestion.totalFichier * 100) === Math.round(somme * 100) ? ' ✔' : ' ⚠'}`);
    for (const x of g.filter((y) => y.note !== null)) l.push(`      ${NOMS[x.mois - 1]} : ${x.note}`);
  }
  if (f?.location) {
    l.push('', `▸ Location (information, aucune écriture) : onglet LOCATION face au Suivi de la Location${location === null ? ' — Suivi non lisible dans cette base' : ''}`);
    let tf = 0; let ts = 0;
    for (const m of f.location) {
      const s = location?.[`${r.annee}-${String(m.mois).padStart(2, '0')}`] ?? null;
      tf += m.montant; ts += s ?? 0;
      l.push(`      ${NOMS[m.mois - 1]} ${r.annee} : fichier ${eur(m.montant)} · Suivi ${eur(s)}${s === null ? '' : ` · écart ${eur(s - m.montant)}`}`);
    }
    l.push(`      Année : fichier ${eur(tf)} · Suivi ${location === null ? '—' : eur(ts)}`);
  }
  for (const a of r.alertes) l.push(`  ! ${a}`);
  return l;
}

export function texteSynthese(plan: Plan): string[] {
  const l: string[] = ['', '═'.repeat(110), 'SYNTHÈSE PAR SOCIÉTÉ ET PAR ANNÉE', '═'.repeat(110)];
  l.push('Société     Année  Ventes  Honoraires TTC      Honoraires HT       Compromis HT      Mois à conf.  À répartir  État');
  for (const r of plan.rapports) {
    l.push(`${(r.societe === 'macj' ? 'MACJ' : 'CRITERIMMO').padEnd(11)} ${r.annee}  ${String(r.nbVentes).padStart(6)}  ${eur(r.ventesTtc).padStart(18)}  ${eur(r.ventesTtc / 1.2).padStart(18)}  ${eur(r.compromisTtc / 1.2).padStart(16)}  ${String(r.moisAConfirmer.length).padStart(12)}  ${String(r.retrosARepartir.length).padStart(10)}  ${r.bloque ? 'BLOQUÉ' : 'ok'}`);
  }
  if (plan.interSocietes.length > 0) {
    l.push('', `▸ Ventes présentes chez CRITERIMMO ET chez MACJ la même année (${plan.interSocietes.length}) — information : chaque société garde ce que dit son fichier ; à trancher par Arno :`);
    for (const x of plan.interSocietes) l.push(`      ${x}`);
  }
  return l;
}
