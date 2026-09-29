import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { biensDuMail } from '../../../../../../lib/gestion/dossierDuBienRepo';
import { dossiersPrioritaires, sousDossierDuBien } from '../../../../../../lib/gestion/dossierDuBien';
import { listerContenu } from '../../../../../../lib/gestion/drive';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';

/**
 * /api/admin/gestion/drive/dossier-du-bien (lot DRIVE-DOSSIER-DU-BIEN) — LE DOSSIER DRIVE DU BIEN DE CE MAIL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LECTURE SEULE, ET RIEN D'AUTRE. Deux étapes :
 *   ① NOTRE BASE donne le dossier du PROPRIÉTAIRE — la correspondance est connue depuis le lot 253
 *      (`gestion_annuaire_proprietaire.drive_dossier_id`). Aucune devinette : c'est une clé WIPPIMMO ;
 *   ② UN SEUL `files.list` par dossier de propriétaire descend jusqu'au sous-dossier DU BIEN, que le Drive nomme
 *      « → <adresse> — <nature> — lot 421 ». Pas un `files.create`, pas un `files.update`, pas un partage.
 *
 * 🔴 LE NUMÉRO DE LOT EST CE QUI TRANCHE, jamais l'adresse : un bailleur peut avoir cinq lots à la même adresse
 * (mesuré : EKAMAI, 1bis rue des Pavillons). Et si rien ne correspond, on s'en tient au dossier du propriétaire —
 * juste, un cran plus haut — plutôt que de descendre au hasard dans le logement d'un autre.
 *
 * 🔴 ELLE NE DONNE AUCUN ACCÈS NOUVEAU. Un identifiant de dossier Drive ne vaut rien par lui-même : le jeton est
 * obtenu par DÉLÉGATION pour la personne connectée, et Google applique SES droits, dossier par dossier. Quelqu'un
 * qui n'a pas accès au dossier d'un propriétaire le verra proposé et se le verra refuser par Google — ce qui est
 * le comportement juste, et prononcé par la bonne autorité.
 *
 * ⚠️ UN MAIL SANS BIEN — message neuf sans classement, ou échange « Hors gestion » — rend une liste VIDE. L'écran
 * n'affiche alors aucune ligne prioritaire, et le sélecteur est exactement celui d'avant ce lot.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Les clés de lot passées en requête, bornées et nettoyées. Une clé farfelue est IGNORÉE, jamais transmise. PUR. */
export function clesDemandees(brut: string | null): string[] {
  return [...new Set((brut ?? '').split(',').map((c) => c.trim()).filter((c) => /^[A-Za-z0-9_-]{1,40}$/.test(c)))]
    .slice(0, 20);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const brutFil = Number(url.searchParams.get('fil') ?? '');
  const filId = Number.isInteger(brutFil) && brutFil > 0 ? brutFil : null;
  const cles = clesDemandees(url.searchParams.get('lots'));

  try {
    const biens = await biensDuMail({ filId, cles });
    const dossiers = dossiersPrioritaires(biens);
    if (dossiers.length === 0) {
      return Response.json({ etat: 'ok', biens, dossiers }, { headers: { 'Cache-Control': SANS_CACHE } });
    }

    /**
     * ② LA DESCENTE JUSQU'AU BIEN. Un seul `files.list` par dossier de propriétaire — et seulement quand la ligne
     * ne couvre QU'UN bien : à deux biens, il n'y a pas de sous-dossier unique où descendre, et le dossier du
     * propriétaire est la bonne destination.
     *
     * ⚠️ AU MIEUX-EFFORT : si le Drive ne répond pas, la ligne reste celle du propriétaire. Un raccourci qui
     * échoue ne doit pas faire disparaître la ligne — elle est déjà utile sans la descente.
     */
    const jeton = await jetonPourRequete(request);
    if (jeton.etat === 'ok') {
      await Promise.all(dossiers.map(async (d) => {
        if (d.cles.length !== 1) return;
        try {
          const contenu = await listerContenu(jeton.jeton, { parentId: d.dossierId }, { fetch });
          if (!contenu.ok) return;
          const enfants = contenu.valeur.fichiers.filter((f) => f.dossier).map((f) => ({ id: f.id, nom: f.nom }));
          const sous = sousDossierDuBien(enfants, d.cles[0]);
          if (sous !== null) { d.dossierId = sous.id; d.dossierNom = sous.nom; }
        } catch { /* le dossier du propriétaire reste la destination : juste, un cran plus haut */ }
      }));
    }

    return Response.json({ etat: 'ok', biens, dossiers }, { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    /**
     * ⚠️ UNE LISTE VIDE, PAS UNE ERREUR À L'ÉCRAN. C'est un RACCOURCI : s'il manque, le sélecteur reste
     * entièrement utilisable — on navigue, on cherche, on joint comme avant. Rougir pour un confort absent
     * ferait croire à une panne du Drive, qui lui va très bien.
     */
    console.error('[gestion/dossier-du-bien] lecture impossible', e);
    return Response.json({ etat: 'ok', biens: [], dossiers: [] },
      { headers: { 'Cache-Control': SANS_CACHE } });
  }
}
