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
 *  - <categorie> = 'photos' | 'certificats' | 'cartes' (dérivée du type MIME) → lisibilité + futur cycle de vie par catégorie.
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
import { createHash, randomUUID } from 'node:crypto';
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
  'image/png': { categorie: 'cartes', ext: 'png' }, // carte d'orientation régénérée serveur (rendu PNG, lignes/texte nets)
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
 * Dépose un objet (photo image/jpeg, certificat application/pdf, carte image/png). Renvoie sa CLÉ (à persister côté base au lot
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

/**
 * LECTURE : récupère le CONTENU d'un objet déjà déposé, par sa clé (pendant en lecture de `deposer`). Sert au
 * ré-emploi serveur (ex. embarquer la photo/carte dans le PDF) sans passer par une URL signée. Rejette si le
 * stockage n'est pas configuré ou l'objet est absent.
 */
export async function recuperer(cle: string): Promise<Buffer> {
  const infra = obtenir();
  if (!infra) throw new StockageIndisponible();
  const r = await infra.client.send(new GetObjectCommand({ Bucket: infra.config.bucket, Key: cle }));
  if (!r.Body) throw new ErreurStockage(`objet introuvable ou vide : ${cle}`);
  return Buffer.from(await r.Body.transformToByteArray());
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

// ── Chemin ENTRANT (R4) : pièces jointes des réponses des mairies (tiers non fiable) ────────────────────────────────────
/**
 * ⚠️ DISTINCT du chemin internaute ci-dessus (types/catégorie/borne/arborescence propres) — ne PAS le confondre. Les pièces
 * entrantes viennent d'un TIERS NON FIABLE : on les stocke telles quelles, on ne les ouvre pas, on ne les parse pas
 * (extraction = chantier R9). Whitelist LARGE mais explicite des types d'urbanisme ; borne pilotée par config_veille.
 */
const TYPES_ENTRANTS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
  'application/zip': 'zip',
  'image/vnd.dwg': 'dwg',
  'application/acad': 'dwg',
  'application/x-dwg': 'dwg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.text': 'odt',
};

/** Extension du chemin entrant pour un type MIME accepté, ou `null` si le type n'est pas dans la whitelist entrante. */
export function extensionEntrante(typeMime: string | null): string | null {
  return TYPES_ENTRANTS[(typeMime ?? '').trim().toLowerCase()] ?? null;
}

/**
 * Clé NON ÉNUMÉRABLE d'une pièce entrante : `demandes/<demande_id>/reponses/<reponse_id>/<uuid>.<ext>`, ou
 * `demandes/non-rattachees/<reponse_id>/<uuid>.<ext>` si la réponse n'est pas rattachée. ⚠️ Le nom d'origine du fichier
 * (fourni par un tiers, potentiellement piégé — caractères exotiques, chemin) n'entre JAMAIS dans la clé : seul un UUID
 * v4 + l'extension déduite du type MIME. Le nom d'origine reste en base (colonne nom_fichier) pour l'affichage.
 */
export function construireCleEntrante(demandeId: number | null, reponseId: number, ext: string): string {
  const nom = `${randomUUID()}.${ext}`;
  return demandeId !== null
    ? `demandes/${demandeId}/reponses/${reponseId}/${nom}`
    : `demandes/non-rattachees/${reponseId}/${nom}`;
}

/** Empreinte SHA-256 (hex) du contenu — traçabilité/intégrité de la pièce déposée. Pur. */
export function empreinteSha256(contenu: Buffer | Uint8Array): string {
  return createHash('sha256').update(contenu).digest('hex');
}

export type ResultatDepotEntrant =
  | { depose: true; cle: string; taille: number; empreinte: string }
  | { depose: false; motif: string };

export interface OptionsDepotEntrant { demandeId: number | null; reponseId: number; tailleMaxOctets: number }

/**
 * Dépose UNE pièce entrante. Ne JETTE jamais pour un cas prévisible : renvoie `{ depose:false, motif }` (type hors
 * whitelist, taille au-dessus de la borne, stockage non configuré) pour que l'appelant conserve la ligne avec son motif.
 * Un dépôt réussi renvoie la clé, la taille et l'empreinte SHA-256 (à persister). Aucun parsing du contenu.
 */
export async function deposerPieceEntrante(contenu: Buffer | Uint8Array, typeMime: string | null, opts: OptionsDepotEntrant): Promise<ResultatDepotEntrant> {
  const ext = extensionEntrante(typeMime);
  if (!ext) return { depose: false, motif: `type non autorisé pour le dépôt : « ${typeMime ?? '(inconnu)'} »` };
  if (contenu.byteLength > opts.tailleMaxOctets) {
    const mo = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return { depose: false, motif: `pièce trop volumineuse : ${mo(contenu.byteLength)} Mo (maximum ${mo(opts.tailleMaxOctets)} Mo)` };
  }
  const infra = obtenir();
  if (!infra) return { depose: false, motif: 'stockage non configuré' };
  const cle = construireCleEntrante(opts.demandeId, opts.reponseId, ext);
  const empreinte = empreinteSha256(contenu);
  await infra.client.send(
    new PutObjectCommand({ Bucket: infra.config.bucket, Key: cle, Body: contenu, ContentType: typeMime ?? 'application/octet-stream' }),
  );
  return { depose: true, cle, taille: contenu.byteLength, empreinte };
}

/**
 * A1b — clé NON ÉNUMÉRABLE d'un document AJOUTÉ À LA MAIN sur un permis : `dossiers/<dossier_id>/<uuid>.<ext>`. ⚠️ Le nom
 * d'origine du fichier (fourni par l'internaute) n'entre JAMAIS dans la clé (UUID v4 + extension du type MIME) ; il reste en
 * base (`nom_fichier`) pour l'affichage.
 */
export function construireCleDocument(dossierId: number, ext: string): string {
  return `dossiers/${dossierId}/${randomUUID()}.${ext}`;
}

/**
 * A1b — dépose UN document ajouté à la main sur un permis. RÉUTILISE la whitelist MIME du chemin entrant (`extensionEntrante`)
 * et la borne de taille pilotée par config (passée en `tailleMaxOctets`) — aucune redéfinition. Clé `dossiers/<id>/<uuid>`.
 * Ne JETTE pas pour un cas prévisible : renvoie `{ depose:false, motif }` (type hors whitelist, trop volumineux, stockage non
 * configuré) → l'appelant N'INSÈRE PAS. Un succès renvoie clé + taille + empreinte SHA-256 (à persister APRÈS le dépôt).
 */
export async function deposerDocumentDossier(contenu: Buffer | Uint8Array, typeMime: string | null, opts: { dossierId: number; tailleMaxOctets: number }): Promise<ResultatDepotEntrant> {
  const ext = extensionEntrante(typeMime);
  if (!ext) return { depose: false, motif: `type non autorisé pour le dépôt : « ${typeMime ?? '(inconnu)'} »` };
  if (contenu.byteLength > opts.tailleMaxOctets) {
    const mo = (n: number) => (n / (1024 * 1024)).toFixed(1);
    return { depose: false, motif: `document trop volumineux : ${mo(contenu.byteLength)} Mo (maximum ${mo(opts.tailleMaxOctets)} Mo)` };
  }
  const infra = obtenir();
  if (!infra) return { depose: false, motif: 'stockage non configuré' };
  const cle = construireCleDocument(opts.dossierId, ext);
  const empreinte = empreinteSha256(contenu);
  await infra.client.send(
    new PutObjectCommand({ Bucket: infra.config.bucket, Key: cle, Body: contenu, ContentType: typeMime ?? 'application/octet-stream' }),
  );
  return { depose: true, cle, taille: contenu.byteLength, empreinte };
}
