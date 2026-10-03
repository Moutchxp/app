import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { chaineParents } from '../../../../../../lib/gestion/drive';
import { metadonneesMemo, oublierChaine, oublierElement } from '../../../../../../lib/gestion/driveMemoire';
import { idsProteges } from '../../../../../../lib/gestion/driveVerdict';
import { indexerMaillons } from '../../../../../../lib/gestion/driveLectureFichier';
import { peutMettreCorbeille } from '../../../../../../lib/gestion/driveCorbeille';
import { basculerCorbeille } from '../../../../../../lib/gestion/driveCorbeilleReel';
import { inscrireMouvement, marquerAnnule, mouvementsAnnulables } from '../../../../../../lib/gestion/driveMouvementRepo';
import { corbeilleDriveDisponible, journalMouvementDriveDisponible } from '../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/drive/corbeille — LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE : METTRE UN FICHIER À LA CORBEILLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 C'EST ICI QUE LA RÈGLE PROTÈGE. L'écran explique, la route refuse — un écran se modifie, une route non.
 *
 * Pour CHAQUE fichier et pour CHAQUE appel, sans exception et sans cache d'écran :
 *   ① on relit les MÉTADONNÉES du fichier chez Google (son type, donc : est-ce un dossier ?) ;
 *   ② on remonte la chaîne de ses parents chez Google ;
 *   ③ on résout « Documents clients scannés » ET TOUS SES ANCÊTRES ;
 *   ④ on demande le verdict au module PUR `driveCorbeille`, qui refuse :
 *        · tout DOSSIER, sans exception — il emporterait ce qu'on ne voit pas ;
 *        · tout ce qui est sous l'archive, à toute profondeur ;
 *        · l'archive elle-même et chacun de ses ancêtres ;
 *        · tout ce qu'il n'a pas pu lire — ne pas savoir vaut interdit.
 *
 * 🔴🔴 LE GARDE EST POSÉ PAR ASCENDANCE DE DOSSIERS, JAMAIS PAR LE NOM DU FICHIER. On ne demande pas « ce fichier
 * s'appelle-t-il comme un document d'archive ? » : on REMONTE ses parents jusqu'à savoir s'il descend de l'archive.
 * Un fichier rangé douze niveaux sous « Documents clients scannés » est sous « Documents clients scannés », quel
 * que soit son nom — et un fichier nommé « Documents clients scannés.pdf » rangé ailleurs ne l'est pas.
 *
 * 🔴🔴 LA SUPPRESSION DÉFINITIVE N'EXISTE PAS ICI. Cette route n'appelle qu'une seule écriture Google
 * (`basculerCorbeille`, dans `driveCorbeilleReel.ts`), dont un test statique énumère ce qu'elle a le droit de
 * faire : un `PATCH` avec `trashed`, et rien d'autre. Ni `files.delete`, ni `emptyTrash`, nulle part.
 *
 * 🔴🔴 ET LE JOURNAL EST OBLIGATOIRE. Sans la migration 274 (le journal) NI la 295 (qui lui apprend le mot
 * « corbeille »), cette route REFUSE tout, même appelée directement : on ne met pas à la corbeille du Drive du
 * cabinet ce qu'on ne saurait pas consigner. Un document disparu sans une ligne pour dire qui l'a retiré et quand
 * est pire qu'un document qu'on n'a pas touché.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

export const MOTIF_SANS_MIGRATION =
  'Mise à la corbeille indisponible : la mise à jour de la base qui consigne ce geste (295) n’est pas appliquée. '
  + 'On ne retire pas du Drive ce qu’on ne saurait pas expliquer ensuite.';

/** Au plus dix fichiers d'un coup : c'est un geste à l'unité, pas un ménage de masse. */
const MAX_PAR_APPEL = 10;

interface Demande {
  action?: string;
  elements?: { id: string; nom?: string }[];
  /** Pour « Annuler » : les lignes de journal rendues par un appel précédent. */
  mouvements?: number[];
}

/**
 * 🔴 LA SONDE. L'écran demande UNE fois si le geste est possible, et il le demande à la ROUTE — pas à une copie de
 * la règle côté navigateur. Sans les deux migrations, il n'affiche PAS l'entrée du menu, au lieu de laisser cliquer
 * sur quelque chose qui sera refusé.
 */
