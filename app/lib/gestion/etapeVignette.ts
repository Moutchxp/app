import { motEtape } from './mongaEtape';
import type { DerniereEtapeVignette } from './fileRepo';

/**
 * ══ 🔴🔴 LA DERNIÈRE ÉTAPE D'UN ÉVÉNEMENT, DITE EN MOTS — UNE SEULE FOIS ═══════════════════════════════════════════
 *
 * Sortie de `MiniatureEtape` (CarteVive) au lot BLOC-EVENEMENT-RATTACHE-COMPLET : Arno veut lire, dans la fenêtre
 * « Bien(s) rattaché(s) à ce mail », « Étape : <dernière étape de sa frise> (JJ/MM/AAAA) », « identique à celle
 * affichée sur sa carte ». Les deux écrans appellent donc cette fonction, sur la même donnée (`sqlDerniereEtape`).
 *
 * 🔴 SANS AUCUNE ÉTAPE : « Ouverture » et la date d'ouverture — ce que la frise montre dans le même cas.
 * ⚠️ ABSENT ET `null` SONT LA MÊME CHOSE (défaut mesuré au lot VIGNETTE-EVENEMENT) : une miniature ne jette jamais.
 * PUR.
 */
export function etapeEnMots(
  brut: DerniereEtapeVignette | null | undefined, ouvertLe: string | null | undefined,
): { mot: string; date: string | null; aConfirmer: boolean; deMonga: boolean } {
  const etape = brut ?? null;
  const mot = etape === null
    ? motEtape('ouverture')
    : (etape.type === 'autre' && etape.titre !== null && etape.titre.trim() !== ''
      ? etape.titre.trim() : motEtape(etape.type));
  const quand = (etape?.survenuLe ?? ouvertLe ?? '').slice(0, 10);
  /* 🔴 LOT FRISE-DATE-VIDE-PAR-DEFAUT — une carte validée SANS date n'en montre aucune. */
  const sansDate = etape !== null && etape.jourConnu === false;
  const date = sansDate ? null : quand.length === 10
    ? `${quand.slice(8, 10)}/${quand.slice(5, 7)}/${quand.slice(0, 4)}` : '—';
  return {
    mot, date,
    aConfirmer: etape !== null && etape.certitude === 'a_confirmer',
    deMonga: etape !== null && etape.source === 'monga',
  };
}
