/**
 * Accès données (LECTURE SEULE) de la tuile « Permis de construire » (chantier S3) : exécute les requêtes construites
 * par `priorite.ts` et attache le libellé de catégorie via `classer` (une seule source de libellé). N'écrit jamais.
 */
import { query } from '../db/client';
import type { ConfigVeille } from './veilleConfig';
import {
  type FiltresPermis, type CleCategorie,
  classer, libelleParRang, construireRequeteListe, construireRequeteTotal, construireRequeteComptes,
  REQUETE_COMPTEURS_ETAT, compteursEtatDepuisRow, FILTRES_PERMIS_VIDES,
} from './priorite';

/** Une ligne de dossier prête pour l'affichage (champs bruts + catégorie résolue). */
export interface DossierAffiche {
  id: number;
  type: 'PC' | 'PD';
  numDau: string;
  codeInsee: string;
  departement: string;
  dateReelleAutorisation: string | null;
  surfCreee: number | null;
  superficieTerrain: number | null;
  nbLgtTotCrees: number | null;
  adrNumTer: string | null;
  adrLibvoieTer: string | null;
  adrLocaliteTer: string | null;
  adrCodpostTer: string | null;
  cadastre: string[]; // 0..3 références « SEC NUM »
  etatDau: string | null; // état d'avancement LIVE agrégé (2/4/5/6…), null = jamais revu (S12)
  etatAmbigu: boolean; // lignes du dossier divergentes (≥ 2 états) — informatif, n'exclut pas (S12b)
  dateDoc: string | null; // ouverture de chantier
  dateDaact: string | null; // achèvement des travaux
  vuAuDernier: boolean; // présent dans le dernier millésime (false = retiré du fichier)
  communeNom: string | null; // nom depuis le référentiel commune (NULL si code orphelin → « commune inconnue »)
  destEmail: string | null;
  destStatut: 'presume' | 'confirme' | 'invalide' | null;
  destCanal: 'email' | 'formulaire' | 'courrier' | 'inconnu' | null; // NULL = commune inconnue (pas de ligne contact)
  destUrlFormulaire: string | null;
  destAdressePostale: string | null;
  destPradaCourriel: string | null;     // S14d : bruts PRADA (résolution du destinataire faite en TS)
  destPradaImportId: number | null;
  destPradaNom: string | null;          // « Prénom Nom » composé, ou null
  categorie: CleCategorie;
  libelleCategorie: string;
  rang: number;
}

interface LigneSql {
  id: number; type: 'PC' | 'PD'; num_dau: string; code_insee: string; departement: string;
  date_reelle_autorisation: string | null; nature_projet_completee: string | null;
  i_extension: boolean | null; i_surelevation: boolean | null; nb_lgt_tot_crees: number | null;
  surf_creee: string | number | null; superficie_terrain: number | null;
  adr_num_ter: string | null; adr_libvoie_ter: string | null; adr_lieudit_ter: string | null;
  adr_localite_ter: string | null; adr_codpost_ter: string | null;
  sec_cadastre1: string | null; num_cadastre1: string | null; sec_cadastre2: string | null;
  num_cadastre2: string | null; sec_cadastre3: string | null; num_cadastre3: string | null;
  etat_dau: string | null; etat_ambigu: boolean; date_doc: string | null; date_daact: string | null; vu_au_dernier: boolean;
  commune_nom: string | null;
  dest_email: string | null;
  dest_statut: 'presume' | 'confirme' | 'invalide' | null;
  dest_canal: 'email' | 'formulaire' | 'courrier' | 'inconnu' | null;
  dest_url_formulaire: string | null;
  dest_adresse_postale: string | null;
  prada_courriel: string | null;
  prada_import_id: number | null;
  prada_nom: string | null;
  prada_prenom: string | null;
}

const nombre = (v: string | number | null): number | null => (v === null ? null : Number(v));

function refsCadastre(r: LigneSql): string[] {
  const refs: string[] = [];
  for (const [sec, num] of [[r.sec_cadastre1, r.num_cadastre1], [r.sec_cadastre2, r.num_cadastre2], [r.sec_cadastre3, r.num_cadastre3]]) {
    if ((sec ?? '').trim() !== '' || (num ?? '').trim() !== '') refs.push(`${(sec ?? '').trim()} ${(num ?? '').trim()}`.trim());
  }
  return refs;
}

