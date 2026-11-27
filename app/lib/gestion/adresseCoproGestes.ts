/**
 * ══ 🔴🔴 RETIRER UNE ADRESSE DE LA COPROPRIÉTÉ, CHANGER L'ADRESSE PRINCIPALE (Arno, 26/11/2026, 12h50, point 1). MODULE PUR. ══════════════════════════
 *
 * « On doit pouvoir supprimer les blocs d'adresses individuellement, avec une fenêtre de validation intermédiaire. » La fenêtre dit l'adresse, ses
 * digicodes, bâtiments et cages (ils partent AVEC elle : ils restent attachés à l'adresse, ils ne s'affichent plus dans cette copropriété), et les biens
 * du portefeuille à cette adresse (ce que ça change pour eux). Le retrait est journalisé dans l'historique de la copropriété (le même texte) ; rien
 * n'est effacé. L'adresse principale ne se retire pas : « Choisissez d'abord une autre adresse principale » (« Définir comme adresse principale »).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (l'écran l'importe).
 */
import { majusculesDigicode } from '../location/digicodeImmeuble';
import { adresseImmeuble } from './syndics';

export const LIBELLE_RETIRER_ADRESSE = 'Retirer cette adresse';
/** 🔴 (Arno, 27/11/2026, 23h30) « demander de valider ou d'annuler » : « Valider le retrait » / « Annuler » (avant : « Oui, retirer cette adresse »). */
export const LIBELLE_OUI_RETIRER_ADRESSE = 'Valider le retrait';
export const TEXTE_RETRAIT_ADRESSE = 'Vous allez retirer cette adresse de la copropriété, avec l’ensemble des digicodes et des bâtiments / cages d’escalier qui lui sont associés :';
export const AUCUN_AUTRE_BIEN = 'aucun autre bien concerné';
export const LIBELLE_DEFINIR_PRINCIPALE = 'Définir comme adresse principale';
export const MOTIF_PRINCIPALE_NON_RETIRABLE = 'Choisissez d’abord une autre adresse principale : l’adresse principale ne peut pas être retirée.';
export const MOTIF_ADRESSE_ABSENTE = 'Cette adresse n’est pas (ou plus) une adresse de cette copropriété : rechargez la fiche.';
export const CONSEQUENCE_BIENS = 'Ils ne seront plus rattachés à cette copropriété : son syndic, ses AG et le suivi des 20 % ne s’appliqueront plus à eux. Les digicodes de l’adresse restent attachés à l’adresse.';

/** Une valeur de digicode en mots. PUR. */
export const motCode = (v: { digicode: boolean | null; code: string | null }): string =>
  (v.digicode === false ? 'pas de digicode' : (v.code ?? '') !== '' ? `code ${majusculesDigicode(v.code ?? '')}` : v.digicode === true ? 'oui (code inconnu)' : 'aucun code connu');

export interface DigicodesDeLAdresse { commun: { digicode: boolean | null; code: string | null }; batiments: { libelle: string; digicode: boolean | null; code: string | null }[] }
export interface BienDeLAdresse { numero: string; adresse: string | null }

/** Ce qui part avec l'adresse : ses digicodes (copropriété, puis chaque bâtiment / cage), et les biens du portefeuille qui s'y trouvent. PUR. */
export function resumeAdresse(d: DigicodesDeLAdresse | null | undefined, biens: readonly BienDeLAdresse[]): { digicodes: string[]; biens: string[] } {
  const digicodes = d === null || d === undefined ? [] : [
    ...(d.commun.digicode !== null || (d.commun.code ?? '') !== '' ? [`digicode copropriété : ${motCode(d.commun)}`] : []),
    // 🔴 (Arno, 27/11/2026, 23h30) « Bâtiment / cage » devient « Bâtiment / cage d'escalier » partout à l'écran
    ...d.batiments.map((b) => `bâtiment / cage d’escalier ${b.libelle} : ${motCode(b)}`)];
  return { digicodes, biens: biens.map((b) => `n° ${b.numero}${b.adresse ? ` (${b.adresse})` : ''}`) };
}

/**
 * 🔴🔴 (Arno, 27/11/2026, 23h30) « dire si cela impacte d'autres biens déjà enregistrés dans cette copropriété que celui que l'on est en train de créer » :
 * les biens du portefeuille à cette adresse, SÉPARÉS entre le bien d'où la fiche est ouverte (`lotEnCours`) et les AUTRES. PUR.
 */
export function biensTouchesParLeRetrait(biens: readonly (BienDeLAdresse & { id: number; cle?: string })[], cle: string, lotEnCours: number | null | undefined):
  { ceBien: string | null; autres: string[] } {
  const ici = biens.filter((b) => b.cle === cle);
  const mot = (b: BienDeLAdresse) => `n° ${b.numero}${b.adresse ? ` (${b.adresse})` : ''}`;
  const c = lotEnCours == null ? undefined : ici.find((b) => b.id === lotEnCours);
  return { ceBien: c === undefined ? null : mot(c), autres: ici.filter((b) => b !== c).map(mot) };
}

/** Le texte du journal d'un retrait d'adresse (lisible dans l'historique de la copropriété). PUR. */
export function texteRetraitAdresse(a: { libelle: string; codePostal: string | null; commune: string | null }, r: { digicodes: string[]; biens: string[] }): string {
  return [`Adresse retirée de la copropriété : ${adresseImmeuble(a.libelle, a.codePostal, a.commune)}`,
    r.digicodes.length > 0 ? `digicodes et bâtiments partis avec elle : ${r.digicodes.join(' · ')}` : 'aucun digicode ni bâtiment à cette adresse',
    r.biens.length > 0 ? `biens du portefeuille à cette adresse : ${r.biens.join(' · ')}` : 'aucun bien du portefeuille à cette adresse'].join(' — ');
}
