import 'server-only';
import { exigerInternaute } from '../../../../lib/internaute/authGarde';
import { validerRectification } from '../../../../lib/internaute/rectification';
import { rectifierInternaute, ErreurEmailDuplique } from '../../../../lib/internaute/cycleVie';
import { lireCompte } from '../../../../lib/internaute/espace';

// Runtime Node (driver pg via la garde + la rectification). Route AUTHENTIFIÉE (garde internaute).
export const runtime = 'nodejs';

/**
 * PATCH /api/internaute/espace/compte — modification des SEULS prénom/nom de l'internaute CONNECTÉ.
 *
 * SÉCURITÉ :
 *  - `exigerInternaute` d'abord ; l'id modifié est TOUJOURS celui SCELLÉ dans la session (`garde.internauteId`), JAMAIS
 *    un id lu dans le corps.
 *  - BARRIÈRE DURE : le patch n'est construit QUE depuis `prenom`/`nom`. Un corps contenant `email`/`telephone` est
 *    IGNORÉ en silence — ces clés ne sont JAMAIS transmises à `rectifierInternaute` (l'e-mail = identifiant de connexion,
 *    modifiable seulement hors application). Prouvé par test.
 *  - Réutilise `validerRectification` (patch partiel + normalisation de casse `normaliserCasseNom`) et `rectifierInternaute`
 *    (whitelist stricte, transactionnel) : AUCUNE règle de validation dupliquée ici. `auteurId = null` = geste de
 *    l'internaute lui-même (pas un admin) ; le journal ne trace que QUELS champs ont changé, jamais leurs valeurs.
 *
 * Réponses : 200 `{ ok, prenom, nom }` (valeurs APRÈS normalisation, relues en base) · 400 (validation) · 500 (générique,
 * sans détail). Aucune PII loggée.
 */
export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerInternaute(request);
  if ('refus' in garde) return garde.refus;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // BARRIÈRE DURE : uniquement prénom/nom ; email/telephone du corps sont écartés et jamais transmis.
  const patch: Record<string, unknown> = {};
  if ('prenom' in b) patch.prenom = b.prenom;
  if ('nom' in b) patch.nom = b.nom;

  const v = validerRectification(patch);
  if (!v.ok) return Response.json({ ok: false }, { status: 400 });

  try {
    const { rectifie } = await rectifierInternaute(garde.internauteId, v.champs, null, 'espace_client'); // id de SESSION, auteur = l'internaute, canal = espace connecté
    if (!rectifie) return Response.json({ ok: false }, { status: 500 }); // ne devrait pas arriver (garde a déjà vérifié l'existence)
    const compte = await lireCompte(garde.internauteId); // relecture → valeurs normalisées réellement en base
    return Response.json({ ok: true, prenom: compte.prenom, nom: compte.nom });
  } catch (e) {
    // ErreurEmailDuplique ne peut PAS survenir ici (email jamais dans le patch) ; capturé par défense, réponse générique.
    if (e instanceof ErreurEmailDuplique) return Response.json({ ok: false }, { status: 500 });
    return Response.json({ ok: false }, { status: 500 });
  }
}
