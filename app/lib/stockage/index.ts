/**
 * Module de STOCKAGE OBJET S3-compatible (photos + PDF). Livré SANS câblage base (les colonnes URL/métadonnées
 * viendront au lot suivant). Invariant projet : « photos/PDF jamais en base ; la base ne garde que les URL +
 * métadonnées ». Bucket PRIVÉ ; accès uniquement par URL SIGNÉE à expiration ; clés NON ÉNUMÉRABLES (UUID v4).
 *
 * REPLI SÛR : le client S3 est créé en LAZY (jamais au boot). Si le stockage n'est pas configuré (variables S3_*
 * absentes), l'app démarre et fonctionne normalement — seul un APPEL au stockage échoue proprement (StockageIndisponible),
 * jamais le démarrage. Même principe que `lireOrdreModules`.
 *
 * Arborescence des clés : `internautes/<internaute_uuid>/<categorie>/<uuid_v4>.<ext>`.
 *  - <internaute_uuid> = sujet RGPD (id stable de l'internaute) → effacement CIBLÉ par PRÉFIXE (`supprimerPrefixe`)
 *    supprime TOUS ses objets d'un coup (bloc C). L'UUID est lui-même non-devinable → préfixe non énumérable.
 *  - <categorie> = 'photos' | 'certificats' (dérivée du type MIME) → lisibilité + futur cycle de vie par catégorie.
 *  - <uuid_v4>.<ext> = nom non séquentiel, non énumérable (jamais « certificat-000123.pdf »).
 *  - Objet SANS internaute (certificat livré hors profil, non-couplage) → `<categorie>/<uuid_v4>.<ext>` (pas de
 *    sujet RGPD associé ; la décision de scope revient au lot de câblage).
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { lireConfigStockage, type ConfigStockage } from './config';

/** Erreur de base du module (permet un `catch` typé côté appelant). */
export class ErreurStockage extends Error {}
/** Stockage non configuré (variables S3_* absentes/incomplètes) — repli sûr, pas un crash au boot. */
export class StockageIndisponible extends ErreurStockage {
  constructor() {
    super('Stockage objet non configuré (variables S3_* absentes) — dépôt/lecture/suppression indisponibles.');
    this.name = 'StockageIndisponible';
  }
}
/** Type MIME non autorisé (seuls image/jpeg et application/pdf sont acceptés). */
export class TypeNonAutorise extends ErreurStockage {
  constructor(type: string) {
    super(`Type non autorisé pour le stockage : « ${type} » (attendus : image/jpeg, application/pdf).`);
    this.name = 'TypeNonAutorise';
  }
}
/** Objet trop volumineux (au-delà de S3_TAILLE_MAX_MO). */
export class TailleDepassee extends ErreurStockage {
  constructor(taille: number, max: number) {
    super(`Objet trop volumineux : ${taille} octets (maximum ${max}).`);
    this.name = 'TailleDepassee';
  }
}

/** Types MIME acceptés → (catégorie d'arborescence, extension de fichier). Whitelist stricte. */
const TYPES_ACCEPTES: Record<string, { categorie: string; ext: string }> = {
  'image/jpeg': { categorie: 'photos', ext: 'jpg' },
  'application/pdf': { categorie: 'certificats', ext: 'pdf' },
};

/** Client + config, mis en cache au 1er usage CONFIGURÉ (jamais construit au boot). `null` si non configuré. */
let cache: { client: S3Client; config: ConfigStockage } | null = null;

function obtenir(): { client: S3Client; config: ConfigStockage } | null {
  if (cache) return cache;
  const config = lireConfigStockage();
  if (!config) return null; // LAZY + repli sûr : pas de config → pas de client, aucune exception
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle, // requis pour MinIO ; sans effet néfaste chez les fournisseurs vhost
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  cache = { client, config };
  return cache;
}

/** Le stockage est-il configuré ? (permet à un appelant de dégrader proprement sans provoquer d'exception.) */
export function stockageConfigure(): boolean {
  return lireConfigStockage() !== null;
}

