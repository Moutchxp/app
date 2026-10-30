import { compteDansSociete, LIBELLE_SOCIETE, resteTtcDe, TVA, type LigneVente, type Retrocession, type Societe, type Vente } from './modele';
import type { StatutDuLibelle } from './statutLigne';

/**
 * ══ 🔴 LOT BV (Arno, 30/10/2026) — RECLASSER EN COMMISSION DU NÉGOCIATEUR UNE « RÉTROCESSION » IMPORTÉE QUI N'EN EST PAS UNE ════════════════════
 * Le constat : dans les « TABLEAU DE BORD », la ligne 3 de l'onglet d'un négociateur s'intitule « Apporteur Intermédiaire » ; l'import l'a lue
 * comme les rétrocessions aux apporteurs (D5). Sur l'onglet CATHERINE, elle porte 70 à 80 % des honoraires (« =F2*0.8 ») : sa commission de
 * négociatrice, pas un apporteur.
 * LE CRITÈRE (proposé par Arno) : une rétrocession IMPORTÉE, rattachée à une vente importée, sans apporteur nommé (aucune ne l'est : le fichier
 * ne le porte pas — ce critère seul les prendrait TOUTES), dont le destinataire est le négociateur de la ligne, ou supérieure à 50 % des
 * honoraires de la vente. Retenu ici : rattachée ET (destinataire = négociateur de la ligne OU somme > 50 % des honoraires).
 * LA RÈGLE DU RECLASSEMENT : la rétrocession devient la commission (« paye ») du négociateur de la ligne, sans changer AUCUN montant : le « Reste
 * agence HT » de la vente doit rester identique au centime. Or le reste ne déduit que la paye d'un négociateur INDÉPENDANT (LOT Q) : pour un
 * associé, un salarié ou un statut à renseigner, il changerait — la vente est alors BLOQUÉE (dite, jamais reclassée).
 * PUR : rien n'est lu ni écrit ici.
 */

export interface CandidatReclassement {
  venteId: number; societe: Societe; libelle: string; annee: number; mois: number | null; source: string;
  negociateur: string; statut: string | null; honorairesTtc: number; retroTtc: number; retroIds: number[]; partPct: number;
  /** Le « Reste agence HT » de la vente, avant et après le reclassement (centimes). */
  resteAvantC: number; resteApresC: number;
  reclassable: boolean; motif: string | null;
}