function versAffiche(r: LigneSql, c: ConfigVeille): DossierAffiche {
  const surf = nombre(r.surf_creee);
  const cl = classer(
    { type: r.type, natureProjetCompletee: r.nature_projet_completee, iExtension: r.i_extension, iSurelevation: r.i_surelevation, nbLgtTotCrees: r.nb_lgt_tot_crees, surfCreee: surf },
    c,
  );
  return {
    id: r.id, type: r.type, numDau: r.num_dau, codeInsee: r.code_insee, departement: r.departement,
    dateReelleAutorisation: r.date_reelle_autorisation, surfCreee: surf, superficieTerrain: r.superficie_terrain,
    nbLgtTotCrees: r.nb_lgt_tot_crees, adrNumTer: r.adr_num_ter, adrLibvoieTer: r.adr_libvoie_ter, adrLocaliteTer: r.adr_localite_ter, adrCodpostTer: r.adr_codpost_ter,
    cadastre: refsCadastre(r), etatDau: r.etat_dau, etatAmbigu: r.etat_ambigu, dateDoc: r.date_doc, dateDaact: r.date_daact, vuAuDernier: r.vu_au_dernier,
    communeNom: r.commune_nom, destEmail: r.dest_email, destStatut: r.dest_statut,
    destCanal: r.dest_canal, destUrlFormulaire: r.dest_url_formulaire, destAdressePostale: r.dest_adresse_postale,
    destPradaCourriel: r.prada_courriel, destPradaImportId: r.prada_import_id,
    destPradaNom: [r.prada_prenom, r.prada_nom].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(' ') || null,
    categorie: cl.cle, libelleCategorie: cl.libelle, rang: cl.rang,
  };
}

export interface ResultatVeille {
  total: number;
  page: number;
  taille: number;
  lignes: DossierAffiche[];
  comptes: { rang: number; libelle: string; n: number }[];
  compteursEtat: { annules: number; absents: number; ambigus: number }; // jauges globales (S12/S12b)
  bornes: { min: string | null; max: string | null };
  /** Anciens codes (fusions) dont les dossiers sont inclus par la sélection courante — pour le dire à l'utilisateur. */
  inclusions: { ancien: string; nomAncien: string | null; actuel: string; n: number }[];
}

/**
 * Anciens codes (fusions) dont des dossiers sont repliés dans les communes ACTUELLES sélectionnées — avec leur nombre.
 * Vide si aucune commune sélectionnée. Sert l'avertissement « inclut N dossiers déposés sous Pierrefitte-sur-Seine ».
 */
async function lireInclusions(communes: string[]): Promise<ResultatVeille['inclusions']> {
  if (communes.length === 0) return [];
  const r = await query<{ ancien: string; nom_ancien: string | null; actuel: string; n: number }>(
    `SELECT f.ancien_code AS ancien, f.nom_ancien, f.code_actuel AS actuel, count(d.*)::int AS n
     FROM commune_fusion f JOIN sitadel_dossier d ON d.code_insee = f.ancien_code
     WHERE f.code_actuel = ANY($1::text[])
     GROUP BY f.ancien_code, f.nom_ancien, f.code_actuel
     HAVING count(d.*) > 0 ORDER BY n DESC`,
    [communes],
  );
  return r.rows.map((x) => ({ ancien: x.ancien, nomAncien: x.nom_ancien, actuel: x.actuel, n: x.n }));
}

/** Les `n` premiers dossiers du CLASSEMENT DE PRIORITÉ (aucun filtre) — base des candidats à demande (S7). Réutilise
 *  strictement l'ordonnancement de `construireRequeteListe` (priorite.ts). */
export async function lireDossiersPriorite(c: ConfigVeille, n: number): Promise<DossierAffiche[]> {
  const rq = construireRequeteListe(FILTRES_PERMIS_VIDES, c, 1, n);
  const r = await query<LigneSql>(rq.texte, rq.params);
  return r.rows.map((row) => versAffiche(row, c));
}

/** Liste filtrée paginée + total + compteurs par catégorie + bornes de dates + inclusions de fusion. */
export async function lireVeille(f: FiltresPermis, c: ConfigVeille, page: number, taille: number): Promise<ResultatVeille> {
  const rq = construireRequeteListe(f, c, page, taille);
  const rt = construireRequeteTotal(f, c);
  const rc = construireRequeteComptes(f, c);
  const [liste, total, comptes, etat, bornes, inclusions] = await Promise.all([
    query<LigneSql>(rq.texte, rq.params),
    query<{ n: number }>(rt.texte, rt.params),
    query<{ rang: number; n: number }>(rc.texte, rc.params),
    query<{ annules: number; absents: number; ambigus: number }>(REQUETE_COMPTEURS_ETAT),
    query<{ min: string | null; max: string | null }>(
      `SELECT min(date_reelle_autorisation)::text AS min, max(date_reelle_autorisation)::text AS max FROM sitadel_dossier`,
    ),
    lireInclusions(f.communes),
  ]);
  return {
    total: total.rows[0]?.n ?? 0,
    page,
    taille,
    lignes: liste.rows.map((r) => versAffiche(r, c)),
    comptes: comptes.rows.map((x) => ({ rang: x.rang, libelle: libelleParRang(x.rang, c), n: x.n })),
    compteursEtat: compteursEtatDepuisRow(etat.rows[0]),
    bornes: bornes.rows[0] ?? { min: null, max: null },
    inclusions,
  };
}
