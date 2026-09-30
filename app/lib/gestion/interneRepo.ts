import { query } from '../db/client';
import { interneDisponible } from './schema';
import type { Auteur } from './gestes';

/**
 * MODULE « GESTION » — LOT RATTACHER-EN-ECRIVANT : « INTERNE », UN ÉCHANGE ENTRE COLLÈGUES.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI. Les commandes de ligne (`tsx`) importent les dépôts du module, et
 * `server-only` lève hors du bundle react-server. La frontière client/serveur est tenue par
 * `app/lib/garde/serverOnly.guard.test.ts` et `clientBoundary.guard.test.ts` — convention du module.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE ÇA SERT. Un mot à un collègue ne concerne AUCUN bien : il restait rouge « À classer » pour toujours.
 * « Interne » est le statut qui lui manquait. C'est le jumeau de « Hors gestion » (`horsGestionRepo`), à une
 * différence près — et elle est essentielle :
 *
 * 🔴🔴 « INTERNE » PORTE SUR L'ÉCHANGE, PAS SUR LE MAIL. Constat d'Arno : quand on marque un mot envoyé à un
 * collègue et que celui-ci répond, SA réponse arrive en Réception et s'affiche « À classer ». Le statut n'aurait
 * tenu que le temps d'un aller simple. En le posant sur `fil_id`, tout message de l'échange — celui qu'on a écrit
 * comme celui qu'on reçoit demain — porte la capsule verte sans aucun geste de plus.
 *
 * 🔴 JAMAIS AUTOMATIQUE. L'écran le PROPOSE en premier quand tous les destinataires sont internes, mais aucune
 * fonction d'ici n'accepte un auteur anonyme, et la base le refuse aussi (`gestion_fil_interne_humain_chk`). Deux
 * gardes pour la même règle : un garde applicatif se contourne au prochain script, une contrainte non.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ. Annuler écrit `retire_le` sur la ligne vivante ; elle reste, datée et signée. Une
 * nouvelle pose crée une NOUVELLE ligne.
 *
 * ⚠️ SANS LA MIGRATION 281, LA TABLE N'EST NOMMÉE NULLE PART : chaque fonction sonde d'abord et rend un résultat
 * vide — ou refuse le geste EN LE DISANT —, plutôt que de faire échouer tout l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une marque VIVANTE, telle que l'écran la lit. */
export interface MarqueInterne {
  filId: number;
  poseLe: string;
  posePar: string;
}

/** Ce qu'un geste rend. `ok: false` porte TOUJOURS un motif lisible à l'écran — jamais un échec muet. */
export type IssueInterne = { ok: true; nb: number } | { ok: false; motif: string };

/** Le refus que tout le module écrit de la même façon : une seule phrase, au même endroit. */
export const SANS_MIGRATION_INTERNE =
  'Mise à jour de la base à appliquer (migration 281) : le statut « Interne » n’est pas encore installé.';

/**
 * 🔴 L'AUTEUR EST-IL UN HUMAIN NOMMÉ ? PUR.
 *
 * Refuse le vide et le mot que le moteur de rattachement signe : « Interne » ne se pose jamais tout seul.
 */
export function auteurHumainInterne(a: { libelle?: string | null } | null | undefined): boolean {
  const l = (a?.libelle ?? '').trim();
  return l !== '' && l.toLowerCase() !== 'automatique';
}

/** Les identifiants propres, sans doublon et bornés. */
const FILS_MAX = 500;
function idsPropres(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, FILS_MAX);
}

/**
 * ══ 🔴 LES ADRESSES DE LA MAISON — celles qui rendent un échange « interne » ═════════════════════════════════════
 *
 * Les deux domaines qu'Arno nomme. Écrits ici et NULLE PART AILLEURS : l'écran, la route et les épreuves lisent
 * cette liste, pour qu'un troisième domaine un jour ne s'ajoute qu'à un seul endroit.
 *
 * ⚠️ CE N'EST PAS LA MÊME QUESTION QUE `estInterne` (adressesMessage.ts), et les deux ne doivent pas fusionner.
 * Là-bas, « interne » veut dire « cette adresse ne sert pas de CLÉ de rattachement » — et la liste comprend la
 * compta externalisée (ADHOC), qui n'est PAS la maison. Ici on demande « est-ce un collègue ? », et la compta
 * externalisée n'en est pas un : un échange avec elle concerne de vrais biens.
 */
