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

/**
 * LOT C — les ventes notées chez les deux sociétés : la liste, et l'effet sur les totaux par année et par société — avant (l'import brut,
 * chaque fichier compté tel quel) et tant qu'elles sont « à attribuer » (dans aucune société, une fois au global, au plus bas), puis
 * selon l'attribution de chacune (l'écart qu'elle ajoute à CRITERIMMO ou à MACJ). PUR.
 */
export function texteDoubles(plan: Plan): string[] {
  if (plan.doubles.length === 0) return [];
  const parCle = new Map(plan.ventes.map((v) => [v.cle, v]));
  const l: string[] = ['', '═'.repeat(110), `VENTES À ATTRIBUER — la même vente notée chez CRITERIMMO ET chez MACJ (${plan.doubles.length} ventes, ${plan.interSocietes.length} rapprochements)`, '═'.repeat(110)];
  l.push('Tant qu’Arno ne l’a pas attribuée : dans le total d’AUCUNE société ; au CA global, UNE fois, au plus bas des deux montants (TTC ; HT = ÷ 1,2).');
  const somme = (cles: string[], s: string): number => cles.map((k) => parCle.get(k)!).filter((v) => v.societe === s).reduce((t, v) => t + v.honorairesTtc, 0);
  let i = 0;
  for (const g of plan.doubles) {
    const c = somme(g.ventes, 'criterimmo'); const m = somme(g.ventes, 'macj');
    l.push(`  ${String(++i).padStart(2)}. ${g.annee} — ${g.ventes.map((k) => { const v = parCle.get(k)!; return `${v.societe === 'macj' ? 'MACJ' : 'CRITERIMMO'} « ${v.libelle} » ${eur(v.honorairesTtc)} (${v.primaire.onglet} l.${v.primaire.ligne})`; }).join(' ↔ ')}`);
    l.push(`        au global tant qu’à attribuer : ${eur(Math.min(c, m))} · attribuée à CRITERIMMO : CRITERIMMO +${eur(c)} · attribuée à MACJ : MACJ +${eur(m)}`);
  }
  const annees = [...new Set(plan.doubles.map((g) => g.annee))].sort();
  l.push('', 'Effet par année (TTC) — « brut » = l’import tel quel (la vente comptée deux fois) ; « à attribuer » = avant toute attribution :');
  l.push('Année  CRITERIMMO brut   CRITERIMMO à attr.   MACJ brut         MACJ à attr.      Global brut        Global à attr.     Doublon retiré');
  for (const a of annees) {
    const vs = plan.ventes.filter((v) => v.annee === a && v.statut === 'vendue');
    const dbl = new Set(plan.doubles.filter((g) => g.annee === a).flatMap((g) => g.ventes));
    const brut = (s: string): number => vs.filter((v) => v.societe === s).reduce((t, v) => t + v.honorairesTtc, 0);
    const net = (s: string): number => vs.filter((v) => v.societe === s && !dbl.has(v.cle)).reduce((t, v) => t + v.honorairesTtc, 0);
    const unefois = plan.doubles.filter((g) => g.annee === a).reduce((t, g) => t + Math.min(somme(g.ventes, 'criterimmo'), somme(g.ventes, 'macj')), 0);
    const gBrut = brut('criterimmo') + brut('macj');
    const gNet = net('criterimmo') + net('macj') + unefois;
    l.push(`${a}   ${eur(brut('criterimmo')).padStart(16)}  ${eur(net('criterimmo')).padStart(18)}  ${eur(brut('macj')).padStart(16)}  ${eur(net('macj')).padStart(16)}  ${eur(gBrut).padStart(17)}  ${eur(gNet).padStart(17)}  ${eur(gBrut - gNet).padStart(14)}`);
  }
  l.push('Après attribution d’une vente : sa société retrouve le montant de SA note (colonne « attribuée à … » ci-dessus), l’autre rien ; le global passe du plus bas des deux à ce montant.');
  return l;
}

export function texteSynthese(plan: Plan): string[] {
  const l: string[] = ['', '═'.repeat(110), 'SYNTHÈSE PAR SOCIÉTÉ ET PAR ANNÉE', '═'.repeat(110)];
  l.push('Société     Année  Ventes  Honoraires TTC      Honoraires HT       Compromis HT      Mois à conf.  À répartir  État');
  for (const r of plan.rapports) {
    l.push(`${(r.societe === 'macj' ? 'MACJ' : 'CRITERIMMO').padEnd(11)} ${r.annee}  ${String(r.nbVentes).padStart(6)}  ${eur(r.ventesTtc).padStart(18)}  ${eur(r.ventesTtc / 1.2).padStart(18)}  ${eur(r.compromisTtc / 1.2).padStart(16)}  ${String(r.moisAConfirmer.length).padStart(12)}  ${String(r.retrosARepartir.length).padStart(10)}  ${r.bloque ? 'BLOQUÉ' : 'ok'}`);
  }
  l.push(...texteDoubles(plan));
  return l;
}
