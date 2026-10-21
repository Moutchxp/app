import { sqlStatutBien } from '../gestion/statutBienRepo';
import { query } from '../db/client';
import { mandatsDesProprietaires } from './mandatBienRepo';
import { libelleMandat, sorteDuBien, type SorteMandat } from './mandatBien';
import { contactsRattachesDuBien } from './rattachementsRepo';
import type { ContactRattache } from './rattachements';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { familleDeCategorie, LIBELLE_FAMILLE, LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_LOCAL, LIBELLE_TYPE_LOGEMENT, LIBELLE_TYPE_PARKING, titreAnnexe,
  type SituationParking, type TypeLocal, type TypeLogement, type TypeParking } from './bienComplet';
import { LIBELLE_CATEGORIE } from './locationBien';
import { resumeAnnexe } from './annexeLocation';
import { sqlLienEnCours } from '../gestion/indivision';
import { sqlPersonneVivante } from '../gestion/personneVivanteSql';
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
    /** Arno (21/10/2026, migration 401) — l'ID fiscal du bien ; absent sans la migration ET pour une annexe ; `null` = non renseigné. */
    idFiscal?: string | null;
    annexes: { id: number; libelle: string; detachee: boolean }[];
    /**
     * Arno (20/10/2026, « tous les champs de Nouveau bien ») — la famille (clé), le détail de chaque type, l'époque de
     * construction et le chauffage, et le détail de chaque annexe (situation, type, étage, lot, porte/place, adresse, annotation).
     */
    familleCle?: 'logement' | 'local' | 'parking' | null;
    typeLogement?: string | null; typeLocal?: string | null; parkingSituation?: string | null; parkingType?: string | null;
    epoqueConstruction?: string | null; chauffage?: string | null;
    annexesDetail?: { id: number; titre: string; detail: string; etage: string | null; adresse: string | null; annotation: string | null; detachee: boolean }[];
  };
  /** Adresse et situation (les champs de « Nouveau bien ») ; absent avant ce lot. */
  situation?: {
    batiment: string | null; escalier: string | null; etage: string | null; porte: string | null; precisionAcces: string | null;
    ascenseur: boolean | null; digicode: boolean | null; digicodeCode: string | null;
    /** Arno (21/10/2026, 396) — le digicode est celui de l'immeuble : sa mention, et `bien` si c'est encore l'ancienne valeur du bien. */
    digicodeMention?: string | null; digicodeSource?: 'immeuble' | 'bien' | null;
  };
  /** Copropriété : n° de lot, syndic (lien vers sa fiche), dernière AG de l'immeuble (sans objet sans immeuble). */
  copropriete?: {
    numLotCopro: string | null; syndic: { id: number; nom: string } | null; derniereAg: string | null; agApplicable: boolean;
    /** Arno (21/10/2026, migration 400) — qui règle les charges au syndic ; absent sans la migration, `null` = non renseigné. */
    chargesCopro?: 'proprietaire' | 'agence' | null;
  };
  /** DPE et assurance PNO. */
  dpe?: { classe: string | null; nonSoumis: boolean; date: string | null; assurancePno: boolean | null; pnoDateAnniversaire: string | null };
  /** Le commentaire libre, tel que saisi (retours à la ligne compris). */
  commentaire?: string | null;
  /** Les propriétaires du bien (le titulaire et les copropriétaires actifs) et leurs mandats. */
  proprietaires?: { id: number; nom: string; titulaire: boolean; mandatGestion: string | null; mandatTransaction: string | null }[];
  /**
   * Arno (21/10/2026, 397) — le MANDAT du bien : celui de ses propriétaires dont la sorte suit « Bien en gestion ? » (Oui →
   * gestion, Non → transaction locative), n° et date de signature ; une ligne par mandat distinct. `null` : rien de connu.
   */
  mandat?: { sorte: SorteMandat; lignes: string[] } | null;
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

  // Arno (21/10/2026, 403) : lu sur le STATUT du bien — location seule → mandat de transaction ; en / ancienne gestion → de gestion.
  const statutBien = (await query<{ s: string }>(`SELECT ${await sqlStatutBien('lo')} AS s FROM gestion_annuaire_lot lo WHERE lo.id = $1`, [lotId])).rows[0]?.s ?? null;
  const enGestionBien = statutBien === null ? null : statutBien !== 'location_seule';
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
  const proprietaires = await proprietairesDuBien(lotId);
  const sorteMandat = sorteDuBien(enGestionBien ?? true);
  const lignesMandat = sorteMandat === null ? [] : [...new Set((await mandatsDesProprietaires(proprietaires.map((p) => p.id)))
    .map((p) => libelleMandat(sorteMandat, p[sorteMandat])).filter((x): x is string => x !== null))];
  const familleCle = famille;
  return {
    caracteristiques: {
      famille: famille === null ? (bien.categorie ? LIBELLE_CATEGORIE[bien.categorie] : null) : LIBELLE_FAMILLE[famille],
      type, meuble: c?.meuble ?? null, nombrePieces: c?.nombrePieces ?? null,
      etage: bien.etage, porte: bien.porte, batiment: c?.batiment ?? null, escalier: c?.escalier ?? null, numLotCopro: bien.numLotCopro,
      surfaceHabitableM2: c?.surfaceHabitableM2 ?? null, surfaceCarrezM2: bien.surfaceCarrezM2, surfaceExterieureM2: bien.surfaceExterieureM2,
      surfaceM2: c?.surfaceM2 ?? null,
      ...(c?.idFiscal === undefined || bien.parentId != null ? {} : { idFiscal: c.idFiscal }),
      annexes: annexes.map((a) => ({ id: a.id, libelle: `${titreAnnexe(a, LIBELLE_CATEGORIE[a.categorie])}${a.porte === null ? '' : ` n° ${a.porte}`}`, detachee: a.detachee === true })),
      familleCle,
      typeLogement: c?.typeLogement ? LIBELLE_TYPE_LOGEMENT[c.typeLogement as TypeLogement] ?? c.typeLogement : null,
      typeLocal: c?.typeLocal ? LIBELLE_TYPE_LOCAL[c.typeLocal as TypeLocal] ?? c.typeLocal : null,
      parkingSituation: c?.parkingSituation ? LIBELLE_SITUATION_PARKING[c.parkingSituation as SituationParking] ?? c.parkingSituation : null,
      parkingType: c?.parkingType ? LIBELLE_TYPE_PARKING[c.parkingType as TypeParking] ?? c.parkingType : null,
      epoqueConstruction: c?.epoqueConstruction ?? null, chauffage: c?.chauffage ?? null,
      annexesDetail: annexes.map((a) => ({
        id: a.id, titre: titreAnnexe(a, LIBELLE_CATEGORIE[a.categorie]),
        detail: resumeAnnexe({ categorie: a.categorie, nomAnnexe: a.nomAnnexe, parkingSituation: a.parkingSituation, parkingType: a.parkingType, numLotCopro: a.numLotCopro, porte: a.porte }),
        etage: a.etage, adresse: a.adresseAutre ? [a.adresse, [a.codePostal, a.commune].filter((x) => x).join(' ')].filter((x) => x).join(', ') || null : null,
        annotation: a.annotation ?? null, detachee: a.detachee === true,
      })),
    },
    situation: {
      batiment: c?.batiment ?? null, escalier: c?.escalier ?? null, etage: bien.etage, porte: bien.porte, precisionAcces: c?.precisionAcces ?? null,
      ascenseur: c?.ascenseur ?? null, digicode: c?.digicode ?? null, digicodeCode: c?.digicodeCode ?? null,
      ...(c?.digicodeImmeuble === undefined ? {} : { digicodeMention: c.digicodeImmeuble.mention, digicodeSource: c.digicodeImmeuble.source }),
    },
    copropriete: {
      numLotCopro: bien.numLotCopro,
      syndic: c?.syndicId != null ? { id: c.syndicId, nom: c.syndicNom ?? `Syndic ${c.syndicId}` } : null,
      derniereAg: c?.derniereAg ?? null, agApplicable: c?.agApplicable === true,
      ...(c?.chargesCopro === undefined ? {} : { chargesCopro: c.chargesCopro }),
    },
    dpe: {
      classe: c?.dpeClasse ?? null, nonSoumis: c?.dpeNonSoumis === true, date: c?.dpeDate ?? null,
      assurancePno: c?.assurancePno ?? null, pnoDateAnniversaire: c?.pnoDateAnniversaire ?? null,
    },
    commentaire: c?.commentaire ?? null,
    proprietaires,
    mandat: sorteMandat === null || lignesMandat.length === 0 ? null : { sorte: sorteMandat, lignes: lignesMandat },
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

/**
 * Les propriétaires du bien : le titulaire, et les copropriétaires dont le lien est EN COURS et la fiche ni archivée ni
 * supprimée (la règle de la mention « Copropriétaire(s) », `indivision.ts`) ; avec leurs n° de mandat (gestion, transaction).
 */
export async function proprietairesDuBien(lotId: number): Promise<{ id: number; nom: string; titulaire: boolean; mandatGestion: string | null; mandatTransaction: string | null }[]> {
  const col = async (c: string): Promise<string> => ((await colonneExisteMemo('gestion_annuaire_proprietaire', c)) ? `p.${c}` : 'NULL::text');
  const liens = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'jusqu_a');
  const { rows } = await query<{ id: string; nom: string | null; titulaire: boolean; mg: string | null; mt: string | null }>(
    `SELECT p.id::text, coalesce(p.nom_complet, p.nom) AS nom, (p.id = lo.proprietaire_id) AS titulaire,
            ${await col('numero_mandat_gestion')} AS mg, ${await col('numero_mandat_transaction')} AS mt
       FROM gestion_annuaire_lot lo JOIN gestion_annuaire_proprietaire p
         ON p.id = lo.proprietaire_id${liens ? ` OR (p.archive_le IS NULL AND ${await sqlPersonneVivante('p')} AND EXISTS (
              SELECT 1 FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = lo.id AND lp.proprietaire_id = p.id AND ${sqlLienEnCours('lp')}))` : ''}
      WHERE lo.id = $1
      ORDER BY (p.id = lo.proprietaire_id) DESC, coalesce(p.nom_complet, p.nom)`, [lotId]);
  return rows.map((r) => ({ id: Number(r.id), nom: r.nom ?? `Propriétaire ${r.id}`, titulaire: r.titulaire, mandatGestion: r.mg, mandatTransaction: r.mt }));
}
