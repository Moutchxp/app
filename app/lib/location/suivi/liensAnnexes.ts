import { estLotAnnexe } from '../../gestion/annexesBien';
import { normaliserTexte } from '../../gestion/annuaire';

/**
 * ══ 🔴 Arno (25/10/2026, 426) — LES LIENS D'ANNEXES À POSER (script `location:liens-annexes`) ════════════════════════════════════════
 * Les lots de TYPE annexe (parking, cave, box, garage, cellier — la catégorie, sinon la nature WIPPIMMO) qui ne sont reliés à aucun lot
 * principal : un lien est PROPOSÉ quand le propriétaire n'a qu'UN lot principal, ou un seul à la même adresse ; les cas AMBIGUS (plusieurs
 * lots principaux possibles) et les lots SANS lot principal (le propriétaire n'a que des annexes : ils restent des lots principaux, une
 * gestion chacun) sont listés à part, sans y toucher. REJOUABLE : un lot déjà relié n'est plus examiné. Sans effet sur le passé (la règle
 * des annexes ne vaut qu'à partir de la date de bascule). PUR.
 */
export interface LotExamine { id: number; proprietaireId: number | null; nature: string | null; typeBien: string | null; categorie: string | null; adresse: string | null; relie: boolean }
export type DecisionLien =
  | { sorte: 'proposer'; annexe: LotExamine; parent: LotExamine; raison: 'seul_principal' | 'meme_adresse' }
  | { sorte: 'ambigu'; annexe: LotExamine; candidats: LotExamine[] }
  | { sorte: 'sans_principal'; annexe: LotExamine };

const estTypeAnnexe = (l: LotExamine): boolean => estLotAnnexe({ categorie: l.categorie, nature: l.nature, typeBien: l.typeBien });

export function planLiensAnnexes(lots: readonly LotExamine[]): DecisionLien[] {
  const sortie: DecisionLien[] = [];
  for (const a of lots) {
    if (a.relie || !estTypeAnnexe(a) || a.proprietaireId === null) continue;
    const principaux = lots.filter((l) => l.id !== a.id && l.proprietaireId === a.proprietaireId && !estTypeAnnexe(l));
    if (principaux.length === 0) { sortie.push({ sorte: 'sans_principal', annexe: a }); continue; }
    if (principaux.length === 1) { sortie.push({ sorte: 'proposer', annexe: a, parent: principaux[0], raison: 'seul_principal' }); continue; }
    const adresse = normaliserTexte(a.adresse ?? '');
    const memeAdresse = adresse === '' ? [] : principaux.filter((p) => normaliserTexte(p.adresse ?? '') === adresse);
    sortie.push(memeAdresse.length === 1 ? { sorte: 'proposer', annexe: a, parent: memeAdresse[0], raison: 'meme_adresse' } : { sorte: 'ambigu', annexe: a, candidats: principaux });
  }
  return sortie;
}

const mot = (l: LotExamine): string => `lot n° ${l.id} (${[l.nature, l.typeBien].filter((x) => x).join(' ') || l.categorie || 'bien'}${l.adresse ? `, ${l.adresse}` : ''})`;

export function texteLiensAnnexes(plan: readonly DecisionLien[], o: { reel: boolean; base: string; ecrits: number; examines: number }): string {
  const de = <S extends DecisionLien['sorte']>(s: S) => plan.filter((d): d is Extract<DecisionLien, { sorte: S }> => d.sorte === s);
  const l: string[] = [];
  l.push(`LIENS D'ANNEXES — ${o.reel ? 'RÉEL' : 'ESSAI (aucune écriture)'} — base ${o.base}`);
  l.push(`Lots examinés : ${o.examines} · annexes à relier proposées : ${de('proposer').length}${o.reel ? ` · écrites : ${o.ecrits}` : ''}`);
  l.push(`Ambigus (plusieurs lots principaux possibles, non touchés) : ${de('ambigu').length}`);
  l.push(`Sans lot principal (restent des lots principaux, non touchés) : ${de('sans_principal').length}`);
  l.push('', '── PROPOSÉS ──');
  for (const d of de('proposer')) l.push(`  ${mot(d.annexe)} → annexe de ${mot(d.parent)}${d.raison === 'meme_adresse' ? ' (même adresse)' : ''}`);
  l.push('', '── AMBIGUS (à relier à la main : « Rattacher à un bien » sur la fiche du lot) ──');
  for (const d of de('ambigu')) l.push(`  ${mot(d.annexe)} : ${d.candidats.map(mot).join(' / ')}`);
  l.push('', '── SANS LOT PRINCIPAL ──');
  for (const d of de('sans_principal')) l.push(`  ${mot(d.annexe)}`);
  return `${l.join('\n')}\n`;
}
