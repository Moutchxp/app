/**
 * Configuration du stockage objet S3-compatible (photos + PDF). INDÉPENDANTE DU FOURNISSEUR : le même code
 * parle à MinIO (dev local), OVH / Scaleway / AWS (prod) — seules les variables d'env changent, aucune valeur
 * en dur. `import 'server-only'` VOLONTAIREMENT OMIS (comme `comptes.ts`) : ce module est aussi exercé par des
 * scripts `tsx` (preuves d'aller-retour). Les secrets ne sont lus que de `process.env` (jamais des variables
 * `NEXT_PUBLIC_*`) → ne fuient pas au bundle client. À n'importer QUE depuis du code serveur.
 *
 * Variables d'env (toutes requises pour ACTIVER le stockage ; sinon `null` → stockage désactivé, aucun crash) :
 *   S3_ENDPOINT           URL du service S3 (ex. http://localhost:9000 pour MinIO, https://s3.gra.io.cloud.ovh.net pour OVH)
 *   S3_BUCKET             nom du bucket (ex. svav-dev en dev ; le nom de prod n'est qu'une autre valeur d'env)
 *   S3_ACCESS_KEY_ID      clé d'accès
 *   S3_SECRET_ACCESS_KEY  clé secrète
 * Optionnelles (défaut sûr) :
 *   S3_REGION             région (défaut 'us-east-1' — MinIO l'ignore mais le SDK l'exige)
 *   S3_FORCE_PATH_STYLE   'true' pour MinIO (path-style obligatoire) ; absent/false pour les fournisseurs à vhost
 *   S3_URL_EXPIRATION_S   durée de validité des URL signées, en secondes (défaut 900 = 15 min)
 *   S3_TAILLE_MAX_MO      borne de taille d'un objet déposé, en Mo (défaut 15 — photo smartphone ~10 Mo + marge)
 */

export interface ConfigStockage {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  dureeUrlSigneeS: number;
  tailleMaxOctets: number;
}

const DUREE_URL_DEFAUT_S = 900; // 15 min
const TAILLE_MAX_DEFAUT_MO = 15;

/** Entier > 0 depuis une chaîne d'env, sinon `null` (→ valeur par défaut). */
function entierPositif(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Lit la config depuis l'environnement. Renvoie `null` si UNE des 4 variables essentielles manque
 * (endpoint/bucket/clés) → le stockage est simplement DÉSACTIVÉ, JAMAIS une exception : l'app démarre sans S3.
 * Lecture pure (aucun effet de bord, aucun client créé ici) → appelable à volonté, y compris pour un simple test
 * « le stockage est-il configuré ? ».
 */
export function lireConfigStockage(): ConfigStockage | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  const region = process.env.S3_REGION?.trim() || 'us-east-1';
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? '').trim().toLowerCase() === 'true';
  const dureeUrlSigneeS = entierPositif(process.env.S3_URL_EXPIRATION_S) ?? DUREE_URL_DEFAUT_S;
  const tailleMaxMo = entierPositif(process.env.S3_TAILLE_MAX_MO) ?? TAILLE_MAX_DEFAUT_MO;

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    dureeUrlSigneeS,
    tailleMaxOctets: tailleMaxMo * 1024 * 1024,
  };
}
