import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { biensPourLaFenetreDrive } from '../../../../../../lib/gestion/raccourciDriveRepo';
import { vignettesDeLaFenetre } from '../../../../../../lib/gestion/raccourciDrive';

/**
 * /api/admin/gestion/drive/dossier-du-bien — SUR QUEL(S) BIEN(S) LA FENÊTRE DRIVE S'OUVRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LECTURE SEULE, ET PLUS AUCUN APPEL À GOOGLE. Au lot DRIVE-DOSSIER-DU-BIEN, cette route lisait le dossier du
 * PROPRIÉTAIRE puis descendait d'un cran par un `files.list` pour trouver le sous-dossier du bien. Elle n'en a
 * plus besoin : notre base tient l'arbre du Drive (`gestion_drive_arbre`), avec un nœud par bien — 365 sur 365
 * lots — et un par propriétaire — 307 sur 307. Un aller-retour chez Google en moins à chaque ouverture, et
 * surtout le MÊME dossier que « Dossier Drive » sur la fiche du bien, qui lit exactement ce nœud-là.
 *
 * 🔴 LA RÈGLE DE PRIORITÉ N'EST PAS ÉCRITE ICI. Elle vit dans `raccourciDriveRepo.biensPourLaFenetreDrive` (ⓐ les
 * biens rattachés, ⓑ sinon la première adresse du « À » qui n'est pas des nôtres, ⓒ sinon rien) et la mise en
 * forme dans le module PUR `raccourciDrive`. Cette route ne fait que lire trois paramètres et rendre le résultat :
 * une règle écrite à la fois dans un module et dans sa route finit par valoir deux choses différentes.
 *
 * 🔴 ELLE NE DONNE AUCUN ACCÈS NOUVEAU. Un identifiant de dossier Drive ne vaut rien par lui-même : le jeton est
 * obtenu par délégation pour la personne connectée, et Google applique SES droits, dossier par dossier.
 *
 * ⚠️ AUCUNE CORRESPONDANCE ⇒ LISTES VIDES, EN 200. Ce n'est pas une panne : c'est le cas ⓒ d'Arno, « comportement
 * actuel inchangé ». L'écran n'affiche alors aucune vignette, et la fenêtre est celle d'avant ce lot.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Les clés de lot passées en requête, bornées et nettoyées. Une clé farfelue est IGNORÉE, jamais transmise. PUR. */
export function clesDemandees(brut: string | null): string[] {
  return [...new Set((brut ?? '').split(',').map((c) => c.trim()).filter((c) => /^[A-Za-z0-9_-]{1,40}$/.test(c)))]
    .slice(0, 20);
}

/**
 * ══ 🔴 LES ADRESSES DU CHAMP « À », LUES DANS L'ADRESSE DE LA REQUÊTE ════════════════════════════════════════════
 *
 * ⚠️ BORNÉES À DIX, ET DANS L'ORDRE DE SAISIE. L'ordre est la règle même (« la PREMIÈRE adresse destinataire »),
 * et la borne évite qu'une adresse de requête démesurée parte vers la base ; au-delà de dix destinataires, la
 * première est de toute façon décidée depuis longtemps.
 *
 * ⚠️ CE N'EST PAS ICI QU'ON ÉCARTE NOS PROPRES ADRESSES : c'est `adressesRapprochables`, dans le dépôt, qui le
 * fait — l'unique définition du dépôt. Filtrer un peu ici et un peu là ferait deux règles.
 */
export function adressesDemandees(brut: string | null): string[] {
  return (brut ?? '').split(',').map((a) => a.trim().toLowerCase()).filter((a) => a !== '' && a.includes('@'))
    .slice(0, 10);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const brutFil = Number(url.searchParams.get('fil') ?? '');
  const filId = Number.isInteger(brutFil) && brutFil > 0 ? brutFil : null;
  const cles = clesDemandees(url.searchParams.get('lots'));
  const adresses = adressesDemandees(url.searchParams.get('a'));

  try {
    const { biens, proprietaire } = await biensPourLaFenetreDrive({ filId, cles, adresses });
    return Response.json(
      { etat: 'ok', biens, proprietaire, vignettes: vignettesDeLaFenetre(biens, proprietaire) },
      { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    /**
     * ⚠️ DES LISTES VIDES, PAS UNE ERREUR À L'ÉCRAN. C'est un RACCOURCI : s'il manque, la fenêtre reste
     * entièrement utilisable — on navigue, on cherche, on joint comme avant. Rougir pour un confort absent
     * ferait croire à une panne du Drive, qui lui va très bien.
     */
    console.error('[gestion/dossier-du-bien] lecture impossible', e);
    return Response.json({ etat: 'ok', biens: [], proprietaire: null, vignettes: [] },
      { headers: { 'Cache-Control': SANS_CACHE } });
  }
}
