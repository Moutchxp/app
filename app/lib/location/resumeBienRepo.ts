import { query } from '../db/client';
import { contactsRattachesDuBien } from './rattachementsRepo';
import type { ContactRattache } from './rattachements';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { familleDeCategorie, LIBELLE_FAMILLE, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL, LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, titreAnnexe,
  type SituationParking, type TypeLocal, type TypeLogement, type TypeParking } from './bienComplet';
import { LIBELLE_CATEGORIE } from './locationBien';
import { ficheBienLocation } from './locationRepo';
import { conditionsParOccupation } from './conditionsEntreeRepo';
import { loyerConnuDuBien, loyerDesOccupations } from './loyerEntreeRepo';
import { baremeEnVigueur, zoneDuBien, type ZoneHonoraires } from './honorairesProprietaire';
import { lireBaremes, reglesZones } from './honorairesProprietaireRepo';
import type { LoyerMensuel } from './conditionsEntree';

/**
 * ══ 🔴🔴 FICHE BIEN (GESTION) — LE RÉSUMÉ COMPLET (Arno, 20/10/2026). LECTURE SEULE. ═══════════════════════════════════════
 *
 * « Toutes les informations du BIEN saisies ou calculées dans le module Location, LUES À LEUR SOURCE, sans aucune copie ni
 * double enregistrement. » Ce module ne fait qu'ASSEMBLER des lectures existantes :
 *   · la fiche Location du bien (`ficheBienLocation` : le lot, ses compléments, ses annexes, ses occupations) ;
 *   · le statut « en gestion » du bien (migration 390) ;
 *   · la zone (table des zones, la même règle que le calcul des honoraires) et le barème en vigueur AUJOURD'HUI ;
 *   · la location en cours : les occupations sans sortie, leurs conditions d'entrée (391/392), leur loyer de départ (370) ;
 *     bien libre : le dernier loyer de départ connu du bien.
 * Aucune écriture. Chaque partie absente (migration non appliquée) se lit `null` : l'écran écrit « non renseigné(e) ».
 */

export interface ResumeBien {
  caracteristiques: {
    famille: string | null;
    type: string | null;
    meuble: boolean | null;
    nombrePieces: number | null;
    etage: string | null; porte: string | null; batiment: string | null; escalier: string | null; numLotCopro: string | null;
    surfaceHabitableM2: number | null; surfaceCarrezM2: number | null; surfaceExterieureM2: number | null; surfaceM2: number | null;
    annexes: { id: number; libelle: string; detachee: boolean }[];
  };
  gestion: {
    /** « Bien en gestion ? » (migration 390) ; `null` sans elle. */
    enGestionBien: boolean | null;
    zone: ZoneHonoraires;
    /** Le barème en vigueur aujourd'hui (€ TTC/m²) : tarif de la zone et état des lieux ; `null` sans barème. */
    bareme: { depuis: string; tarifZone: string; tarifEdl: string } | null;
    entretienAPrevoir: boolean | null;
    entretiens: { sorte: string; nom: string | null; dateAnniversaire: string | null }[];
  };
  location: {
    statut: 'libre' | 'loue';
    locataires: { id: number; nom: string; entree: string | null }[];
    entree: string | null;
    /** Loyer du bail en cours (loué), sinon le dernier loyer de départ connu (libre). */
    loyer: LoyerMensuel | null;
    loyerSource: 'bail' | 'depart' | null;
    depot: { mode: 'agence' | 'bailleur'; montantCentimes: number | null } | null;
    prelevement: { actif: boolean; jour: number | null } | null;
    /** Arno (20/10/2026, 393) — les garants et contacts côté locataire, et leur rattachement ; absent sans la migration. */
    contacts?: ContactRattache[];
  };
}

