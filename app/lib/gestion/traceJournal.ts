import { AsyncLocalStorage } from 'node:async_hooks';
import { query } from '../db/client';
import { colonneExisteMemo } from '../location/sondeLocation';
import { ECRANS_TRACES, type EcranTrace, type SujetTrace } from './traceFiche';
import { ACTIONS_RESTITUTION_HISTORIQUE, ligneRestitutionHistorique, parQui, restitutionDeLaLigne, type LigneRestitutionHistorique, type RestitutionLue } from '../location/restitutionHistorique';

/**
 * ══ 🔴 LA TRAÇABILITÉ D'UNE MODIFICATION DE FICHE (Arno, 24/10/2026, migration 417) ═════════════════════════════════════════
 *
 * Une modification faite depuis un écran qui le demande (« Suivi du mois ») porte, dans `gestion_journal`, la session de connexion
 * (`jti`) et l'écran d'origine, en plus de qui et quand (déjà là). Le contexte voyage avec l'appel (AsyncLocalStorage) : les gestes
 * EXISTANTS (`modifierPersonne`, `modifierFicheEntiere`…) écrivent leur journal comme avant, et y ajoutent ces colonnes quand un
 * contexte est posé. Sans contexte, ou sans la 417 : exactement les mêmes lignes qu'avant (aucun écran ne change).
 */
export interface TraceJournal { sessionId: string | null; ecran: EcranTrace }

const stockage = new AsyncLocalStorage<TraceJournal>();

/** Exécute `f` avec le contexte de trace (aucun contexte : `f` tel quel). */
export function avecTrace<T>(t: TraceJournal | null, f: () => Promise<T>): Promise<T> {
  return t === null ? f() : stockage.run(t, f);
}

export const traceCourante = (): TraceJournal | null => stockage.getStore() ?? null;

/** L'écran demandé par la requête, s'il est l'un des écrans tracés (sinon : aucun contexte). PUR. */
export function ecranDemande(brut: unknown): EcranTrace | null {
  return typeof brut === 'string' && (ECRANS_TRACES as readonly string[]).includes(brut) ? brut as EcranTrace : null;
}

/**
 * Les colonnes de trace à ajouter à une ligne de journal : rien sans la 417 ; avec elle, le sujet et le champ TOUJOURS (l'historique
 * d'un locataire ne se confond plus avec celui du propriétaire de même numéro), la session et l'écran quand un contexte est posé.
 * `depart` : le numéro du premier paramètre ($n) à utiliser.
 */
export async function colonnesTrace(o: { sujet: SujetTrace; champ: string | null }, depart: number):
  Promise<{ colonnes: string; marques: string; valeurs: unknown[] }> {
  if (!(await colonneExisteMemo('gestion_journal', 'ecran'))) return { colonnes: '', marques: '', valeurs: [] };
  const t = traceCourante();
  return {
    colonnes: ', sujet, champ, session_id, ecran',
    marques: `, $${depart}, $${depart + 1}, $${depart + 2}, $${depart + 3}`,
    valeurs: [o.sujet, o.champ, t?.sessionId ?? null, t?.ecran ?? null],
  };
}

/**
 * Le CONFLIT : une ligne de journal de cette fiche postérieure au repère pris à l'ouverture (`depuisId`, le dernier numéro de
 * journal connu alors). Rend qui et quand (la plus récente), ou null. Locataire : attribuée par `sujet` (417) ; une ligne sans sujet
 * ne compte que si aucun propriétaire ne porte ce numéro (rien n'est attribué au hasard). `q` : la requête de la transaction.
 */
export async function modificationDepuis(q: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  sujet: 'locataire' | 'proprietaire' | 'lot', id: number, depuisId: number): Promise<{ par: string; quand: string } | null> {
  const avec417 = await colonneExisteMemo('gestion_journal', 'ecran');
  const filtre = filtreFiche(sujet, avec417);
  const { rows } = await q(
    `SELECT j.survenu_le::text AS quand, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), j.auteur_libelle) AS par
       FROM gestion_journal j LEFT JOIN admin_utilisateur u ON u.id = j.auteur_id
      WHERE ${filtre} AND j.id > $2 ORDER BY j.id DESC LIMIT 1`, [id, depuisId]);
  const r = rows[0];
  return r === undefined ? null : { par: String(r.par ?? '—'), quand: String(r.quand) };
}

