/**
 * MODULE « GESTION » — LOT DRIVE-1 : LA MÉMOIRE DE L'ARBORESCENCE. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CETTE TABLE EST LA LISTE BLANCHE. Chaque ligne dit « j'ai créé ce dossier, le voici ». Elle n'est jamais
 * alimentée autrement : il n'existe pas de fonction « enregistrer un dossier trouvé », et c'est délibéré — une
 * telle fonction ferait entrer dans la liste blanche quelque chose que nous n'avons pas fait.
 *
 * 🔴 ON RETROUVE PAR CLÉ, JAMAIS PAR NOM. `(sorte, cle)` désigne au plus un dossier. Chercher par nom
 * retrouverait le mauvais dossier chez les homonymes, et perdrait le bon dès qu'un humain renomme.
 *
 * 🔴 TOUT PASSE PAR LA SONDE, HORS TRANSACTION. Sans la migration 254, chaque fonction rend « pas disponible » et
 * n'émet AUCUNE requête.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { arbreDriveDisponible } from './schema';
import type { NoeudArbre } from './driveGardeFou';
import type { LotSource, OccupationSource, ProprietaireSource } from './driveArbre';

export type IssueArbre<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' };

/** Ce que la base a mémorisé, tel que le garde-fou l'attend. Les absents sont EXCLUS : on ne bâtit pas dessus. */
export async function lireArbre(): Promise<IssueArbre<NoeudArbre[]>> {
  if (!(await arbreDriveDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{
    drive_id: string; parent_drive_id: string | null; sorte: string; nom: string; chemin: string;
  }>(`SELECT drive_id, parent_drive_id, sorte, nom, chemin FROM gestion_drive_arbre WHERE absent_le IS NULL`);
  return {
    etat: 'ok',
    data: rows.map((r) => ({
      driveId: r.drive_id, parentDriveId: r.parent_drive_id, sorte: r.sorte, nom: r.nom, chemin: r.chemin,
    })),
  };
}

/** L'index métier : `(sorte, cle)` → identifiant Drive. C'est lui qui rend la construction idempotente. */
export async function lireClesMemorisees(): Promise<IssueArbre<Map<string, string>>> {
  if (!(await arbreDriveDisponible())) return { etat: 'sans_schema' };
  const { rows } = await query<{ sorte: string; cle: string; drive_id: string }>(
    'SELECT sorte, cle, drive_id FROM gestion_drive_arbre WHERE absent_le IS NULL');
  const m = new Map<string, string>();
  for (const r of rows) m.set(`${r.sorte}|${r.cle}`, r.drive_id);
  return { etat: 'ok', data: m };
}

/**
 * ENREGISTRE UN DOSSIER QUE NOUS VENONS DE CRÉER, et journalise le geste.
 *
 * ⚠️ APPELÉ IMMÉDIATEMENT APRÈS la réponse de Drive, jamais avant : enregistrer d'abord ferait entrer dans la liste
 * blanche un identifiant qui n'existe peut-être pas. Si l'enregistrement échoue après une création réussie, le
 * dossier existe dans Drive sans être mémorisé — la commande s'arrête et le DIT, plutôt que de continuer à bâtir
 * sur une mémoire fausse.
 */
export async function enregistrerNoeud(n: {
  driveId: string; parentDriveId: string | null; sorte: string; cle: string; nom: string; chemin: string;
}): Promise<void> {
  await query(
    `INSERT INTO gestion_drive_arbre (drive_id, parent_drive_id, sorte, cle, nom, chemin)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [n.driveId, n.parentDriveId, n.sorte, n.cle, n.nom, n.chemin]);

  const { rows } = await query<{ id: string }>(
    'SELECT id FROM gestion_drive_arbre WHERE drive_id = $1', [n.driveId]);
  const id = Number(rows[0]?.id ?? 0);
  if (id > 0) {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
       VALUES ('drive_arbre', $1, 'creation', $2, 'construction')`,
      [id, `${n.sorte} « ${n.nom} » créé dans Drive (${n.driveId}) — ${n.chemin}`]);
  }
}

/** SIGNALE un dossier mémorisé mais introuvable dans Drive. Jamais recréé en silence : la mémoire doit rester vraie. */
export async function marquerAbsent(driveId: string, motif: string): Promise<void> {
  await query('UPDATE gestion_drive_arbre SET absent_le = now() WHERE drive_id = $1 AND absent_le IS NULL', [driveId]);
  await query(
    `INSERT INTO gestion_drive_refus (operation, cible_drive_id, garde, motif, auteur_libelle)
     VALUES ('modifier', $1, 'autre', $2, 'construction')`,
    [driveId, `Dossier mémorisé introuvable dans Drive : ${motif}`]);
}

/** Les refus déjà journalisés — la preuve que le garde a joué, et combien de fois. */
export async function compterRefus(): Promise<number> {
  if (!(await arbreDriveDisponible())) return 0;
  const { rows } = await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_drive_refus');
  return Number(rows[0]?.n ?? 0);
}

/**
 * LES SOURCES DE L'ARBORESCENCE, lues dans l'annuaire (migration 253).
 *
 * ⚠️ ON NE PREND QUE CE QUI EST ENCORE DANS L'EXPORT (`absent_le IS NULL`) : créer un dossier pour un propriétaire
 * disparu de WIPPIMMO ajouterait du bruit permanent. Sa ligne d'annuaire, elle, reste — c'est la règle du module.
 */
export async function lireSourcesArbre(): Promise<IssueArbre<{
  proprietaires: ProprietaireSource[]; lots: LotSource[]; occupations: OccupationSource[];
}>> {
  if (!(await arbreDriveDisponible())) return { etat: 'sans_schema' };

  const { rows: props } = await query<{ wippimmo_id: string; nom_complet: string }>(
    `SELECT wippimmo_id, nom_complet FROM gestion_annuaire_proprietaire
      WHERE absent_le IS NULL ORDER BY nom_complet, wippimmo_id`);

  const { rows: lots } = await query<{
    wippimmo_id: string; prop: string | null; adresse: string | null; code_postal: string | null;
    commune: string | null; nature: string | null; type_bien: string | null;
  }>(
    `SELECT lo.wippimmo_id, pr.wippimmo_id AS prop, lo.adresse, lo.code_postal, lo.commune, lo.nature, lo.type_bien
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id AND pr.absent_le IS NULL
      WHERE lo.absent_le IS NULL ORDER BY lo.wippimmo_id`);

  const { rows: occs } = await query<{
    wippimmo_id: string; lot: string; nom: string; entree: string | null; sortie: string | null;
  }>(
    `SELECT o.wippimmo_id, coalesce(lo.wippimmo_id, o.lot_wippimmo_id) AS lot, lc.nom,
            o.entree::text, o.sortie::text
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id AND lo.absent_le IS NULL
      WHERE o.absent_le IS NULL ORDER BY o.wippimmo_id`);

  return {
    etat: 'ok',
    data: {
      proprietaires: props.map((p) => ({ wippimmoId: p.wippimmo_id, nomComplet: p.nom_complet })),
      lots: lots.map((l) => ({
        wippimmoId: l.wippimmo_id, proprietaireWippimmoId: l.prop, adresse: l.adresse,
        codePostal: l.code_postal, commune: l.commune, nature: l.nature, typeBien: l.type_bien,
      })),
      occupations: occs.map((o) => ({
        wippimmoId: o.wippimmo_id, lotWippimmoId: o.lot, locataireNom: o.nom, entree: o.entree, sortie: o.sortie,
      })),
    },
  };
}

/**
 * MÉMORISE L'IDENTIFIANT DRIVE DU DOSSIER D'UN PROPRIÉTAIRE dans l'annuaire — la colonne réservée au lot 253.
 *
 * ⚠️ C'est la SEULE écriture de ce lot dans les tables de l'annuaire, et elle ne touche qu'une colonne prévue pour
 * elle. Ni un nom, ni une coordonnée, ni une date ne sont modifiés.
 */
export async function noterDossierProprietaire(wippimmoId: string, driveId: string): Promise<void> {
  await query(
    'UPDATE gestion_annuaire_proprietaire SET drive_dossier_id = $2 WHERE wippimmo_id = $1 AND drive_dossier_id IS DISTINCT FROM $2',
    [wippimmoId, driveId]);
}
