import { libelleOrigineContact, type OrigineContact } from './suivi';
import { LIBELLE_NATURE_BIEN, NATURES_BIEN, type NatureBien } from './tableauBord';

/**
 * ══ 🔴 Arno (25/10/2026) — LE JOURNAL D'UNE LIGNE DU SUIVI (PUR) ═════════════════════════════════════════════════════════════════════
 * « Modifier » de l'encart (feuille du mois) écrit dans la ligne de suivi — la même que lit le Dossier de location : chaque champ changé
 * entre au journal (« Champ : ancienne → nouvelle », compte, session, écran). Et le « Statut du bien » validé à la main (424).
 */
export const ECRAN_SUIVI_MOIS = 'Suivi du mois' as const;

/** Ce que la ligne porte, lu en base (noms déjà résolus : le collègue par son compte, l'apporteur par l'annuaire). */
export interface EtatCommercialLu {
  origine_contact: string | null; origine_contact_precision?: string | null; collegue: string | null; apporteur: string | null;
  apporteur_taux: string | number | null; apporteur_commission_saisie: string | number | null; prime_mode: string | null; prime_gestion_saisie: string | number | null;
}

const VIDE = '(vide)';
const montant = (v: string | number | null): string => (v === null || v === undefined || v === '' ? VIDE
  : `${Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const LIBELLE_CHOIX_PRIME: Record<string, string> = { regle: 'Règle de l’agence', personnalise: 'Personnalisé', aucune: 'Aucune' };

/** La ligne en mots, champ par champ (l'ordre de la saisie). */
export function etatCommercialEnTexte(e: EtatCommercialLu): [string, string][] {
  const origine = libelleOrigineContact(e.origine_contact as OrigineContact | null, e.origine_contact_precision ?? null);
  return [
    ['Origine du contact', origine === '' ? VIDE : origine],
    ['Collègue', e.collegue || VIDE],
    ['Apporteur', e.apporteur || VIDE],
    ['Taux d’apporteur', e.apporteur_taux === null || e.apporteur_taux === '' ? VIDE
      : `${String(Number((Number(e.apporteur_taux) * 100).toPrecision(12))).replace('.', ',')} %`],
    ['Hono. d’apporteur', montant(e.apporteur_commission_saisie)],
    ['Choix de prime', e.prime_mode === null ? VIDE : LIBELLE_CHOIX_PRIME[e.prime_mode] ?? e.prime_mode],
    ['Prime de gestion (montant saisi)', montant(e.prime_gestion_saisie)],
  ];
}

/** Les champs qui ont changé, « ancienne → nouvelle ». */
export function changementsLigne(avant: EtatCommercialLu, apres: EtatCommercialLu): { champ: string; avant: string; apres: string }[] {
  const a = etatCommercialEnTexte(avant);
  const b = etatCommercialEnTexte(apres);
  return a.flatMap(([champ, v], i) => (v === b[i][1] ? [] : [{ champ, avant: v, apres: b[i][1] }]));
}

/** Un statut du bien, en mots : le statut validé, ou « statut calculé ». */
export const motStatutBien = (n: string | null): string =>
  (n !== null && (NATURES_BIEN as readonly string[]).includes(n) ? LIBELLE_NATURE_BIEN[n as NatureBien] : 'statut calculé');
