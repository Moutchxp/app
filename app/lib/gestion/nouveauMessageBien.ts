/**
 * ══ 🔴🔴 LOT BOUTON-NOUVEAU-MESSAGE-DANS-L-HISTORIQUE-DU-BIEN — LE « NOUVEAU MESSAGE » DÉJÀ RATTACHÉ AU BIEN ═════════
 *
 * ARNO (13/10/2026) : « Le clic ouvre LE MÊME compositeur que “Nouveau message”, avec TOUTES ses fonctions, mais déjà
 * rattaché au bien de la fiche. »
 *
 * 🔴 RIEN N'EST INVENTÉ ICI : le brouillon est assemblé avec les pièces qui existent déjà.
 *   · le « Nouveau message » de la colonne (`preparerBrouillon('nouveau', …)`, fait par l'appelant) ;
 *   · la lecture du bien que fait déjà « Écrire depuis gestion@ » depuis une fiche (`preremplirDemande`, route
 *     `/biens/[id]/ecrire` en lecture seule) : le bien pré-coché, les adresses du dossier, le dossier Drive ;
 *   · la formule d'appel calculée sur « À » (`formulePour`, `AppelAuto`), que le compositeur recalcule déjà à chaque
 *     changement de « À » — tant que la première ligne n'a pas été retouchée à la main ;
 *   · la mise en forme du corps et de la signature du mail pré-rempli (`brouillonMailSyndic`).
 *
 * ⚠️ AUCUNE ÉCRITURE : une lecture, et rien n'est enregistré tant qu'Arno n'a rien modifié (le brouillon pré-rempli EST
 * l'étalon du compositeur). Lecture impossible ⇒ le message s'ouvre quand même, le bien toujours pré-coché.
 */
import { brouillonMailSyndic, formulePour, preremplirDemande, type AppelAuto, type Prerempli } from './mailSyndic';
import { civilitesDesSuggestions, type GroupeSuggestions } from './suggestionsBien';

/** Le mot du bouton : celui du gros bouton rouge de la colonne, au caractère près. */
export const MOT_NOUVEAU_MESSAGE = 'Nouveau message';

/** Le bien de la fiche : son identifiant interne (lecture des adresses), sa clé WIPPIMMO et son libellé (repli). */
export interface BienDeLaFiche { lotId: number; cle: string; libelle: string }

/** La table des civilités telle que la formule la lit : adresse en minuscules. PUR. */
export function civilitesPourAppel(groupes: readonly GroupeSuggestions[] | null | undefined): AppelAuto['civilites'] {
  const out: AppelAuto['civilites'] = {};
  for (const [adresse, c] of Object.entries(civilitesDesSuggestions(groupes ?? []))) out[adresse.trim().toLowerCase()] = c;
  return out;
}

/**
 * LE BROUILLON DU « NOUVEAU MESSAGE » DE LA FICHE. `base` = le « Nouveau message » de la colonne, tel quel.
 * Le corps commence par la formule d'appel (« Bonjour Madame, Monsieur, » tant que « À » est vide), deux lignes vides,
 * puis la signature — la forme du mail pré-rempli depuis une fiche.
 */
export async function brouillonNouveauDepuisLeBien<B extends {
  objet: string; corps: string; corpsHtml?: string | null; cibles?: unknown[]; a?: readonly string[];
}>(
  base: B, bien: BienDeLaFiche, signature: { texte?: string | null; html?: string | null },
  lire: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<B & Prerempli<GroupeSuggestions>> {
  /* L'adresse est vide : sans fiche syndic, `preremplirDemande` ne s'en sert pour aucune lecture. */
  const lu = await preremplirDemande<B, GroupeSuggestions>({ email: '', contexte: { lotId: bien.lotId } }, base, signature, lire);
  const cibles = (lu.cibles ?? []).some((c) => (c as { sorte?: string }).sorte === 'lot')
    ? lu.cibles
    : [{ sorte: 'lot' as const, cle: bien.cle, id: bien.lotId, libelle: bien.libelle }];
  const civilites = civilitesPourAppel(lu.suggestionsBien);
  const formule = formulePour((base.a ?? []).filter((x) => x.trim() !== ''), civilites);
  const { corps, corpsHtml } = brouillonMailSyndic({ objet: base.objet, surlignage: null, corps: `${formule}\n\n\n` }, signature);
  return { ...lu, cibles, corps, corpsHtml, appel: { formule, civilites } };
}
