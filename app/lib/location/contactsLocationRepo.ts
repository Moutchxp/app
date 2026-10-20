import { query } from '../db/client';
import { ficheAEnvoyer, premierEmail, premierTelephone } from '../gestion/ficheContact';
import { poserCarteAlaMain, poserCategorieAlaMain } from '../gestion/partieCategorieRepo';
import type { CoordonneeSaisie } from '../gestion/annuaireEdition';
import type { Auteur } from '../gestion/gestes';
import { manquesContactLocation, type CoteCarte } from './cartesLocation';

/**
 * ══ 🔴🔴 TUILE LOCATION — LES CONTACTS SAISIS À LA CRÉATION (Arno, 17/10/2026). IMPUR (base). ═════════════════════════
 *
 * « Un contact n'est PAS un client. Il est enregistré comme contact rattaché au(x) propriétaire(s) créé(s) et au bien créé
 * ensuite, exactement comme le fait la Gestion avec “Contact du propriétaire” (même table, même rôle, aucune nouvelle
 * notion). » (Arno)
 * 🔴 C'EST LITTÉRALEMENT LA PORTE DE LA GESTION : `poserCategorieAlaMain` (le rangement de l'adresse, côté propriétaire ou
 * locataire du bien) puis `poserCarteAlaMain` (la carte « CONTACT DU PROPRIÉTAIRE / DU LOCATAIRE »), avec la fiche du
 * formulaire traduite par `ficheAEnvoyer` — exactement ce que fait le « + » de la fiche du bien.
 * Une carte de contact se range sur un BIEN : c'est pourquoi les contacts d'un propriétaire sont enregistrés une fois le
 * bien créé. Aucun DELETE ici.
 */
export interface ContactSaisi {
  civilite?: string | null; nom?: string | null; prenom?: string | null; qualite?: string | null;
  adresse?: string | null; codePostal?: string | null; commune?: string | null; note?: string | null;
  coordonnees?: CoordonneeSaisie[];
}

/** Vérifie TOUS les contacts avant la moindre écriture (le nom, et au moins un e-mail). `null` = tout va bien. */
export function refusContacts(contacts: readonly ContactSaisi[]): string | null {
  for (const [i, c] of contacts.entries()) {
    const m = Object.values(manquesContactLocation({ nom: c.nom ?? '', coordonnees: c.coordonnees ?? [] }));
    if (m.length > 0) return `Contact ${i + 1} : ${m.join(' ')}`;
  }
  return null;
}

/** Enregistre les contacts sur le bien, côté propriétaire ou locataire. Rend le nombre posé, ou le motif du refus. */
export async function creerContactsDuBien(lotId: number, cote: CoteCarte, contacts: readonly ContactSaisi[], auteur: Auteur):
  Promise<{ ok: true; n: number; carteIds: (number | null)[] } | { ok: false; motif: string }> {
  if (contacts.length === 0) return { ok: true, n: 0, carteIds: [] };
  const refus = refusContacts(contacts);
  if (refus !== null) return { ok: false, motif: refus };
  const { rows } = await query<{ cle: string }>('SELECT wippimmo_id AS cle FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  const lotCle = rows[0]?.cle;
  if (lotCle === undefined) return { ok: false, motif: 'Ce bien n’existe plus.' };
  let n = 0;
  // Arno (20/10/2026, 393) : l'identifiant de chaque carte posée (même ordre que les contacts), pour la rattacher au locataire.
  const carteIds: (number | null)[] = [];
  for (const [i, c] of contacts.entries()) {
    const fiche = ficheAEnvoyer({ ...c, nom: c.nom ?? '' });
    const adresse = premierEmail(fiche.coordonnees);
    if (adresse === null) return { ok: false, motif: `Contact ${i + 1} : il faut au moins une adresse e-mail.` };
    const range = await poserCategorieAlaMain({ adresse, lotCle, categorie: cote, auteur });
    if (!range.ok) return { ok: false, motif: `Contact ${i + 1} : ${range.motif}` };
    const carte = await poserCarteAlaMain({
      lotCle, cote, adresse, nom: fiche.nom, telephone: premierTelephone(fiche.coordonnees), auteur,
      fiche: {
        civilite: fiche.civilite, prenom: fiche.prenom, qualite: fiche.qualite, adressePostale: fiche.adressePostale,
        codePostal: fiche.codePostal, commune: fiche.commune, note: fiche.note, coordonnees: fiche.coordonnees,
      },
    });
    if (!carte.ok) return { ok: false, motif: `Contact ${i + 1} : ${carte.motif}` };
    carteIds.push(carte.id);
    n += 1;
  }
  return { ok: true, n, carteIds };
}