export async function resumeDuBien(lotId: number): Promise<ResumeBien | null> {
  const fb = await ficheBienLocation(lotId);
  if (fb.etat !== 'ok') return null;
  const { bien, complements: c, annexes, fiche } = fb.data;
  const famille = familleDeCategorie(bien.categorie);
  const type = c?.typeLogement ? LIBELLE_TYPE_LOGEMENT[c.typeLogement as TypeLogement]
    : c?.typeLocal ? LIBELLE_TYPE_LOCAL[c.typeLocal as TypeLocal]
      : c?.parkingType ? [LIBELLE_TYPE_PARKING[c.parkingType as TypeParking], c.parkingSituation ? LIBELLE_SITUATION_PARKING[c.parkingSituation as SituationParking] : null].filter((x) => x).join(' · ')
        : null;

  const enGestionBien = (await colonneExisteMemo('gestion_annuaire_lot', 'en_gestion'))
    ? (await query<{ g: boolean }>('SELECT en_gestion AS g FROM gestion_annuaire_lot WHERE id = $1', [lotId])).rows[0]?.g ?? null
    : null;
  const { rows: jour } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  const zone = zoneDuBien({ codePostal: bien.codePostal, commune: bien.commune }, await reglesZones());
  const b = baremeEnVigueur(await lireBaremes(), jour[0].j);
  const champ = zone === 'tres_tendue' ? 'tresTendue' : zone === 'tendue' ? 'tendue' : 'autre';

  const enCours = fiche.occupations.filter((o) => o.encours);
  const ids = enCours.map((o) => o.occupationId);
  const conditions = ids.length === 0 ? null : [...(await conditionsParOccupation(ids)).values()][0] ?? null;
  const loyerBail = ids.length === 0 ? null : await loyerDesOccupations(ids);
  const loyerDepart = ids.length === 0 ? await loyerConnuDuBien(lotId) : null;
  const entrees = enCours.map((o) => o.entree).filter((x): x is string => x !== null).sort();
  // Le prénom de chaque locataire en place (deux colocataires portent souvent le même nom).
  const prenoms = new Map<number, string | null>();
  if (enCours.length > 0) {
    const { rows } = await query<{ id: string; prenom: string | null }>(
      'SELECT id::text, prenom FROM gestion_annuaire_locataire WHERE id = ANY($1::bigint[])', [enCours.map((o) => o.locataireId)]);
    for (const r of rows) prenoms.set(Number(r.id), r.prenom);
  }

  const contacts = await contactsRattachesDuBien(lotId);
  return {
    caracteristiques: {
      famille: famille === null ? (bien.categorie ? LIBELLE_CATEGORIE[bien.categorie] : null) : LIBELLE_FAMILLE[famille],
      type, meuble: c?.meuble ?? null, nombrePieces: c?.nombrePieces ?? null,
      etage: bien.etage, porte: bien.porte, batiment: c?.batiment ?? null, escalier: c?.escalier ?? null, numLotCopro: bien.numLotCopro,
      surfaceHabitableM2: c?.surfaceHabitableM2 ?? null, surfaceCarrezM2: bien.surfaceCarrezM2, surfaceExterieureM2: bien.surfaceExterieureM2,
      surfaceM2: c?.surfaceM2 ?? null,
      annexes: annexes.map((a) => ({ id: a.id, libelle: `${titreAnnexe(a, LIBELLE_CATEGORIE[a.categorie])}${a.porte === null ? '' : ` n° ${a.porte}`}`, detachee: a.detachee === true })),
    },
    gestion: {
      enGestionBien, zone,
      bareme: b === null ? null : { depuis: b.depuis, tarifZone: b[champ], tarifEdl: b.etatDesLieux },
      entretienAPrevoir: c?.entretienAPrevoir ?? null, entretiens: c?.entretiens ?? [],
    },
    location: {
      statut: enCours.length > 0 ? 'loue' : 'libre',
      locataires: enCours.map((o) => ({ id: o.locataireId, nom: [o.nom, prenoms.get(o.locataireId)].filter((x) => x).join(' '), entree: o.entree })),
      entree: entrees[0] ?? null,
      loyer: loyerBail ?? (loyerDepart === null ? null : { principal: loyerDepart.principal, provisions: loyerDepart.provisions }),
      loyerSource: loyerBail !== null ? 'bail' : loyerDepart !== null ? 'depart' : null,
      depot: conditions === null ? null : { mode: conditions.conditions.depot, montantCentimes: conditions.conditions.sommes.depotGarantie },
      prelevement: conditions === null ? null : { actif: conditions.conditions.prelevement, jour: conditions.conditions.jour },
      ...(contacts === null ? {} : { contacts }),
    },
  };
}