/** Le repère d'ouverture d'une fiche : le dernier numéro du journal (0 : vide). */
export async function repereJournal(): Promise<number> {
  const { rows } = await query<{ n: string | null }>('SELECT max(id)::text AS n FROM gestion_journal');
  return rows[0]?.n === null || rows[0]?.n === undefined ? 0 : Number(rows[0].n);
}

/**
 * Les lignes de journal d'une fiche. Lot : `annuaire_lot`. Personne : l'entité `annuaire` sert aux propriétaires ET aux
 * locataires ; une ligne est retenue si elle porte le bon `sujet` (417), ou, sans sujet (lignes d'avant), si un verrou de champ de
 * CE sujet existe et aucun de l'autre pour ce numéro (rien n'est attribué au hasard). `$1` : l'identifiant.
 */
export function filtreFiche(sujet: SujetTrace, avec417: boolean): string {
  if (sujet === 'lot') return `j.entite = 'annuaire_lot' AND j.entite_id = $1`;
  const autre = sujet === 'locataire' ? 'proprietaire' : 'locataire';
  const ancienne = `(j.sujet IS NULL AND EXISTS (SELECT 1 FROM gestion_annuaire_verrou v WHERE v.sujet = '${sujet}' AND v.sujet_id = $1)
         AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_verrou v WHERE v.sujet = '${autre}' AND v.sujet_id = $1))`;
  return `j.entite = 'annuaire' AND j.entite_id = $1 AND ${avec417 ? `(j.sujet = '${sujet}' OR ${ancienne})` : ancienne.replace('j.sujet IS NULL AND ', '')}`;
}

export interface LigneHistorique { id: number; quand: string; par: string; parId: number | null; champ: string | null; avant: string | null; apres: string | null; texte: string; ecran: string | null;
  /** 🔴 (Arno, 26/11/2026) une restitution des 20 % (fiche du LOCATAIRE seulement) : son texte, « par …, le … à HHhMM », son annulation dessous ; absente : ligne ordinaire */
  restitution?: LigneRestitutionHistorique }

