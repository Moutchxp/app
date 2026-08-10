import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { listerArchives, deposerDocumentSurPermis, supprimerDocumentDossier } from '../../../../../lib/sitadel/demandeRepo';

/**
 * A1a/A1b — /api/admin/permis/archives. GET = liste des permis RENSEIGNÉS par les mairies + leurs pièces (métadonnées ; la
 * clé de stockage ne sort JAMAIS — téléchargement via l'action `url_piece` de /reponses, seul signeur). A1b : POST = TÉLÉVERSER
 * un document à la main sur un permis archivé (multipart) ; DELETE = SUPPRIMER un document AJOUTÉ À LA MAIN — une pièce reçue
 * par e-mail est REFUSÉE côté serveur (registre). RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

/** Trace COMPLÈTE d'une erreur inattendue (jamais de catch muet), avant un 503 générique. */
function journaliser(contexte: string, e: unknown, extra: Record<string, unknown> = {}): void {
  const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
  console.error(`[permis/archives] ${contexte}`, {
    ...extra,
    name: err?.name, message: err?.message,
    code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
    stack: err?.stack,
  });
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json({ archives: await listerArchives(await chargerConfigVeille()) });
  } catch (e) {
    journaliser('GET indisponible (503)', e);
    return Response.json({ erreur: 'archives indisponibles' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let dossierCtx: unknown;
  try {
    const form = await request.formData();
    dossierCtx = form.get('dossierId');
    const dossierId = Number(form.get('dossierId'));
    const fichier = form.get('fichier');
    if (!Number.isInteger(dossierId) || dossierId <= 0 || !(fichier instanceof File)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    const contenu = Buffer.from(await fichier.arrayBuffer());
    const deposePar = garde.auteurId === null ? null : String(garde.auteurId);
    // ORDRE : dépôt S3 + empreinte PUIS insertion (dans le repo). Un refus PRÉVISIBLE (type hors whitelist, trop volumineux,
    // permis non archivé) → 422 explicite, RIEN déposé/inséré. Seule une exception INATTENDUE atteint le catch (503).
    const res = await deposerDocumentSurPermis(dossierId, contenu, fichier.type || null, fichier.name, deposePar);
    if (!res.ok) return Response.json({ erreur: res.motif }, { status: 422 });
    return Response.json({ ok: true, documentId: res.documentId });
  } catch (e) {
    journaliser('POST téléversement impossible (503)', e, { dossierId: dossierCtx });
    return Response.json({ erreur: 'téléversement impossible' }, { status: 503 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let documentCtx: unknown;
  try {
    const corps = (await request.json().catch(() => ({}))) as { documentId?: unknown; source?: unknown };
    documentCtx = corps.documentId;
    // REFUS EXPLICITE côté serveur : une pièce REÇUE PAR E-MAIL (registre de ce que l'administration a communiqué) n'est
    // jamais supprimable — pas seulement dépourvue de bouton. Seuls les documents AJOUTÉS À LA MAIN (source 'dossier') le sont.
    if (corps.source !== 'dossier') return Response.json({ erreur: 'une pièce reçue par e-mail ne peut pas être supprimée (registre de ce que la mairie a communiqué)' }, { status: 403 });
    if (!Number.isInteger(corps.documentId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    const ok = await supprimerDocumentDossier(corps.documentId as number);
    if (!ok) return Response.json({ erreur: 'document introuvable' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    journaliser('DELETE suppression impossible (503)', e, { documentId: documentCtx });
    return Response.json({ erreur: 'suppression impossible' }, { status: 503 });
  }
}
