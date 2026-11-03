// 🔴 MON ESPACE « LES COÛTS », LOT 2 (Arno, 03/11/2026, décision C9, migration 451) — LA FONCTION D'UN PROFIL : vente, location, gestion
// (plusieurs possibles), cochées dans la page Comptes, pré-cochées par la migration d'après les données existantes. Elles ne donnent AUCUN droit :
// elles rangent les profils proposés pour un salaire chargé (ceux de la fonction en cours d'abord). Même convention que `serviceGestion.ts` : pas de
// `import 'server-only'` ; une écriture = les lignes d'UN compte, journalisée dans `admin_utilisateur_log` (`changement_fonctions`, avant / après).
// 🔴 D35 (Arno, 03/11/2026, migration 453) — les fonctions sont DATÉES (« À compter du ») et UNE activité principale (salaire), datée elle aussi,
// porte 100 % du salaire chargé (option C) ; le journal garde l'historique (même action `changement_fonctions`, avec l'activité principale et la date).
import { query, withTransaction } from '../db/client';
import { activitePrincipaleDisponible, fonctionsComptesDisponible } from './schemaDroits';
import { fonctionsALaDate, principaleALaDate, type PeriodeFonction, type VersionPrincipale } from './activitePrincipale';

import type { ChangementFonctions, EtatFonctions, Fonction } from './fonctionsCompteModele';
import { estFonction } from './fonctionsCompteModele';
export { estFonction, FONCTIONS, LIBELLE_FONCTION, profilsPourSalaire, type EtatFonctions, type Fonction, type ProfilCout } from './fonctionsCompteModele';

/** Aujourd'hui à Paris (« AAAA-MM-JJ »). */
export const aujourdhuiIso = (): string => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fonctionsDe = (x: unknown): Fonction[] => (Array.isArray(x) ? x.filter(estFonction) : []);
const principaleDe = (x: unknown): Fonction | null => (estFonction(x) ? x : null);

/** Les fonctions d'un compte. LECTURE SEULE. Sans la 451 : aucune, non disponible. D35 (453) : en vigueur aujourd'hui, l'activité principale, l'historique. */
export async function lireFonctions(id: number): Promise<EtatFonctions> {
  if (!(await fonctionsComptesDisponible())) return { valeur: [], disponible: false, deduites: [] };
  if (!(await activitePrincipaleDisponible())) {
    const { rows } = await query<{ fonction: Fonction; origine: string }>(
      'SELECT fonction, origine FROM admin_compte_fonction WHERE compte_id = $1 AND retire_le IS NULL ORDER BY fonction', [id]);
    return { valeur: rows.map((r) => r.fonction), disponible: true, deduites: rows.filter((r) => r.origine === 'deduite').map((r) => r.fonction) };
  }
  const jour = aujourdhuiIso();
  const [{ rows: fs }, { rows: ps }, { rows: js }] = await Promise.all([
    query<{ fonction: Fonction; origine: string; depuis: string | null; jusqua: string | null }>(
      `SELECT fonction, origine, to_char(depuis, 'YYYY-MM-DD') AS depuis, to_char(jusqua, 'YYYY-MM-DD') AS jusqua
         FROM admin_compte_fonction WHERE compte_id = $1 AND retire_le IS NULL ORDER BY fonction, depuis NULLS FIRST`, [id]),
    query<{ activite: Fonction; origine: string; depuis: string | null }>(
      `SELECT activite, origine, to_char(depuis, 'YYYY-MM-DD') AS depuis FROM admin_compte_activite_principale WHERE compte_id = $1 AND retire_le IS NULL ORDER BY depuis NULLS FIRST`, [id]),
    query<{ ts: string; par: string | null; avant: Record<string, unknown> | null; apres: Record<string, unknown> | null }>(
      `SELECT to_char(l.ts AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS ts, nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '') AS par, l.avant, l.apres
         FROM admin_utilisateur_log l LEFT JOIN admin_utilisateur u ON u.id = l.auteur_id
        WHERE l.action = 'changement_fonctions' AND l.cible_id = $1 ORDER BY l.ts, l.id`, [id]),
  ]);
  const periodes: PeriodeFonction[] = fs.map((r) => ({ fonction: r.fonction, depuis: r.depuis, jusqua: r.jusqua }));
  const principales: VersionPrincipale[] = ps.map((r) => ({ activite: r.activite, depuis: r.depuis }));
  const valeur = fonctionsALaDate(periodes, jour).sort();
  const principale = principaleALaDate(principales, jour);
  const historique: ChangementFonctions[] = js.map((r) => ({ le: r.ts, par: r.par, depuis: typeof r.apres?.depuis === 'string' ? r.apres.depuis : null,
    avant: { fonctions: fonctionsDe(r.avant?.fonctions), principale: principaleDe(r.avant?.principale) },
    apres: { fonctions: fonctionsDe(r.apres?.fonctions), principale: principaleDe(r.apres?.principale) } }));
  // l'état « depuis toujours » : les fonctions d'avant toute date ; un journal d'avant la 453 (sans activité principale) : celle d'avant toute date
  const initial = { fonctions: [...new Set(periodes.filter((p) => p.depuis === null).map((p) => p.fonction))].sort(), principale: principales.find((v) => v.depuis === null)?.activite ?? null };
  for (const c of historique) { if (c.avant.principale === null && c.apres.principale === null) { c.avant.principale = initial.principale; c.apres.principale = initial.principale; } }
  const active = fs.filter((r) => valeur.includes(r.fonction) && (r.depuis === null || r.depuis <= jour) && (r.jusqua === null || r.jusqua > jour));
  return { valeur, disponible: true, deduites: active.filter((r) => r.origine === 'deduite').map((r) => r.fonction), datees: true, principale,
    principaleDeduite: ps.some((r) => r.activite === principale && r.origine === 'deduite' && (r.depuis === null || r.depuis <= jour)) && principale !== null,
    periodes, principales, initial, historique };
}