/** Clé NON ÉNUMÉRABLE (UUID v4) sous l'arborescence RGPD-compatible (cf. en-tête). */
function construireCle(internauteId: string | null, categorie: string, ext: string): string {
  const nom = `${randomUUID()}.${ext}`;
  return internauteId ? `internautes/${internauteId}/${categorie}/${nom}` : `${categorie}/${nom}`;
}

export interface MetaDepot {
  /** Id stable de l'internaute (sujet RGPD) → préfixe d'effacement ciblé. Absent = objet hors profil (non-couplage). */
  internauteId?: string | null;
}
export interface ResultatDepot {
  cle: string;
  bucket: string;
  taille: number;
  type: string;
}

/**
 * Dépose un objet (photo image/jpeg ou certificat application/pdf). Renvoie sa CLÉ (à persister côté base au lot
 * suivant ; JAMAIS le contenu). Rejette : type non autorisé, taille > borne, stockage non configuré.
 */
export async function deposer(contenu: Buffer | Uint8Array, typeMime: string, meta: MetaDepot = {}): Promise<ResultatDepot> {
  const infra = obtenir();
  if (!infra) throw new StockageIndisponible();
  const t = TYPES_ACCEPTES[typeMime];
  if (!t) throw new TypeNonAutorise(typeMime);
  if (contenu.byteLength > infra.config.tailleMaxOctets) throw new TailleDepassee(contenu.byteLength, infra.config.tailleMaxOctets);

  const cle = construireCle(meta.internauteId ?? null, t.categorie, t.ext);
  await infra.client.send(
    new PutObjectCommand({ Bucket: infra.config.bucket, Key: cle, Body: contenu, ContentType: typeMime }),
  );
  return { cle, bucket: infra.config.bucket, taille: contenu.byteLength, type: typeMime };
}

/**
 * Renvoie une URL SIGNÉE temporaire (GET) vers l'objet. Durée = `dureeS` si fournie et > 0, sinon la valeur d'env
 * `S3_URL_EXPIRATION_S`. Le bucket restant PRIVÉ, c'est le SEUL moyen de lecture — l'URL est refusée passé le délai.
 */
export async function urlSignee(cle: string, dureeS?: number): Promise<string> {
  const infra = obtenir();
  if (!infra) throw new StockageIndisponible();
  const expiresIn = dureeS && dureeS > 0 ? dureeS : infra.config.dureeUrlSigneeS;
  return getSignedUrl(infra.client, new GetObjectCommand({ Bucket: infra.config.bucket, Key: cle }), { expiresIn });
}

/** Supprime UN objet par sa clé (idempotent côté S3). Nécessaire à l'effacement RGPD unitaire. */
export async function supprimer(cle: string): Promise<void> {
  const infra = obtenir();
  if (!infra) throw new StockageIndisponible();
  await infra.client.send(new DeleteObjectCommand({ Bucket: infra.config.bucket, Key: cle }));
}

/**
 * EFFACEMENT RGPD CIBLÉ : supprime TOUS les objets sous un préfixe (ex. `internautes/<uuid>/`) — bloc C d'un
 * internaute d'un seul geste. Pagine (list) et supprime par lots de 1000. Renvoie le nombre d'objets supprimés.
 * Garde-fou : refuse un préfixe vide (ne jamais balayer tout le bucket par erreur).
 */
export async function supprimerPrefixe(prefixe: string): Promise<number> {
  const infra = obtenir();
  if (!infra) throw new StockageIndisponible();
  const p = prefixe.trim();
  if (p === '') throw new ErreurStockage('Préfixe vide refusé (protection : ne jamais balayer tout le bucket).');

  let total = 0;
  let token: string | undefined;
  do {
    const liste = await infra.client.send(
      new ListObjectsV2Command({ Bucket: infra.config.bucket, Prefix: p, ContinuationToken: token }),
    );
    const cles = (liste.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
    if (cles.length > 0) {
      await infra.client.send(
        new DeleteObjectsCommand({ Bucket: infra.config.bucket, Delete: { Objects: cles, Quiet: true } }),
      );
      total += cles.length;
    }
    token = liste.IsTruncated ? liste.NextContinuationToken : undefined;
  } while (token);
  return total;
}
