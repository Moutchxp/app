/**
 * ══ 🔴🔴 LOT PIECES-PERMIS-SERVIES-PAR-L-APPLICATION (Arno, 14/10/2026) — UNE PIÈCE DE PERMIS S'OUVRE PAR L'APPLICATION ══════
 *
 * Sur le serveur de production, MinIO n'écoute que sur 127.0.0.1:9000 et n'est JAMAIS exposé. Une URL présignée S3 porte cet
 * endpoint : remise à un navigateur ou glissée dans un mail, elle est injoignable. La Gestion sert déjà ses pièces par
 * l'application (`api/admin/gestion/pieces/[id]`) ; le module Permis s'aligne sur cette règle.
 *
 * Ce module dit, une seule fois :
 *   · le CHEMIN d'une pièce : `/admin/permis/piece/<source>/<id>` (+ `?telecharger=1` pour un téléchargement forcé) ;
 *   · son URL ABSOLUE pour un mail, sur `SVAV_URL_PUBLIQUE`, repli `http://localhost:3000` (celui de la Gestion) ;
 *   · les EN-TÊTES de la réponse.
 *
 * 🔒 Le chemin vit dans l'espace des PAGES (`/admin/...`), pas sous `/api/admin/...` : sans session, le proxy y redirige vers
 * la page de connexion, alors qu'une route d'API répondrait un 401 vide — un clic depuis un mail tomberait sur une page blanche.
 *
 * 🔒 La clé de stockage ne sort JAMAIS : le client ne connaît qu'un identifiant de pièce et sa source.
 *
 * PUR : aucune base, aucun réseau. Les deux imports sont des modules purs de la Gestion (une seule écriture de chaque règle).
 */
import { parametreNomFichier } from '../gestion/envoiGmail';
import { telechargementSeulement } from '../gestion/pieceSecurite';

/** D'où vient la pièce : reçue par e-mail (`demande_reponse_piece`) ou déposée sur le permis (`dossier_document`). */
export type SourcePiecePermis = 'reponse' | 'dossier';

export function estSourcePiecePermis(v: unknown): v is SourcePiecePermis {
  return v === 'reponse' || v === 'dossier';
}

/** Le chemin RELATIF de la route qui sert la pièce. `telecharger` → `Content-Disposition: attachment` avec le nom d'origine. */
export function cheminPiecePermis(source: SourcePiecePermis, id: number, opts: { telecharger?: boolean } = {}): string {
  return `/admin/permis/piece/${source}/${id}${opts.telecharger ? '?telecharger=1' : ''}`;
}

/** La racine des liens mis dans un mail : `SVAV_URL_PUBLIQUE`, repli identique à la Gestion (`travailleurEnvoiReel.ts`). */
export function racinePublique(env: Record<string, string | undefined> = process.env): string {
  return (env.SVAV_URL_PUBLIQUE ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** L'URL ABSOLUE d'une pièce, pour un mail d'alerte. Sans session, le clic passe par la page de connexion. */
export function urlAbsoluePiecePermis(
  source: SourcePiecePermis, id: number, opts: { telecharger?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
): string {
  return `${racinePublique(env)}${cheminPiecePermis(source, id, opts)}`;
}

/** Type servi quand la base n'en connaît pas : jamais interprété par le navigateur. */
export const TYPE_PAR_DEFAUT = 'application/octet-stream';
export const CACHE_PRIVE = 'private, no-store';

/** Types affichés tels quels. Tout autre type affiché (HTML d'un téléservice, CSV…) l'est dans un bac à sable sans script. */
function typeSansRisque(typeMime: string): boolean {
  return typeMime === 'application/pdf' || typeMime.startsWith('image/');
}

/**
 * LES EN-TÊTES D'UNE PIÈCE DE PERMIS SERVIE. PUR.
 *
 * - `Content-Disposition` : `inline` par défaut, `attachment` sur demande OU pour une archive / un binaire (règle de la Gestion,
 *   `telechargementSeulement`). Nom d'origine selon la RFC 2231 (`parametreNomFichier`) : un nom accentué ne s'abîme pas, et un
 *   caractère hors ISO-8859-1 ne fait pas échouer la réponse. Anti-injection d'abord, comme `dispositionTelechargement`.
 * - `private, no-store` : rien en cache partagé ni sur disque.
 * - `nosniff` : le navigateur ne re-devine pas le type.
 * - 🔒 `Content-Security-Policy: sandbox` sur toute pièce AFFICHÉE qui n'est ni un PDF ni une image. Servie par MinIO, une pièce
 *   HTML s'affichait sur l'origine du stockage ; servie par l'application, elle s'afficherait sur celle de l'administration, avec
 *   sa session. Le bac à sable la rend à l'identique, sans exécuter de script et sans accès à l'origine. (Pas sur le PDF : le
 *   visionneur du navigateur refuse de s'ouvrir dans un document en bac à sable.)
 */
export function enTetesPiecePermis(p: { nomFichier: string; typeMime: string | null; telecharger: boolean }): Record<string, string> {
  const type = (p.typeMime ?? '').trim().toLowerCase() || TYPE_PAR_DEFAUT;
  const attachement = p.telecharger || telechargementSeulement({ nom: p.nomFichier, typeMime: type });
  const propre = (p.nomFichier || 'piece').replace(/[\r\n"\\]/g, '_').trim() || 'piece';
  return {
    'Content-Type': type,
    'Content-Disposition': `${attachement ? 'attachment' : 'inline'}; ${parametreNomFichier(propre)}`,
    'Cache-Control': CACHE_PRIVE,
    'X-Content-Type-Options': 'nosniff',
    ...(!attachement && !typeSansRisque(type) ? { 'Content-Security-Policy': 'sandbox' } : {}),
  };
}
