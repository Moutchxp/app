import { motEtape } from './mongaEtape';
import { FUSEAU_AFFICHAGE } from './ecran';
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
  /* 🔴 LOT LISTE-MAILS-RETOUR-PASTILLE-SOBRE-ET-DATE-ETAPE — le JOUR À PARIS, et non les dix premiers caractères d'une
     heure UTC : une étape du 11/10 (enregistrée « 11/10 00:00 » à Paris, soit « 10/10 22:00 » en UTC) s'affichait
     « 10/10 » sur la vignette de la carte et dans la fenêtre du mail, alors que la frise disait « 11/10 ». */
  const quand = jourParisIso(etape?.survenuLe ?? ouvertLe ?? '');
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

/**
 * ══ 🔴🔴 LE JOUR CIVIL À PARIS D'UN INSTANT ISO — `AAAA-MM-JJ` ══════════════════════════════════════════════════════
 *
 * Un instant qui porte son fuseau (« …Z », « …+02 », « …+02:00 ») est ramené au jour de Paris — c'est ce que la frise
 * affiche, elle qui lit la base en heure de Paris. Une chaîne SANS fuseau (« 2026-10-11 », « 2026-10-11T09:00 ») est
 * déjà un jour civil : elle se découpe, sans `Date` — le fuseau du lecteur ne doit rien décaler. PUR.
 */
export function jourParisIso(iso: string | null | undefined): string {
  const s = (iso ?? '').trim();
  if (!/(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(s) || !/\d{2}:\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