export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const disponible = await journalMouvementDriveDisponible() && await corbeilleDriveDisponible();
  return json({ etat: 'ok', disponible, motif: disponible ? null : MOTIF_SANS_MIGRATION });
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  // 🔴🔴 LES DEUX MIGRATIONS D'ABORD. Sans elles, rien ne bouge — même par un appel direct à la route.
  if (!await journalMouvementDriveDisponible() || !await corbeilleDriveDisponible()) {
    return json({ etat: 'refus', message: MOTIF_SANS_MIGRATION }, 409);
  }

  let corps: Demande;
  try { corps = (await request.json()) as Demande; }
  catch { return json({ etat: 'refus', message: 'Requête invalide.' }, 422); }

  const auteur = await auteurDeLaRequete(request);
  try {
    if (corps.action === 'restaurer') return await restaurer(corps, jeton, auteur);
    if (corps.action !== 'corbeille') return json({ etat: 'refus', message: 'Action inconnue.' }, 422);
    return await mettre(corps, jeton, auteur);
  } catch (e) {
    console.error('[api/admin/gestion/drive/corbeille] échec', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}

type Jeton = { jeton: string; compteGoogle: string };
type Auteur = { id: number | null; libelle: string };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   METTRE À LA CORBEILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function mettre(corps: Demande, jeton: Jeton, auteur: Auteur): Promise<Response> {
  const elements = (corps.elements ?? [])
    .filter((e) => typeof e?.id === 'string' && e.id.trim() !== '')
    .slice(0, MAX_PAR_APPEL);
  if (elements.length === 0) return json({ etat: 'refus', message: 'Aucun fichier désigné.' }, 422);

  /**
   * 🔴 L'ARCHIVE EST RÉSOLUE AVANT TOUT, ET SON ÉCHEC ARRÊTE TOUT. Ne pas savoir où elle est, c'est ne pas pouvoir
   * affirmer qu'un fichier n'en vient pas — et un geste irréversible à trente jours ne se prend pas sur un doute.
   */
  const proteges = await idsProteges(jeton.compteGoogle, jeton.jeton);
  if (proteges === null) {
    return json({
      etat: 'refus',
      message: 'Refusé : impossible de situer « Documents clients scannés » en ce moment. Par précaution, rien '
        + 'n’est mis à la corbeille tant que l’archive n’a pas été localisée.',
    }, 409);
  }

  const faits: { id: string; nom: string; mouvementId: number | null }[] = [];
  const refuses: { id: string; nom: string; motif: string }[] = [];

  for (const e of elements) {
    const id = e.id.trim();
    const nomAnnonce = e.nom ?? id;
    // ── ① CE QUE GOOGLE DIT DE CE FICHIER (son type, son parent). Jamais ce que l'écran affirme. ───────────────
    const meta = await metadonneesMemo(jeton.compteGoogle, jeton.jeton, id, { fetch });
    if (!meta.ok) {
      refuses.push({ id, nom: nomAnnonce, motif: 'Ce fichier n’a pas pu être lu dans le Drive.' });
      continue;
    }
    const nom = meta.valeur.nom;
    const estDossier = meta.valeur.typeMime === 'application/vnd.google-apps.folder';
    const parentOrigine = meta.valeur.parents[0] ?? null;

    // ── ② LA CHAÎNE RÉELLE DE SES PARENTS ─────────────────────────────────────────────────────────────────────
    const chaine = await chaineParents(jeton.jeton, id, { fetch });
    const v = peutMettreCorbeille(
      { cibleId: id, estDossier, sorte: 'corbeille' },
      {
        index: indexerMaillons([...chaine, ...proteges.maillons]),
        proteges: proteges.proteges, protegesEtAncetres: proteges.protegesEtAncetres,
      },
    );
    if (!v.ok) { refuses.push({ id, nom, motif: v.motif }); continue; }
    if (parentOrigine === null) {
      refuses.push({ id, nom, motif: 'Ce fichier est à la racine d’un Drive : son emplacement ne peut pas être consigné.' });
      continue;
    }

    // ── ③ L'ÉCRITURE, PUIS LE JOURNAL — dans cet ordre, invariant du lot DRIVE-DEPLACER ───────────────────────
    const r = await basculerCorbeille(jeton.jeton, { id, versLaCorbeille: true }, { fetch });
    oublierElement(jeton.compteGoogle, id);
    oublierChaine(jeton.compteGoogle, parentOrigine);
    if (!r.ok) { refuses.push({ id, nom, motif: r.motif }); continue; }

    const mouvementId = await inscrireMouvement({
      action: 'corbeille', driveId: id, nom, estDossier: false,
      parentOrigine, parentCible: '', copieDriveId: null,
      auteurId: auteur.id, auteurLibelle: auteur.libelle, compteGoogle: jeton.compteGoogle,
    });
    faits.push({ id, nom, mouvementId });
  }

  return json({
    etat: 'ok', action: 'corbeille', faits, refuses,
    mouvements: faits.map((f) => f.mouvementId).filter((x): x is number => x !== null),
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   RESTAURER — c'est « Annuler le dernier déplacement », appliqué à une corbeille
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LA RESTAURATION RELIT LE JOURNAL, jamais ce que le navigateur affirme. Et elle repasse par le MÊME verdict :
 * sortir un fichier de la corbeille est un geste sur ce fichier, et il n'y a aucune raison de lui accorder un
 * régime de faveur — sans quoi « je l'y mets, je l'en sors » deviendrait une porte de sortie de l'archive.
 */
async function restaurer(corps: Demande, jeton: Jeton, auteur: Auteur): Promise<Response> {
  const ids = (corps.mouvements ?? []).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return json({ etat: 'refus', message: 'Rien à restaurer.' }, 422);

  const lignes = (await mouvementsAnnulables(ids)).filter((l) => l.action === 'corbeille');
  if (lignes.length === 0) {
    return json({ etat: 'refus', message: 'Ces mises à la corbeille ne sont plus annulables.' }, 409);
  }

  const proteges = await idsProteges(jeton.compteGoogle, jeton.jeton);
  if (proteges === null) {
    return json({ etat: 'refus', message: 'Refusé : impossible de situer l’archive en ce moment.' }, 409);
  }

  const remis: string[] = [];
  const refuses: { id: string; nom: string; motif: string }[] = [];
  for (const l of lignes) {
    /**
     * ══ 🔴🔴 ON REMONTE LA CHAÎNE D'UN FICHIER **À LA CORBEILLE**, ET IL FAUT LE DEMANDER ═════════════════════
     *
     * DÉFAUT CONSTATÉ SUR LE VRAI DRIVE le 03/10/2026, dossier « Test » : la mise à la corbeille marchait, et
     * « Annuler » répondait « Emplacement incomplet : par précaution, cette mise à la corbeille est refusée ».
     * Le geste n'était donc PAS réversible — c'est-à-dire que la condition même qui avait permis à Arno de lever
     * l'interdit de suppression n'était pas tenue.
     *
     * 🔴 LA CAUSE : `lireMetadonnees` refuse par défaut un élément à la corbeille, et c'est juste partout
     * ailleurs. Mais ici le fichier EST à la corbeille — par définition. La chaîne revenait donc vide, le verdict
     * ne savait pas le situer, et « ne pas savoir vaut interdit » faisait le reste.
     *
     * 🔒 LE GARDE-FOU NE BOUGE PAS : on lit la chaîne RÉELLE, et `peutMettreCorbeille` refuse toujours un fichier
     * de « Documents clients scannés » — à la corbeille comme ailleurs. On lit mieux, on n'autorise pas plus.
     */
    const chaine = await chaineParents(jeton.jeton, l.driveId, { fetch }, 32, { inclureCorbeille: true });
    const v = peutMettreCorbeille(
      { cibleId: l.driveId, estDossier: false, sorte: 'restaurer' },
      {
        index: indexerMaillons([...chaine, ...proteges.maillons]),
        proteges: proteges.proteges, protegesEtAncetres: proteges.protegesEtAncetres,
      },
    );
    if (!v.ok) { refuses.push({ id: l.driveId, nom: l.nom, motif: v.motif }); continue; }

    const r = await basculerCorbeille(jeton.jeton, { id: l.driveId, versLaCorbeille: false }, { fetch });
    oublierElement(jeton.compteGoogle, l.driveId);
    oublierChaine(jeton.compteGoogle, l.parentOrigine);
    if (!r.ok) { refuses.push({ id: l.driveId, nom: l.nom, motif: r.motif }); continue; }

    // 🔴 LE RETOUR EST UN GESTE, donc il a SA ligne. Et l'aller est daté annulé — sans être effacé.
    await inscrireMouvement({
      action: 'restaurer', driveId: l.driveId, nom: l.nom, estDossier: false,
      parentOrigine: l.parentOrigine, parentCible: '', copieDriveId: null,
      auteurId: auteur.id, auteurLibelle: `${auteur.libelle} (annulation)`, compteGoogle: jeton.compteGoogle,
    });
    await marquerAnnule(l.id);
    remis.push(l.driveId);
  }

  return json({ etat: 'ok', action: 'restaurer', remis, refuses });
}