/** Les profils proposés (actifs, sauf observateurs), avec leurs fonctions (aucune sans la 451) ; D35 : leurs périodes et activité principale datées. LECTURE SEULE. */
export async function lireProfilsCouts(): Promise<import('./fonctionsCompteModele').ProfilCout[]> {
  const avec = await fonctionsComptesDisponible();
  const datees = avec && (await activitePrincipaleDisponible());
  const { rows } = await query<{ id: string; libelle: string; fonctions: Fonction[] | null; periodes: PeriodeFonction[] | null; principales: VersionPrincipale[] | null }>(
    `SELECT u.id::text, coalesce(nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''), u.identifiant) AS libelle,
            ${avec ? `(SELECT array_agg(DISTINCT f.fonction ORDER BY f.fonction) FROM admin_compte_fonction f WHERE f.compte_id = u.id AND f.retire_le IS NULL${datees ? ' AND f.jusqua IS NULL' : ''})` : 'NULL::text[]'} AS fonctions,
            ${datees ? `(SELECT coalesce(jsonb_agg(jsonb_build_object('fonction', f.fonction, 'depuis', to_char(f.depuis, 'YYYY-MM-DD'), 'jusqua', to_char(f.jusqua, 'YYYY-MM-DD'))), '[]'::jsonb)
                         FROM admin_compte_fonction f WHERE f.compte_id = u.id AND f.retire_le IS NULL)` : 'NULL::jsonb'} AS periodes,
            ${datees ? `(SELECT coalesce(jsonb_agg(jsonb_build_object('activite', p.activite, 'depuis', to_char(p.depuis, 'YYYY-MM-DD')) ORDER BY p.depuis NULLS FIRST), '[]'::jsonb)
                         FROM admin_compte_activite_principale p WHERE p.compte_id = u.id AND p.retire_le IS NULL)` : 'NULL::jsonb'} AS principales
       FROM admin_utilisateur u
      WHERE u.actif IS TRUE AND coalesce(to_jsonb(u) ->> 'statut', '') <> 'observateur'
      ORDER BY libelle`);
  return rows.map((r) => ({ id: Number(r.id), libelle: r.libelle, fonctions: r.fonctions ?? [],
    ...(r.periodes === null ? {} : { periodes: r.periodes }), ...(r.principales === null ? {} : { principales: r.principales }) }));
}

/** 🔴 D35 — ce que l'écran pose : les fonctions cochées, l'activité principale (salaire) parmi elles, « À compter du » (null : depuis toujours). */
export interface ChoixFonctions { fonctions: readonly Fonction[]; principale?: Fonction | null; depuis?: string | null }
export type IssueFonctions = { ok: true; change: boolean } | { ok: false; change: false; motif?: string; introuvable?: boolean };

/**
 * 🔴 D35 — le refus d'un choix (null : accepté), PUR : l'activité principale est l'une des fonctions cochées ; des fonctions sans activité
 * principale : à choisir ; « depuis toujours » seulement pour un profil qui n'a encore rien de daté.
 */
