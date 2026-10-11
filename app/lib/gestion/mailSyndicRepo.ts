import { ficheLot, type PersonneAnnuaire } from './annuaireRepo';
import { contactsDeLImmeuble } from './contactsImmeubleRepo';
import { ficheSyndic } from './syndicRepo';
import { adresseImmeuble, communeLisible } from './syndics';
import {
  corpsMailSyndic, objetMailSyndic, selectionObjet, type DestinataireAppel, type LocataireDuMail,
} from './mailSyndic';

/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — CE QU'ON LIT AU CLIC SUR « Écrire depuis gestion@ ». LECTURE SEULE. ═══════════
 *
 * Le syndic (son nom, ses contacts et leur civilité), le carnet de l'immeuble du bien, et la fiche du bien (adresse,
 * nature, type, propriétaires, locataires en place). Aucune écriture, aucune ligne de journal : la base est lue au
 * moment du clic, et c'est le module pur `mailSyndic` qui écrit le texte.
 */

export interface MailSyndicPrepare {
  objet: string;
  /** La plage de l'objet à sélectionner à l'ouverture (« XXXXXXXX »). */
  selection: [number, number] | null;
  /** Le corps en texte brut, SANS la signature (l'écran l'ajoute dessous). */
  corps: string;
}

const egal = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** « NOM Prénom » tels qu'en base. */
function nomPrenom(p: Pick<PersonneAnnuaire, 'nom' | 'prenom'>): string {
  return [p.nom, p.prenom ?? ''].map((x) => x.trim()).filter((x) => x !== '').join(' ');
}

/** Le premier téléphone et le premier e-mail en cours d'une personne. */
function locataireDuMail(p: PersonneAnnuaire): LocataireDuMail {
  const actifs = p.contacts.filter((c) => !c.absent);
  return {
    nom: nomPrenom(p),
    telephone: actifs.find((c) => c.sorte === 'telephone')?.affichage ?? null,
    email: actifs.find((c) => c.sorte === 'email')?.valeur ?? null,
  };
}

/**
 * Prépare l'objet et le corps. `null` = syndic inconnu (la route répond 404 ; l'écran ouvre alors le message
 * adressé, sans pré-remplissage — exactement comme avant ce lot).
 */
export async function preparerMailSyndic(syndicId: number, lotId: number | null, a: readonly string[]): Promise<MailSyndicPrepare | null> {
  const fiche = await ficheSyndic(syndicId, lotId);
  if (fiche === null) return null;
  const lu = lotId === null ? null : await ficheLot(lotId);
  const lot = lu !== null && lu.etat === 'ok' ? lu.data : null;
  const carnet = lot !== null && (lot.immeuble ?? '').trim() !== '' ? await contactsDeLImmeuble(lot.immeuble as string) : [];

  // La civilité de chaque destinataire en « À » : un contact du syndic, sinon du carnet ; sinon `null` (générique).
  // ⚠️ L'E-MAIL GÉNÉRIQUE DU SYNDIC PRIME, même s'il est aussi l'adresse d'un contact : il s'adresse au cabinet,
  // donc « Madame, Monsieur » (règle d'Arno : « une adresse non-contact (e-mail générique) »).
  const connus = [...fiche.contacts, ...carnet];
  const destinataires: DestinataireAppel[] = a.map((email) => {
    if ((fiche.email ?? '').trim() !== '' && egal(fiche.email as string, email)) return null;
    const c = connus.find((x) => x.coordonnees.some((k) => k.sorte === 'email' && egal(k.valeur, email)));
    return c === undefined ? null : { civilite: c.civilite ?? null, nom: c.nom };
  });

  const residence = lot === null || (lot.adresse ?? '').trim() === ''
    ? null : adresseImmeuble(lot.adresse as string, lot.codePostal, communeLisible(lot.commune));
  const objet = objetMailSyndic(fiche.nom, residence);
  const corps = corpsMailSyndic({
    destinataires,
    bien: lot === null ? null : {
      proprietaires: lot.proprietaires.filter((p) => !p.archive).map(nomPrenom),
      descriptif: { nature: lot.nature, typeBien: lot.typeBien, surfaceM2: lot.surfaceM2 },
      locataires: lot.occupants.filter((p) => !p.archive).map(locataireDuMail),
    },
  });
  return { objet, selection: selectionObjet(objet), corps };
}