/** L'historique d'une fiche (du plus récent), avec le NOM du compte (prénom nom, sinon l'identifiant) — lignes de `filtreFiche`. */
export async function historiqueFiche(sujet: 'locataire' | 'lot', id: number, limite = 100): Promise<LigneHistorique[]> {
  const avec417 = await colonneExisteMemo('gestion_journal', 'ecran');
  const filtre = filtreFiche(sujet, avec417);
  // 🔴🔴 (Arno, 26/11/2026) « les restitutions doivent apparaître dans l'historique de la fiche du locataire » : les lignes que le geste écrit au dossier
  //    du locataire (entité « annuaire », sans sujet) s'ajoutent à SON historique. Seulement ici : `filtreFiche` (aussi le contrôle de conflit d'une
  //    fiche ouverte) ne change pas — une restitution ne bloque pas l'enregistrement d'une fiche.
  const avecRestitutions = sujet === 'locataire'
    ? ` OR (j.entite = 'annuaire' AND j.entite_id = $1 AND j.action IN (${ACTIONS_RESTITUTION_HISTORIQUE.map((a) => `'${a}'`).join(', ')}))` : '';
  const { rows } = await query<{ id: string; quand: string; quand_paris: string; action: string; auteur_id: string | null; nom: string | null; prenom: string | null;
    nom_famille: string | null; auteur_libelle: string | null; champ: string | null; valeur_avant: string | null; valeur_apres: string | null; commentaire: string | null; ecran: string | null }>(
    `SELECT j.id::text, j.survenu_le::text AS quand, (j.survenu_le AT TIME ZONE 'Europe/Paris')::text AS quand_paris, j.action, j.auteur_id::text,
            nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '') AS nom, u.prenom, u.nom AS nom_famille, j.auteur_libelle,
            ${avec417 ? 'j.champ, j.ecran' : 'NULL::text AS champ, NULL::text AS ecran'}, j.valeur_avant, j.valeur_apres, j.commentaire
       FROM gestion_journal j LEFT JOIN admin_utilisateur u ON u.id = j.auteur_id
      WHERE (${filtre})${avecRestitutions}
      ORDER BY j.survenu_le DESC, j.id DESC LIMIT ${Math.max(1, Math.min(500, Math.floor(limite)))}`, [id]);
  const lignes: LigneHistorique[] = rows.map((r) => ({
    id: Number(r.id), quand: r.quand, par: r.nom ?? r.auteur_libelle ?? '—', parId: r.auteur_id === null ? null : Number(r.auteur_id),
    champ: r.champ, avant: r.valeur_avant, apres: r.valeur_apres, texte: r.commentaire ?? '', ecran: r.ecran,
  }));
  if (avecRestitutions === '') return lignes;
  const ids = [...new Set(rows.map((r) => restitutionDeLaLigne(r.action, r.commentaire)).filter((x): x is number => x !== null))];
  const restitutions = await lireRestitutionsHistorique(ids).catch(() => new Map<number, RestitutionLue>());
  rows.forEach((r, i) => {
    const x = ligneRestitutionHistorique({ action: r.action, commentaire: r.commentaire, quand: r.quand_paris,
      par: parQui({ prenom: r.prenom, nom: r.nom_famille, libelle: r.auteur_libelle }) }, restitutions);
    if (x !== null) lignes[i].restitution = x;
  });
  return lignes;
}

/** Les restitutions nommées par l'historique (montants, motif) et leur annulation éventuelle (qui, quand). LECTURE SEULE ; sans la 513 : aucune. */
async function lireRestitutionsHistorique(ids: readonly number[]): Promise<Map<number, RestitutionLue>> {
  const out = new Map<number, RestitutionLue>();
  if (ids.length === 0 || !(await colonneExisteMemo('gestion_location_restitution_vingt', 'sortie_validee_id'))) return out;
  const avec518 = await colonneExisteMemo('gestion_location_restitution_vingt', 'motif_difference');
  const { rows } = await query<{ id: string; date: string; restitue: string; vingt: string | null; retenu: string | null; motif: string | null;
    a_le: string | null; a_prenom: string | null; a_nom: string | null; a_libelle: string | null }>(
    `SELECT f.id::text, f.date_restitution::text AS date, f.montant_restitue::text AS restitue, ${avec518 ? 'f.montant_vingt::text' : 'NULL::text'} AS vingt,
            f.montant_retenu_charges::text AS retenu, ${avec518 ? 'f.motif_difference' : 'NULL::text'} AS motif,
            (a.saisie_le AT TIME ZONE 'Europe/Paris')::text AS a_le, ua.prenom AS a_prenom, ua.nom AS a_nom, a.saisie_par_libelle AS a_libelle
       FROM gestion_location_restitution_vingt f
       LEFT JOIN gestion_location_restitution_vingt a ON a.annule_id = f.id AND a.geste = 'annulee'
       LEFT JOIN admin_utilisateur ua ON ua.id = a.saisie_par
      WHERE f.id = ANY($1::bigint[]) AND f.geste = 'faite'`, [[...ids]]);
  for (const r of rows) {
    out.set(Number(r.id), { id: Number(r.id), date: r.date, restitue: Number(r.restitue), vingt: r.vingt === null ? null : Number(r.vingt),
      retenu: r.retenu === null ? null : Number(r.retenu), motif: r.motif,
      annulation: r.a_le === null ? null : { le: r.a_le, par: parQui({ prenom: r.a_prenom, nom: r.a_nom, libelle: r.a_libelle }) } });
  }
  return out;
}
