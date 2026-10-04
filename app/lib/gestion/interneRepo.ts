import { query } from '../db/client';
import { interneDisponible, rattachementsDisponibles } from './schema';
/**
 * 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — LA PORTE EXISTANTE, ET LA RÈGLE DU LIEN DE BIEN.
 *
 * ⚠️ `changerStatut` EST IMPORTÉE DYNAMIQUEMENT dans les fonctions, et non ici : `rattachementRepo` importe déjà
 * `horsGestionRepo` (le jumeau de ce fichier), et un import croisé statique en tête de module ferait un cycle que
 * le bundler résout en `undefined` au premier appel — défaut qui ne se voit qu'à l'exécution.
 */
import { sqlLiensDuBien } from './rattachement';
import {
  MOTIF_DETACHE_PAR_INTERNE, MOTIF_REMIS_APRES_ANNULATION, type BienDetache,
} from './interneDetache';
/* 🔴🔴 POINT 2 — l'« Annuler » remet AUSSI les interventions que la cascade de la migration 293 avait emportées. */
import { MOTIF_INTERVENTION_SANS_BIEN, REGLE_INTERVENTION } from './contactExterne';
// 🔴🔴 LA LISTE CENTRALE DE NOS ADRESSES. `DOMAINES_MAISON` en est le RÉEXPORT, plus une copie (voir plus bas).
import { estAdresseInterne } from './adresseInterne';
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
/**
 * ══ 🔴🔴 ELLE N'EST PLUS RECOPIÉE : ELLE **EST** LA LISTE CENTRALE ════════════════════════════════════════════
 *
 * Elle était écrite ici à la main. Elle disait la même chose que `adresseInterne.DOMAINES_INTERNES` — jusqu'au
 * jour où l'une des deux bougerait. C'est arrivé le 02/10/2026, et pas ici : `gestion.criterimmo@gmail.com`
 * vivait dans une TROISIÈME copie (`documentsAutoRepo.NOS_ADRESSES`) que la liste centrale ignorait.
 *
 * ⚠️ L'ORDRE DES DOMAINES CHANGE (`criterimmo.fr` puis `sansvisavis.com`), et il n'a jamais rien décidé : la
 * reconnaissance se fait par appartenance, pas par rang.
 */
export { DOMAINES_INTERNES as DOMAINES_MAISON, ADRESSES_INTERNES } from './adresseInterne';

/**
 * Cette adresse est-elle celle d'un collègue de la maison ? PUR.
 *
 * ⚠️ DEUX DIFFÉRENCES AVEC `estInterne` (adressesMessage.ts), ET ELLES SONT VOULUES — voir l'encadré ci-dessus :
 *   ① AUCUN `autres` N'EST PASSÉ : la compta externalisée (ADHOC) n'est PAS un collègue. Un échange avec elle
 *      concerne de vrais biens, et ne doit pas se proposer « Interne » ;
 *   ② UNE ADRESSE SANS ARROBASE REND `false` ICI, et `true` là-bas. Là-bas la question est « peut-on s'en servir
 *      comme clé ? » — une chaîne illisible ne désigne personne. Ici elle est « est-ce un collègue ? » — et
 *      « sansvisavis.com » tout court n'est pas une personne. Le garde reste donc AVANT la délégation.
 */
