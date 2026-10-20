import { withTransaction, type RequeteTx } from '../db/client';
import { lireCartesRattachees, poserLocataireDeCarteDans, type CarteRattacheeLue } from '../gestion/partieCategorieRepo';
import type { Auteur } from '../gestion/gestes';
import { garantsDisponibles } from './bailRepo';
import { estGarant } from './cartesLocation';
import { motRattachement, type ContactRattache, type RattachementContact } from './rattachements';

export type { ContactRattache };

/**
 * ══ 🔴🔴 GARANTS ET CONTACTS RATTACHÉS (Arno, 20/10/2026, migration 393). IMPUR (base). ═════════════════════════════════
 *
 * · un GARANT : une ligne `gestion_bail_garant` par locataire garanti (bail + carte + locataire, FK partout ; la base refuse
 *   un locataire qui n'est pas occupant du bail). Un retrait se MARQUE (`retire_le`), jamais une suppression.
 * · un autre CONTACT : le locataire de sa carte (`locataire_id`, posé par `partieCategorieRepo`) — posé seulement sur une
 *   carte encore libre, jamais par-dessus le rattachement d'un autre.
 * Chaque rattachement est écrit au journal. 🔴 AVANT LA 393 : rien n'est écrit, rien n'est lu (sondé) ; les cartes s'affichent
 * comme avant.
 */

/** Un contact posé, et ce qu'il faut lui rattacher : `locataireIds` = les fiches dans l'ordre des rangs de l'écran. */
export async function ecrireRattachementsDans(q: RequeteTx, bailId: number, cartes: readonly { carteId: number | null; r: RattachementContact }[],
  locataireIds: readonly number[], auteur: Auteur): Promise<number> {
  let n = 0;
  for (const { carteId, r } of cartes) {
    if (carteId === null) continue;
    for (const rang of r.garantit) {
      const loc = locataireIds[rang];
      if (loc === undefined) continue;
      const { rowCount } = await q(
        `INSERT INTO gestion_bail_garant (bail_id, carte_id, locataire_id, cree_par_libelle) VALUES ($1, $2, $3, $4)
         ON CONFLICT (bail_id, carte_id, locataire_id) WHERE retire_le IS NULL DO NOTHING`, [bailId, carteId, loc, auteur.libelle]);
      if ((rowCount ?? 0) > 0) { n += 1; await journal(q, loc, 'location_garant_rattache', `garant (carte ${carteId}) du bail ${bailId}`, auteur); }
    }
    if (r.locataire !== null) {
      const loc = locataireIds[r.locataire];
      if (loc === undefined) continue;
      if (await poserLocataireDeCarteDans(q, carteId, loc)) { n += 1; await journal(q, loc, 'location_contact_rattache', `contact (carte ${carteId})`, auteur); }
    }
  }
  return n;
}

/** Hors transaction de l'appelant (les contacts sont posés après la création du bail). */
export function ecrireRattachements(bailId: number, cartes: readonly { carteId: number | null; r: RattachementContact }[],
  locataireIds: readonly number[], auteur: Auteur): Promise<number> {
  return withTransaction((q) => ecrireRattachementsDans(q, bailId, cartes, locataireIds, auteur));
}

async function journal(q: RequeteTx, locataireId: number, action: string, detail: string, auteur: Auteur): Promise<void> {
  await q(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('annuaire', $1, $2, NULL, NULL, $3, $4, $5)`, [locataireId, action, detail, auteur.id, auteur.libelle]);
}

/**
 * Les cartes « contact du locataire » d'un bien (non retirées), et leur rattachement. `null` sans la 393 (l'écran garde son
 * affichage d'avant). Rien n'est filtré : une carte sans rattachement est rendue, avec « à rattacher à un locataire ».
 * (Le SQL des cartes vit dans `partieCategorieRepo`, le seul fichier qui nomme leur table.)
 */
export async function contactsRattachesDuBien(lotId: number): Promise<ContactRattache[] | null> {
  if (!(await garantsDisponibles())) return null;
  return (await lireCartesRattachees({ lotId })).map(versContact);
}

/** Les garants et contacts d'UN locataire (fiche du locataire). `null` sans la 393. */
export async function contactsRattachesDuLocataire(locataireId: number): Promise<ContactRattache[] | null> {
  if (!(await garantsDisponibles())) return null;
  return (await lireCartesRattachees({ locataireId })).map(versContact);
}

function versContact(r: CarteRattacheeLue): ContactRattache {
  const garanties = r.garanties ?? [];
  // Un garant se lit par ses garanties ; une carte « Garant » sans garantie posée peut porter un locataire (reprise) — gardé.
  const garant = estGarant(r.qualite) || garanties.length > 0;
  const vus = new Map<number, string>();
  for (const g of garanties) vus.set(Number(g.id), g.nom);
  if (r.loc_id !== null) vus.set(Number(r.loc_id), r.loc_nom ?? '');
  const locataires = [...vus].map(([id, nom]) => ({ id, nom }));
  return {
    carteId: Number(r.id), nom: [r.nom, r.prenom].filter((x) => x && x.trim() !== '').join(' ') || r.adresse, qualite: r.qualite, garant,
    locataires, bailIds: [...new Set(garanties.map((g) => Number(g.bail)))],
    mot: motRattachement({ garant: garant && garanties.length > 0, locataires: locataires.map((l) => l.nom) }),
  };
}