export function motifChoixFonctions(c: ChoixFonctions, avant: { periodes: readonly PeriodeFonction[]; principales: readonly VersionPrincipale[] }): string | null {
  const fs = [...new Set(c.fonctions)];
  if (c.depuis !== undefined && c.depuis !== null && !/^\d{4}-\d{2}-\d{2}$/.test(c.depuis)) return 'Date « À compter du » invalide.';
  if (c.principale != null && !fs.includes(c.principale)) return 'L’activité principale (salaire) est l’une des fonctions cochées.';
  if (fs.length > 0 && c.principale == null) return 'Choisissez l’activité principale (salaire) parmi les fonctions cochées.';
  if (c.depuis === null && (avant.periodes.some((p) => p.depuis !== null || p.jusqua !== null) || avant.principales.some((v) => v.depuis !== null)))
    return '« Depuis toujours » n’est possible que pour un profil sans changement daté : choisissez la date « À compter du ».';
  return null;
}

/**
 * Pose les fonctions d'UN compte ; une ligne de journal (avant / après, auteur). Rien n'est écrit si rien ne change. ⚠️ RÉSERVÉ AUX ADMINISTRATEURS
 * (la route). D35 (453), à compter de `depuis` : une fonction décochée s'arrête à cette date (`jusqua`) — une période qui n'avait pas encore commencé
 * est retirée —, une fonction cochée commence à cette date ; une autre activité principale ouvre une version datée (le prorata du salaire en découle) ;
 * le passé ne change pas. `depuis` null : depuis toujours (un profil sans rien de daté). Sans la 453 : les fonctions seules, comme avant.
 */
export async function definirFonctions(id: number, choix: readonly Fonction[] | ChoixFonctions, auteurId: number | null, auteurLibelle: string): Promise<IssueFonctions> {
  if (!(await fonctionsComptesDisponible())) return { ok: false, change: false };
  const c: ChoixFonctions = Array.isArray(choix) ? { fonctions: choix as readonly Fonction[] } : choix as ChoixFonctions;
  const voulues = [...new Set(c.fonctions)].sort();
  if (!(await activitePrincipaleDisponible())) return definirFonctionsSans453(id, voulues, auteurId, auteurLibelle);
  return withTransaction(async (q) => {
    const { rows: cpt } = await q<{ id: string }>('SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE', [id]);
    if (cpt.length === 0) return { ok: false, change: false, introuvable: true };
    const { rows: fs } = await q<{ id: string; fonction: Fonction; origine: string; depuis: string | null; jusqua: string | null }>(
      `SELECT id::text, fonction, origine, to_char(depuis, 'YYYY-MM-DD') AS depuis, to_char(jusqua, 'YYYY-MM-DD') AS jusqua FROM admin_compte_fonction WHERE compte_id = $1 AND retire_le IS NULL`, [id]);
    const { rows: ps } = await q<{ id: string; activite: Fonction; origine: string; depuis: string | null }>(
      `SELECT id::text, activite, origine, to_char(depuis, 'YYYY-MM-DD') AS depuis FROM admin_compte_activite_principale WHERE compte_id = $1 AND retire_le IS NULL`, [id]);
    const periodes: PeriodeFonction[] = fs.map((r) => ({ fonction: r.fonction, depuis: r.depuis, jusqua: r.jusqua }));
    const principales: VersionPrincipale[] = ps.map((r) => ({ activite: r.activite, depuis: r.depuis }));
    const motif = motifChoixFonctions(c, { periodes, principales });
    if (motif !== null) return { ok: false, change: false, motif };
    const depuis = c.depuis === undefined ? aujourdhuiIso() : c.depuis;
    const leJour = depuis ?? '0001-01-01';
    const avantF = fonctionsALaDate(periodes, leJour).sort();
    const avantP = principaleALaDate(principales, leJour);
    const voulueP = c.principale ?? null;
    const ouvertes = fs.filter((r) => r.jusqua === null);
    const aConfirmerF = ouvertes.filter((r) => r.origine === 'deduite' && voulues.includes(r.fonction));
    const aConfirmerP = ps.filter((r) => r.origine === 'deduite' && r.activite === voulueP && principaleALaDate(principales, leJour) === voulueP);
    const changeF = JSON.stringify(avantF) !== JSON.stringify(voulues);
    const changeP = voulueP !== null && voulueP !== avantP;
    if (!changeF && !changeP && aConfirmerF.length === 0 && aConfirmerP.length === 0) return { ok: true, change: false };
    // les fonctions : décochée → s'arrête à la date (une période pas encore commencée : retirée) ; cochée → commence à la date
    for (const r of ouvertes.filter((x) => !voulues.includes(x.fonction))) {
      if (depuis === null || (r.depuis !== null && r.depuis >= depuis)) await q('UPDATE admin_compte_fonction SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1', [r.id, auteurLibelle]);
      else await q('UPDATE admin_compte_fonction SET jusqua = $2::date, retire_par_libelle = $3 WHERE id = $1', [r.id, depuis, auteurLibelle]);
    }
    for (const r of aConfirmerF) await q(`UPDATE admin_compte_fonction SET origine = 'saisie', pose_par_libelle = $2 WHERE id = $1`, [r.id, auteurLibelle]);
    for (const f of voulues.filter((x) => !ouvertes.some((r) => r.fonction === x))) {
      await q(`INSERT INTO admin_compte_fonction (compte_id, fonction, origine, pose_par_libelle, depuis) VALUES ($1, $2, 'saisie', $3, $4::date)`, [id, f, auteurLibelle, depuis]);
    }
    // l'activité principale : une version datée (une version déjà posée à cette même date est remplacée, jamais effacée)
    if (changeP) {
      await q(`UPDATE admin_compte_activite_principale SET retire_le = now(), retire_par_libelle = $3 WHERE compte_id = $1 AND retire_le IS NULL AND coalesce(depuis, DATE '0001-01-01') = $2::date`,
        [id, leJour, auteurLibelle]);
      await q(`INSERT INTO admin_compte_activite_principale (compte_id, activite, depuis, origine, pose_par_libelle) VALUES ($1, $2, $3::date, 'saisie', $4)`, [id, voulueP, depuis, auteurLibelle]);
    }
    for (const r of aConfirmerP) await q(`UPDATE admin_compte_activite_principale SET origine = 'saisie', pose_par_libelle = $2 WHERE id = $1`, [r.id, auteurLibelle]);
    await q(`INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) VALUES ('changement_fonctions', $1, $2, $3::jsonb, $4::jsonb)`,
      [id, auteurId, JSON.stringify({ fonctions: avantF, principale: avantP }), JSON.stringify({ fonctions: voulues, principale: changeP ? voulueP : avantP, depuis })]);
    return { ok: true, change: true };
  });
}