export const DOMAINES_MAISON: readonly string[] = ['sansvisavis.com', 'criterimmo.fr'];

/** Cette adresse est-elle celle d'un collègue de la maison ? PUR. */
export function estAdresseMaison(adresse: string | null | undefined): boolean {
  const a = (adresse ?? '').trim().toLowerCase();
  const arobase = a.lastIndexOf('@');
  if (arobase < 0) return false;
  return DOMAINES_MAISON.includes(a.slice(arobase + 1));
}

/**
 * 🔴 « INTERNE » EST-IL À PROPOSER EN PREMIER ? PUR.
 *
 * Demande d'Arno : « Il est proposé en premier quand TOUS les destinataires sont en @sansvisavis.com ou
 * @criterimmo.fr ».
 *
 * ⚠️ « TOUS », ET IL EN FAUT AU MOINS UN. Sur une liste vide, `every` rend `true` — on proposerait « Interne » en
 * premier sur un message neuf dont personne n'a encore saisi le destinataire. Le piège des ensembles vides est
 * consigné dans ce dépôt (lot 71) ; on l'écrit donc explicitement.
 */
export function proposerInterneDabord(destinataires: readonly string[]): boolean {
  const propres = destinataires.map((d) => (d ?? '').trim()).filter((d) => d !== '');
  return propres.length > 0 && propres.every(estAdresseMaison);
}

/**
 * LES MARQUES VIVANTES de ces échanges. LECTURE SEULE.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA PAGE : règle du module. Une requête par ligne coûterait vingt-cinq accès
 * pour afficher une colonne.
 */
export async function lireInterne(filIds: readonly number[]): Promise<Map<number, MarqueInterne>> {
  const m = new Map<number, MarqueInterne>();
  const ids = idsPropres(filIds);
  if (ids.length === 0 || !(await interneDisponible())) return m;
  const { rows } = await query<{ fil_id: string; pose_le: string; pose_par_libelle: string }>(
    `SELECT fil_id::text, pose_le::text, pose_par_libelle
       FROM gestion_fil_interne WHERE fil_id = ANY($1::bigint[]) AND retire_le IS NULL`, [ids]);
  for (const r of rows) {
    m.set(Number(r.fil_id), { filId: Number(r.fil_id), poseLe: r.pose_le, posePar: r.pose_par_libelle });
  }
  return m;
}

/**
 * MARQUER UN OU PLUSIEURS ÉCHANGES « INTERNE ».
 *
 * ⚠️ `ON CONFLICT … DO NOTHING` SUR L'INDEX PARTIEL : reposer la marque sur un échange qui la porte déjà ne crée
 * pas de doublon et n'échoue pas. C'est ce qui rend le geste rejouable sans y penser.
 */
export async function marquerInterne(o: {
  filIds: readonly number[]; auteur: Auteur;
}): Promise<IssueInterne> {
  if (!(await interneDisponible())) return { ok: false, motif: SANS_MIGRATION_INTERNE };
  if (!auteurHumainInterne(o.auteur)) {
    return { ok: false, motif: '« Interne » ne se pose qu’à la main : l’auteur du geste doit être identifié.' };
  }
  const ids = idsPropres(o.filIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun échange désigné.' };

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_fil_interne (fil_id, pose_par, pose_par_libelle)
     SELECT f.id, $2, $3 FROM gestion_fil f WHERE f.id = ANY($1::bigint[])
     ON CONFLICT (fil_id) WHERE retire_le IS NULL DO NOTHING
     RETURNING id`,
    [ids, o.auteur.id, o.auteur.libelle]);
  return { ok: true, nb: rows.length };
}

/**
 * ANNULER « INTERNE ». Le geste inverse, tout aussi explicite.
 *
 * 🔴 AUCUN `DELETE`. La ligne reste : on y écrit qui a annulé, quand, et pourquoi.
 */
export async function annulerInterne(o: {
  filIds: readonly number[]; auteur: Auteur; motif?: string | null;
}): Promise<IssueInterne> {
  if (!(await interneDisponible())) return { ok: false, motif: SANS_MIGRATION_INTERNE };
  if (!auteurHumainInterne(o.auteur)) return { ok: false, motif: 'L’auteur du geste doit être identifié.' };
  const ids = idsPropres(o.filIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun échange désigné.' };

  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_fil_interne
        SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
      WHERE fil_id = ANY($1::bigint[]) AND retire_le IS NULL
      RETURNING id`,
    [ids, o.auteur.id, o.auteur.libelle,
      typeof o.motif === 'string' && o.motif.trim() !== '' ? o.motif.trim().slice(0, 300) : null]);
  return { ok: true, nb: rows.length };
}

