/**
 * CLI `gestion:drive:verifier` — LOT 5-PJ-C2 : LA DÉLÉGATION EST-ELLE EN PLACE ?
 *
 * 🔴 STRICTEMENT EN LECTURE. Elle demande un jeton au nom d'une adresse, puis pose UNE question à Drive (« qui
 * suis-je ? ») et, si on le lui demande, liste les Drive partagés — NOMS SEULEMENT. Aucun fichier n'est créé, lu,
 * déplacé ni supprimé. C'est ce qui permet de la relancer autant de fois qu'on veut pendant la configuration.
 *
 * 🔒 La clé du compte de service n'est jamais affichée. Seuls sortent l'adresse du compte de service et son ID
 * client — qui sont précisément ce qu'on colle dans la console d'administration, et qui ne sont pas des secrets.
 *
 * Usage :
 *   npm run gestion:drive:verifier -- a.jorel@sansvisavis.com
 *   npm run gestion:drive:verifier -- a.jorel@sansvisavis.com --drives
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { lireCleService, SCOPE_DRIVE, VARIABLE_CLE_FICHIER, VARIABLE_CLE_JSON } from '../lib/gestion/compteService';

const P = '[gestion:drive:verifier]';

async function main(): Promise<void> {
  const subject = process.argv.find((a) => a.includes('@'));
  const avecDrives = process.argv.includes('--drives');

  console.log('');
  const cle = lireCleService();
  if (cle === null) {
    console.error(`${P} ❌ Aucune clé de compte de service.`);
    console.error(`${P}    Renseigne ${VARIABLE_CLE_FICHIER} (chemin du fichier JSON) — ou ${VARIABLE_CLE_JSON} — dans .env`);
    process.exitCode = 2;
    return;
  }
  console.log(`${P} ① Compte de service : ${cle.clientEmail}`);
  console.log(`${P}    ID client à déclarer dans la console : ${cle.clientId || '(absent du fichier JSON)'}`);
  console.log(`${P}    Scope demandé, et le seul : ${SCOPE_DRIVE}`);

  if (subject === undefined) {
    console.log('');
    console.log(`${P} Donne une adresse à essayer : npm run gestion:drive:verifier -- prenom.nom@sansvisavis.com`);
    return;
  }

  const { jetonPourSubject, oublierJetons } = await import('../lib/gestion/driveDelegue');
  oublierJetons(); // on veut la VRAIE réponse de Google, pas un jeton mémorisé d'il y a dix minutes
  const jeton = await jetonPourSubject(subject, { fetch });
  if (!jeton.ok) {
    console.error(`${P} ❌ ${jeton.motif}`);
    if (jeton.cause === 'refus') {
      console.error(`${P}    Si c'est « pas encore configuré » : admin.google.com → Sécurité → Contrôle des accès et`);
      console.error(`${P}    des données → Commandes des API → Délégation au niveau du domaine → ajouter l'ID client`);
      console.error(`${P}    ci-dessus avec le SEUL scope ${SCOPE_DRIVE}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`${P} ② Jeton obtenu AU NOM DE ${subject} ✅`);

  const about = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', {
    headers: { Authorization: `Bearer ${jeton.jeton}` },
  });
  const j = (await about.json().catch(() => ({}))) as { user?: { emailAddress?: string; displayName?: string } };
  const vu = j.user?.emailAddress ?? '(inconnu)';
  const bon = vu.toLowerCase() === subject.toLowerCase();
  console.log(`${P} ③ Drive répond : ${vu}${j.user?.displayName ? ` (${j.user.displayName})` : ''} ${bon ? '✅' : '❌ ce n’est pas l’adresse demandée'}`);

  if (avecDrives) {
    const d = await fetch('https://www.googleapis.com/drive/v3/drives?pageSize=100&fields=drives(name)', {
      headers: { Authorization: `Bearer ${jeton.jeton}` },
    });
    const dj = (await d.json().catch(() => ({}))) as { drives?: { name?: string }[] };
    console.log(`${P} ④ Drive partagés visibles par ${subject} (noms seulement) :`);
    for (const x of dj.drives ?? []) console.log(`${P}    · ${x.name}`);
    if ((dj.drives ?? []).length === 0) console.log(`${P}    (aucun)`);
  }

  console.log('');
  console.log(`${P} ✅ Vérification terminée. Aucune écriture, aucun fichier touché.`);
}

const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error(`${P} échec`, e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
