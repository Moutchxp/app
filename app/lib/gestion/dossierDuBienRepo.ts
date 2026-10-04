import { query } from '../db/client';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — LA règle du lien de bien, écrite une seule fois.
import { sqlLiensDuBien } from './rattachement';
import { rattachementsDisponibles } from './schema';
import type { BienDuMail } from './dossierDuBien';

/**
 * MODULE « GESTION » — LOT DRIVE-DOSSIER-DU-BIEN : LES BIENS DU MAIL, ET LEUR DOSSIER DRIVE. Lecture seule.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 AUCUN APPEL AU DRIVE ICI, ET C'EST LE POINT IMPORTANT. Ce dépôt ne fait que lire NOTRE base : la
 * correspondance bien → dossier est déjà connue depuis le lot 253
 * (`gestion_annuaire_proprietaire.drive_dossier_id`, renseigné pour les 307 propriétaires). On ne cherche donc
 * rien, on ne devine rien, et on n'ajoute pas une requête Google à l'ouverture du sélecteur.
 *
 * 🔴 LA CORRESPONDANCE EST UNE CLÉ, PAS UN NOM. Lot → `proprietaire_id` → `drive_dossier_id`. Mesuré le
 * 28/09/2026 : 365 lots sur 365 aboutissent, sans ambiguïté. L'autre piste — rapprocher un NOM DE FAMILLE d'un
 * dossier de « Documents clients scannés » — donnait 99 lots nets sur 365, et aurait demandé de lever
 * l'interdiction de lecture de ce dossier. On ne l'a pas prise.
 *
 * ⚠️ PAS DE `import 'server-only'` : les CLI du module importent ce fichier par `tsx`. La frontière navigateur est
 * tenue par `app/lib/garde/clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Ligne {
  cle: string;
  adresse: string | null;
  code_postal: string | null;
  commune: string | null;
  proprietaire: string | null;
  drive_dossier_id: string | null;
}

/** Le libellé d'un bien, tel qu'il s'affiche sur la ligne prioritaire. PUR. */
function libelleDuBien(r: Ligne): string {
  const lieu = [r.adresse, [r.code_postal, r.commune].filter((x) => (x ?? '') !== '').join(' ')]
    .filter((x) => (x ?? '') !== '').join(', ');
  return lieu === '' ? `lot ${r.cle}` : `${lieu} — lot ${r.cle}`;
}

const CHAMPS = `lo.wippimmo_id AS cle, lo.adresse, lo.code_postal, lo.commune,
  pr.nom_complet AS proprietaire, pr.drive_dossier_id`;

/**
 * ══ 🔴 LES BIENS AUXQUELS CE MAIL EST RELIÉ ══════════════════════════════════════════════════════════════════════
 *
 * Deux sources, réunies dans cet ordre, et il compte :
 *   ① les LOTS EXPLICITEMENT CHOISIS pendant l'écriture (« Classer ce mail », sur un message neuf) — ce sont les
 *      plus sûrs, puisqu'ils viennent d'être désignés à la main ;
 *   ② les RATTACHEMENTS VIVANTS de l'échange auquel on répond.
 *
 * ⚠️ SANS DOUBLON, et le premier vu gagne : un lot choisi à la main ET déjà rattaché ne doit apparaître qu'une
 * fois, à la place que lui donne le geste le plus récent.
 *
 * 🔴 UN MAIL « HORS GESTION » N'A AUCUN RATTACHEMENT VIVANT : il ne produit donc aucun bien, donc aucune ligne
 * prioritaire. C'est exactement le comportement demandé — « rien ne change » — et il s'obtient sans règle de plus.
 *
 * ⚠️ SANS LA MIGRATION 257, on ne nomme pas `gestion_rattachement` : seuls les lots explicites sont rendus, et le
 * reste de l'écran est celui d'avant. Nommer une table absente ferait échouer l'ouverture du sélecteur.
 */
export async function biensDuMail(o: {
  filId?: number | null;
  /** Les clés de lot choisies à l'écriture (`brouillon.cibles`). */
  cles?: readonly string[];
}): Promise<BienDuMail[]> {
  const explicites = [...new Set((o.cles ?? []).map((c) => String(c).trim()).filter((c) => c !== ''))].slice(0, 20);
  const filId = Number.isSafeInteger(o.filId ?? NaN) && (o.filId ?? 0) > 0 ? (o.filId as number) : null;

  /**
   * 🔴 LES RATTACHEMENTS DE L'ÉCHANGE, seulement s'il y en a un et si la base sait les tenir. On prend l'ordre de
   * POSE : c'est celui dans lequel on les a rattachés, donc celui auquel on s'attend en rouvrant le mail.
   *
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 1 — LE PRÉDICAT VIENT DU FRAGMENT UNIQUE ════════════════════
   *
   * 🔴 C'ÉTAIT LE QUATRIÈME ENDROIT à réécrire « qu'est-ce qu'un bien rattaché à ce mail », après la fenêtre
   * « Visualiser / Modifier » et les deux historiques. Arno n'en avait nommé que trois — je l'ai trouvé en écrivant
   * le test de garde, qui refusait de passer tant qu'un endroit écrivait la règle à la main. L'exempter aurait vidé
   * le garde de son objet : il n'a de valeur que si AUCUN endroit n'a le droit de la réécrire.
   *
   * 🔴 LA FERMETURE EST SANS EFFET, ET C'EST MESURÉ SUR TOUTE LA TABLE, pas sur un échantillon : le fragment ajoute
   * `piece_id IS NULL`, et `gestion_rattachement` ne contient AUCUNE ligne dont `piece_id` soit non nul (0 sur
   * 172 472, mesuré le 04/10/2026). Les deux prédicats sélectionnent donc exactement les mêmes lignes, pour tout
   * échange — ce n'est pas un pari sur un cas, c'est une égalité d'ensembles.
   *
   * ⚠️ LE `DISTINCT ON` NE BOUGE PAS NON PLUS : il ne rend que `cible_cle`, et seul l'ENSEMBLE des clés pourrait
   * changer — ce que le compte à zéro ci-dessus exclut.
   */
  let duFil: string[] = [];
  if (filId !== null && (await rattachementsDisponibles())) {
    const { rows } = await query<{ cle: string }>(
      `SELECT DISTINCT ON (r.cible_cle) r.cible_cle AS cle
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
        WHERE m.fil_id = $1 AND ${sqlLiensDuBien('r')}
        ORDER BY r.cible_cle, r.cree_le`, [filId]);
    duFil = rows.map((r) => r.cle);
  }

  const cles = [...new Set([...explicites, ...duFil])];
  if (cles.length === 0) return [];

  const { rows } = await query<Ligne>(
    `SELECT ${CHAMPS}
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      WHERE lo.wippimmo_id = ANY ($1::text[]) AND lo.absent_le IS NULL`, [cles]);

  // ⚠️ ON REMET L'ORDRE DEMANDÉ : `ANY` ne le garantit pas, et l'ordre des biens rattachés est ce qu'on affiche.
  const parCle = new Map(rows.map((r) => [r.cle, r]));
  return cles
    .map((c) => parCle.get(c))
    .filter((r): r is Ligne => r !== undefined)
    .map((r) => ({
      cle: r.cle,
      libelle: libelleDuBien(r),
      proprietaire: r.proprietaire,
      dossierId: r.drive_dossier_id,
      // Le nom réel du dossier n'est pas en base : le Drive le donnera au moment de l'ouvrir. On n'invente pas.
      dossierNom: null,
    }));
}