/**
 * ══ 🔴 RATTACHER UN BIEN LÈVE LA MARQUE — la réversibilité par le geste naturel ═════════════════════════════════
 *
 * Exactement le rôle de `leverHorsGestionApresRattachement`, et pour la même raison : sans elle, la priorité
 * d'affichage suffirait à montrer la bonne capsule (un rattachement l'emporte sur « Interne »), mais la marque
 * resterait en base, vivante et invisible — le jour où le rattachement serait retiré, l'échange redeviendrait vert
 * « Interne » sans que personne ne l'ait décidé.
 *
 * ⚠️ ELLE NE FAIT JAMAIS ÉCHOUER LE RATTACHEMENT. Si elle ne peut pas écrire, le rattachement reste posé et la
 * capsule est de toute façon juste : c'est un rattrapage d'état, pas le geste lui-même.
 */
export async function leverInterneApresRattachement(
  filIds: readonly number[], auteur: Auteur,
): Promise<number> {
  try {
    if (!(await interneDisponible())) return 0;
    if (!auteurHumainInterne(auteur)) return 0;
    const ids = idsPropres(filIds);
    if (ids.length === 0) return 0;
    const { rows } = await query<{ id: string }>(
      `UPDATE gestion_fil_interne
          SET retire_le = now(), retire_par = $2, retire_par_libelle = $3,
              retire_motif = 'un bien a été rattaché à cet échange'
        WHERE fil_id = ANY($1::bigint[]) AND retire_le IS NULL
        RETURNING id`,
      [ids, auteur.id, auteur.libelle]);
    return rows.length;
  } catch (e) {
    console.error('[gestion/interne] levée après rattachement impossible', e);
    return 0;
  }
}

/**
 * ══ 🔴 LE FRAGMENT SQL QUI LIT LA MARQUE DANS UNE LISTE ═════════════════════════════════════════════════════════
 *
 * Une jointure latérale, posée sur l'ÉCHANGE. Écrite ICI et importée par les trois listes (boîte, réception,
 * recherche) : trois copies auraient divergé au premier ajustement, et la capsule aurait changé de sens d'un
 * écran à l'autre — c'est le défaut que le lot RECHERCHE-LIGNES a déjà payé une fois.
 *
 * ⚠️ `avec` FAUX (migration 281 absente) ⇒ CHAÎNE VIDE : la table n'est nommée nulle part, et la requête est mot
 * pour mot celle d'avant ce lot.
 *
 * ⚠️ `true AS marque` ET NON `fi.* IS NOT NULL` : même piège que la jointure « hors gestion » — un marqueur non
 * nul dit « la ligne est là » sans dépendre de ce qu'elle contient.
 */
export function sqlJointureInterne(avec: boolean, alias: string): string {
  if (!avec) return '';
  return `LEFT JOIN LATERAL (
       SELECT true AS marque FROM gestion_fil_interne fi
        WHERE fi.fil_id = ${alias}.fil_id AND fi.retire_le IS NULL
        LIMIT 1
     ) itn ON true`;
}

/** La colonne que la jointure ci-dessus rend. `NULL` quand la migration manque : jamais `false`, qui mentirait. */
export function sqlColonneInterne(avec: boolean): string {
  return avec ? 'itn.marque AS itn_marque' : 'NULL::boolean AS itn_marque';
}