export function estAdresseMaison(adresse: string | null | undefined): boolean {
  const a = (adresse ?? '').trim().toLowerCase();
  if (!a.includes('@')) return false;
  return estAdresseInterne(a);
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
 * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — ⚠️ CETTE FONCTION N'A JAMAIS EU D'APPELANT ═══════
 *
 * Vérifié le 04/10/2026 sur tout le dépôt et depuis son commit d'origine (68f8a254) : `grep` ne rend que sa
 * définition et des commentaires qui la citent. Seule sa jumelle `leverHorsGestionApresRattachement` est câblée
 * (`rattachementRepo.ts`, après la transaction de `rattacher`).
 *
 * 🔴 L'ARBITRAGE QU'ELLE DÉCRIT N'A DONC JAMAIS TOURNÉ. Rattacher un bien à un mail « interne » laisse
 * aujourd'hui les DEUX états vivants — et c'est l'une des façons dont les 6 cas du lot précédent ont pu naître.
 *
 * ⚠️ JE NE LA CÂBLE PAS DE MON PROPRE CHEF, et c'est délibéré : la brancher RETIRERAIT une marque posée à la main
 * lors d'un autre geste humain. C'est un changement de comportement qu'Arno n'a pas demandé — il a demandé le sens
 * INVERSE (marquer interne détache les biens, voir `detacherBiensApresInterne` juste en dessous). Signalé à lui
 * comme une décision à prendre ; je la laisse exactement telle quelle en attendant.
 *
 * ⚠️ ET ELLE NE PORTE QUE LA MARQUE D'ÉCHANGE. Depuis la migration 297, la vérité précise est la marque PAR MAIL
 * (`gestion_message_interne`) : la câbler sans traiter les deux niveaux laisserait `interneDuMail` répondre
 * « interne » par la marque par mail, et le conflit intact.
 *
 * ── Son encadré d'origine, conservé ───────────────────────────────────────────────────────────────────────────
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — MARQUER « INTERNE » DÉTACHE LES BIENS
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (04/10/2026) : « Règle symétrique de leverInterneApresRattachement : marquer Interne DÉTACHE les
   biens de ce mail, selon la fenêtre choisie […], par la porte existante (statut 'retire'), tracé. »

   🔴 PAR LA PORTE EXISTANTE, ET PAR ELLE SEULE : `changerStatut`, celle de l'écran et du lot RATTACHEMENT-1, avec
   son journal, son auteur et son motif. Aucun `UPDATE` n'est écrit ici — la ligne reste, datée et signée, et
   l'« Annuler » la remet par la même porte.

   🔴 ON NE RETIRE QUE LES LIENS DE BIEN **VIVANTS** DES MAILS COUVERTS. Pas les propositions (elles ne sont pas des
   rattachements), pas les liens posés sur une pièce jointe (`piece_id IS NULL`), pas les autres mails de l'échange —
   c'est la fenêtre choisie qui dit lesquels, et elle est calculée par le module PUR `mailsCouvertsParLeChoix`.

   ⚠️ CE GESTE TOUCHE AUSSI LES LIENS POSÉS À LA MAIN, et c'est la seule exception au principe « un rattachement
   posé à la main n'est jamais déplacé ». Elle est légitime pour la même raison que « Toute la conversation » :
   le geste ANNONCE sa portée, nomme les biens un par un, et attend un « Confirmer ». Voir l'encadré de
   `interneDetache.ts`.
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES BIENS QUE LE GESTE DÉTACHERAIT, pour la confirmation — AUCUNE ÉCRITURE. LECTURE SEULE.
 *
 * 🔴 LE LIBELLÉ VIENT DE L'ANNUAIRE D'AUJOURD'HUI, avec repli sur le libellé FIGÉ du lien : c'est la même règle que
 * la fenêtre « Visualiser / Modifier ». Un bien sans nom dans une confirmation serait pire qu'un nom d'hier.
 */
export async function biensADetacher(messageIds: readonly number[]): Promise<BienDetache[]> {
  const ids = idsPropres(messageIds);
  if (ids.length === 0 || !(await rattachementsDisponibles())) return [];
  const { rows } = await query<{ id: string; cle: string | null; libelle: string | null; nom: string | null }>(
    /* ⚠️ `AS cle`, ET C'EST UN DÉFAUT QUE L'ÉCRAN A MONTRÉ : la première version sélectionnait `r.cible_cle` sans
       alias et lisait `r.cle` — la confirmation annonçait « lot ? » au lieu du numéro. Le type TypeScript ne peut
       pas attraper cela : il décrit ce que le code ATTEND, pas ce que la requête REND. */
    `SELECT r.id::text, r.cible_cle AS cle, r.cible_libelle AS libelle,
            CASE WHEN lo.wippimmo_id IS NULL THEN NULL
                 ELSE concat_ws(', ', nullif(lo.adresse, ''), nullif(lo.commune, '')) END AS nom
       FROM gestion_rattachement r
       LEFT JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
      WHERE r.message_id = ANY($1::bigint[]) AND ${sqlLiensDuBien('r')}
      ORDER BY r.id`, [ids]);
  return rows.map((r) => ({
    lienId: Number(r.id),
    libelle: (r.nom ?? '').trim() !== '' ? `${r.nom} — lot ${r.cle ?? '?'}`
      : (r.libelle ?? '').trim() !== '' ? (r.libelle as string) : `lot ${r.cle ?? '?'}`,
  }));
}

/**
 * DÉTACHE LES BIENS DE CES MAILS, par la porte existante. Rend ce qui a été détaché, pour l'« Annuler ».
 *
 * ⚠️ UN ÉCHEC NE FAIT PAS ÉCHOUER LE MARQUAGE : la marque est déjà posée, et l'écran est juste de toute façon. On
 * rend ce qu'on a pu faire, et l'appelant le dit. Même discipline que `leverHorsGestionApresRattachement`.
 */
export async function detacherBiensApresInterne(
  messageIds: readonly number[], auteur: Auteur,
): Promise<BienDetache[]> {
  try {
    const { changerStatut } = await import('./rattachementRepo');
    const cibles = await biensADetacher(messageIds);
    const faits: BienDetache[] = [];
    for (const b of cibles) {
      const issue = await changerStatut({
        lienId: b.lienId, statut: 'retire', auteur, motif: MOTIF_DETACHE_PAR_INTERNE,
      });
      if (issue.ok) faits.push(b);
    }
    return faits;
  } catch (e) {
    console.error('[gestion/interne] détachement après marquage impossible', e);
    return [];
  }
}

/**
 * REMET CES LIENS, pour l'« Annuler » des secondes qui suivent. Par la MÊME porte.
 *
 * 🔴 ON NE REMET QUE CE QUE CE GESTE A RETIRÉ, et le motif en base est la seule preuve qu'on ait : un lien retiré
 * par le suivi d'une conversation, ou à la main, n'a pas à être ressuscité par l'annulation d'un marquage
 * « interne ». Sans ce garde, un « Annuler » cliqué un peu tard aurait remis des liens que personne n'avait
 * demandé de remettre.
 */
export async function remettreBiensDetaches(
  lienIds: readonly number[], auteur: Auteur,
): Promise<number> {
  try {
    const ids = idsPropres(lienIds);
    if (ids.length === 0 || !(await rattachementsDisponibles())) return 0;
    const { changerStatut } = await import('./rattachementRepo');
    const { rows } = await query<{ id: string; message_id: string }>(
      `SELECT id::text, message_id::text FROM gestion_rattachement
        WHERE id = ANY($1::bigint[]) AND statut = 'retire' AND coalesce(statut_motif, '') = $2
        ORDER BY id`, [ids, MOTIF_DETACHE_PAR_INTERNE]);
    let remis = 0;
    const mails = new Set<number>();
    for (const r of rows) {
      const issue = await changerStatut({
        lienId: Number(r.id), statut: 'confirme', auteur, motif: MOTIF_REMIS_APRES_ANNULATION,
      });
      if (issue.ok) { remis += 1; mails.add(Number(r.message_id)); }
    }

    /**
     * ══ 🔴🔴 ET LES INTERVENTIONS QUE LA CASCADE AVAIT EMPORTÉES ═══════════════════════════════════════════════
     *
     * ⚠️ DÉFAUT TROUVÉ PAR LA PHOTOGRAPHIE D'EMPREINTES, PAS PAR UN RAISONNEMENT. Après l'essai sur le mail
     * « _TEST », la comparaison mail par mail montrait encore `interventions[longueur]` différent : retirer un
     * bien déclenche `retirerInterventionsSansBien` (migration 293 — une intervention ne survit pas au départ de
     * son bien), et mon « Annuler » remettait les biens SANS remettre les interventions. « Remet EXACTEMENT les
     * rattachements d'avant » était donc faux, de deux lignes.
     *
     * 🔴 APRÈS LES BIENS, ET JAMAIS AVANT : la base refuse une intervention sans lien vivant vers un bien sur le
     * même mail. L'ordre n'est pas un style, c'est la contrainte.
     *
     * 🔴 ET SEULEMENT CELLES QUE LA CASCADE A RETIRÉES, reconnues à leur motif. Une intervention retirée à la
     * main, ou par le suivi d'une conversation, n'a pas à ressusciter ici — c'est la même règle que pour les
     * biens, et pour la même raison.
     */
    for (const m of mails) {
      const { rows: inter } = await query<{ id: string }>(
        `SELECT id::text FROM gestion_rattachement
          WHERE message_id = $1 AND regle = $2 AND statut = 'retire' AND coalesce(statut_motif, '') = $3
          ORDER BY id`, [m, REGLE_INTERVENTION, MOTIF_INTERVENTION_SANS_BIEN]);
      for (const i of inter) {
        await changerStatut({
          lienId: Number(i.id), statut: 'confirme', auteur, motif: MOTIF_REMIS_APRES_ANNULATION,
        });
      }
    }
    return remis;
  } catch (e) {
    console.error('[gestion/interne] remise après annulation impossible', e);
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