const centimes = (x: number): number => Math.round(x * 100);
/** Des centimes en euros, au format de l'écran (« 27 333,34 € »). PUR. */
const eurC = (cts: number): string => `${(cts / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const LIBELLE_STATUT: Record<string, string> = { associe: 'associé', salarie: 'salarié', independant: 'indépendant', observateur: 'observateur' };

/** La vente telle qu'elle serait après le reclassement : la commission du négociateur ajoutée ; les rétrocessions reclassées retirées. PUR. */
export function venteApres(v: Vente, negociateur: string, montantTtc: number): Vente {
  const ligne: LigneVente = { id: -1, negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true, origine: 'saisie',
    sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: 'reclassement LOT BV' } as LigneVente;
  return { ...v, lignes: [...v.lignes, ligne] };
}

/** Les candidats, avec le reste avant / après et le verdict. PUR. */
export function planReclassement(ventes: readonly Vente[], retros: readonly Retrocession[], statutDuLibelle: StatutDuLibelle | undefined, societe: Societe): CandidatReclassement[] {
  const parVente = new Map<number, Retrocession[]>();
  for (const r of retros) if (r.origine === 'import' && r.venteId !== null) parVente.set(r.venteId, [...(parVente.get(r.venteId) ?? []), r]);
  const sortie: CandidatReclassement[] = [];
  for (const v of ventes) {
    const rs = parVente.get(v.id);
    if (rs === undefined || v.origine !== 'import' || v.societe !== societe || v.miroir != null) continue;
    const retroTtc = rs.reduce((t, r) => t + r.montantTtc, 0);
    const negos = [...new Set(rs.map((r) => r.negociateur.trim()))];
    const negociateur = negos[0] ?? v.sourceOnglet ?? '';
    const versLuiMeme = rs.some((r) => (r.apporteur ?? '').trim() !== '' && (r.apporteur ?? '').trim().toUpperCase() === r.negociateur.trim().toUpperCase());
    if (!(versLuiMeme || retroTtc > 0.5 * v.honorairesTtc)) continue;
    const autres = retros.filter((r) => !rs.includes(r));
    const avant = centimes(resteTtcDe(v, retros, statutDuLibelle, societe) / TVA);
    const apres = centimes(resteTtcDe(venteApres(v, negociateur, retroTtc), autres, statutDuLibelle, societe) / TVA);
    const s = statutDuLibelle?.(negociateur) ?? null;
    // 🔴 LOT BX — un DOUBLE « à attribuer » (la vente est dans les deux fichiers) ne compte dans aucune société tant qu'il n'est pas attribué,
    // mais sa rétrocession compte dans le mois où elle est saisie : reclassée, elle quitterait le « Résultat de l'agence » du mois. D'abord l'attribuer.
    const motifs = [
      ...(negos.length > 1 ? [`plusieurs destinataires (${negos.join(', ')})`] : []),
      ...(negos.length <= 1 && avant !== apres ? [`le reste changerait de ${apres > avant ? '+' : '−'}${eurC(Math.abs(apres - avant))} HT : ${negociateur} est ${s === null ? 'sans statut (à renseigner)' : LIBELLE_STATUT[s] ?? s} — seule la commission d’un indépendant est déduite`] : []),
      ...(compteDansSociete(v) ? [] : ['vente « à attribuer » (en double dans les deux fichiers) : sa rétrocession compte dans le mois, pas sa commission — l’attribuer d’abord (« Ventes à attribuer »)']),
    ];
    const motif = motifs.length === 0 ? null : motifs.join(' ; ');
    sortie.push({ venteId: v.id, societe, libelle: v.libelle, annee: v.annee, mois: v.mois, source: `${v.sourceFichier ?? '?'} › ${v.sourceOnglet ?? '?'} › ligne ${v.sourceLigne ?? '?'}`,
      negociateur, statut: s, honorairesTtc: v.honorairesTtc, retroTtc, retroIds: rs.map((r) => r.id), partPct: v.honorairesTtc === 0 ? 0 : (retroTtc / v.honorairesTtc) * 100,
      resteAvantC: avant, resteApresC: apres, reclassable: motif === null, motif });
  }
  return sortie.sort((a, b) => a.annee - b.annee || (a.mois ?? 13) - (b.mois ?? 13) || a.venteId - b.venteId);
}

/** Le texte du rapport : la liste, puis les totaux avant / après (tout, et ce qui serait reclassé), par société. PUR. */
export function texteReclassement(c: readonly CandidatReclassement[]): string {
  const eur = eurC;
  const lignes = c.map((x) => [`${LIBELLE_SOCIETE[x.societe]} ${x.annee}-${String(x.mois ?? '??').padStart(2, '0')}`, `vente ${x.venteId} « ${x.libelle} »`, x.source,
    `négociateur ${x.negociateur} (${x.statut === null ? 'statut à renseigner' : LIBELLE_STATUT[x.statut] ?? x.statut})`,
    `rétrocession ${eur(centimes(x.retroTtc))} TTC = ${x.partPct.toFixed(0)} % des honoraires ${eur(centimes(x.honorairesTtc))} TTC (n° ${x.retroIds.join(', ')})`,
    `reste HT ${eur(x.resteAvantC)} → ${eur(x.resteApresC)}`, x.reclassable ? 'RECLASSABLE' : `BLOQUÉE : ${x.motif}`].join(' | '));
  const total = (xs: readonly CandidatReclassement[]) => ({ retro: xs.reduce((t, x) => t + centimes(x.retroTtc), 0), avant: xs.reduce((t, x) => t + x.resteAvantC, 0), apres: xs.reduce((t, x) => t + x.resteApresC, 0) });
  const t = total(c); const r = total(c.filter((x) => x.reclassable));
  return [...lignes, '',
    `Candidates : ${c.length} vente(s) · rétrocessions ${eur(t.retro)} TTC · reste HT avant ${eur(t.avant)} → après ${eur(t.apres)} (écart ${eur(t.apres - t.avant)})`,
    `Reclassables sans changer le reste : ${c.filter((x) => x.reclassable).length} · rétrocessions ${eur(r.retro)} TTC · reste HT ${eur(r.avant)} → ${eur(r.apres)} (écart ${eur(r.apres - r.avant)})`,
    `Bloquées : ${c.filter((x) => !x.reclassable).length} (le reste changerait, ou plusieurs destinataires) — rien n’est écrit pour elles.`].join('\n');
}