/** Sans la 453 : la pose d'avant (retire les fonctions décochées, ajoute les nouvelles, confirme les déduites gardées). */
async function definirFonctionsSans453(id: number, voulues: Fonction[], auteurId: number | null, auteurLibelle: string): Promise<IssueFonctions> {
  return withTransaction(async (q) => {
    const { rows: c } = await q<{ id: string }>('SELECT id FROM admin_utilisateur WHERE id = $1 FOR UPDATE', [id]);
    if (c.length === 0) return { ok: false, change: false, introuvable: true };
    const { rows } = await q<{ fonction: Fonction; origine: string }>('SELECT fonction, origine FROM admin_compte_fonction WHERE compte_id = $1 AND retire_le IS NULL', [id]);
    const avant = rows.map((r) => r.fonction).sort();
    const aConfirmer = rows.filter((r) => r.origine === 'deduite' && voulues.includes(r.fonction)).map((r) => r.fonction);
    if (JSON.stringify(avant) === JSON.stringify(voulues) && aConfirmer.length === 0) return { ok: true, change: false };
    await q(`UPDATE admin_compte_fonction SET retire_le = now(), retire_par_libelle = $3 WHERE compte_id = $1 AND retire_le IS NULL AND NOT (fonction = ANY($2::text[]))`,
      [id, voulues, auteurLibelle]);
    await q(`UPDATE admin_compte_fonction SET origine = 'saisie', pose_par_libelle = $3 WHERE compte_id = $1 AND retire_le IS NULL AND origine = 'deduite' AND fonction = ANY($2::text[])`,
      [id, voulues, auteurLibelle]);
    for (const f of voulues.filter((x) => !avant.includes(x))) {
      await q(`INSERT INTO admin_compte_fonction (compte_id, fonction, origine, pose_par_libelle) VALUES ($1, $2, 'saisie', $3)`, [id, f, auteurLibelle]);
    }
    await q(`INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) VALUES ('changement_fonctions', $1, $2, $3::jsonb, $4::jsonb)`,
      [id, auteurId, JSON.stringify({ fonctions: avant }), JSON.stringify({ fonctions: voulues })]);
    return { ok: true, change: true };
  });
}
