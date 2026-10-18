/**
 * ══ 🔴🔴 TUILE LOCATION — CLIENTS ET CONTACTS À LA CRÉATION (Arno, 17/10/2026). MODULE PUR. ═══════════════════════════
 *
 * « Seuls les PROPRIÉTAIRES et les LOCATAIRES sont des clients ; toutes les autres personnes sont des CONTACTS. » (Arno)
 * Le même choix que la fiche de la Gestion (« Ajouter… » : « Propriétaire (client) » / « Contact du propriétaire ») :
 *   · une carte CLIENT crée une fiche de l'annuaire (propriétaire ou locataire) ; obligatoires ALLÉGÉS dans la Location :
 *     le nom ; la PREMIÈRE carte client est COMPLÈTE (téléphone ET e-mail — règle d'Arno du 18/10/2026, cf.
 *     `gestion/carteComplete`) ; civilité, prénom, adresse facultatifs — la Gestion garde les siens ;
 *   · une carte CONTACT est une carte de contact du BIEN, côté propriétaire ou locataire — la même table et le même rôle
 *     que « Contact du propriétaire / du locataire » de la Gestion. Sa règle est celle de la Gestion (le nom et au moins
 *     un e-mail) : c'est l'adresse e-mail qui IDENTIFIE une carte de contact (clé : bien, côté, adresse).
 * Au moins UNE carte client est obligatoire ; les contacts sont facultatifs, en nombre illimité.
 */
import { manquesDuContact } from '../gestion/ficheContact';
import type { CoordonneeSaisie } from '../gestion/annuaireEdition';

export type CoteCarte = 'proprietaire' | 'locataire';

export const MOT_CLIENT: Record<CoteCarte, string> = { proprietaire: 'Propriétaire (client)', locataire: 'Locataire (client)' };
export const MOT_CONTACT: Record<CoteCarte, string> = { proprietaire: 'Contact du propriétaire', locataire: 'Contact du locataire' };
/** L'étiquette de la carte (capitales, comme les badges de la Gestion). */
export const BADGE_CLIENT: Record<CoteCarte, string> = { proprietaire: 'Propriétaire', locataire: 'Locataire' };
export const BADGE_CONTACT: Record<CoteCarte, string> = { proprietaire: 'Contact du propriétaire', locataire: 'Contact du locataire' };
/** Les exemples de « Qualité », mis en avant sur une carte contact. */
export const EXEMPLES_QUALITE: Record<CoteCarte, string> = {
  proprietaire: 'conjoint, gestionnaire, notaire, gardien…',
  locataire: 'garant, conjoint, employeur…',
};

const rempli = (v: string | null | undefined): boolean => (v ?? '').trim() !== '';

/**
 * Une carte CLIENT créée dans la Location (règle d'Arno du 18/10/2026, qui REMPLACE « un téléphone OU un e-mail ») :
 *   · la PREMIÈRE carte client (aucune autre carte complète dans la famille) : le nom, un téléphone ET un e-mail ;
 *   · les SUIVANTES : le nom ; un téléphone ou un e-mail manquant passe par la FENÊTRE D'ALERTE (`manquesAAvertir`).
 */
export function manquesClientLocation(
  f: { nom: string | null | undefined; coordonnees: readonly CoordonneeSaisie[] | undefined }, premiere = false,
): Record<string, string> {
  const m: Record<string, string> = {};
  if (!rempli(f.nom)) m.nom = 'Le nom est obligatoire.';
  if (premiere) {
    const k = f.coordonnees ?? [];
    if (!k.some((c) => c.sorte === 'telephone' && rempli(c.valeur))) m.telephone = 'Première carte client : un téléphone est obligatoire.';
    if (!k.some((c) => c.sorte === 'email' && rempli(c.valeur))) m.email = 'Première carte client : un e-mail est obligatoire.';
  }
  return m;
}

/** Une carte CONTACT : la règle de la Gestion (le nom, et au moins un e-mail — c'est lui qui identifie le contact). */
export function manquesContactLocation(f: { nom: string | null | undefined; coordonnees: readonly CoordonneeSaisie[] | undefined }): Record<string, string> {
  return manquesDuContact({ nom: f.nom ?? '', coordonnees: f.coordonnees ?? [] });
}
