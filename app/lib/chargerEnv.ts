/**
 * Charge `.env` depuis la RACINE DU DÉPÔT en chemin ABSOLU, indépendamment du répertoire de travail (chantier S11a).
 *
 * ⚠️ POURQUOI : `import 'dotenv/config'` résout `.env` par rapport au CWD. Un job planifié (launchd) s'exécute SANS
 * shell, sans `source .env`, sans PATH ni CWD garanti — `.env` ne serait alors pas trouvé et `db/client` jetterait
 * « DATABASE_URL manquant ». Ce module résout `.env` en absolu à partir de sa propre position et doit être importé EN
 * PREMIER par tout CLI, AVANT tout module touchant `db/client` (les imports ESM s'évaluent dans l'ordre → l'effet de
 * bord `config(...)` s'applique avant que `db/client` ne lise `process.env.DATABASE_URL`). `dotenv` n'écrase pas une
 * variable déjà définie : sûr si l'environnement fournit déjà `DATABASE_URL` (ex. hébergement).
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url)); // <racine>/app/lib
config({ path: resolve(ici, '../../.env') });        // <racine>/.env
