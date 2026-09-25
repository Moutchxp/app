/**
 * CLI `gestion:purger-jetons-google` — LOT 5-PJ-C2 : RÉVOQUER PUIS EFFACER LES JETONS GOOGLE INDIVIDUELS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE COMMANDE EXISTE. Le lot 5-PJ-C proposait à chacun de relier son compte Google ; Arno a décidé le
 * 25/09 qu'on n'allait plus rien demander à personne. Les jetons déjà stockés deviennent donc des SECRETS SANS
 * USAGE — et un secret sans usage est un passif, pas une réserve.
 *
 * 🔴 L'ORDRE EST RÉVOQUER PUIS EFFACER, jamais l'inverse. Effacer d'abord jetterait la seule chose qui permet de
 * fermer la porte chez Google : le jeton resterait valable, indéfiniment, sans que personne puisse plus le retirer.
 *
 * 🔴 CE QU'ELLE NE TOUCHE PAS : les lignes de `gestion_journal` (append-only, garanti en base par un trigger) — la
 * trace de qui avait relié quoi, et quand, reste intacte. C'est elle qui compte, pas le secret.
 *
 * DÉFAUT = SIMULATION. Sans `--appliquer`, la commande DIT ce qu'elle ferait et ne révoque ni n'efface rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';

const P = '[gestion:purger-jetons-google]';
const ENDPOINT_REVOCATION = 'https://oauth2.googleapis.com/revoke';

/** Révoque un jeton chez Google. Un jeton DÉJÀ invalide rend 400 : ce n'est pas un échec, la porte est fermée. */
export async function revoquer(
  jeton: string, fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; deja?: boolean } | { ok: false; motif: string }> {
  try {
    const res = await fetchImpl(ENDPOINT_REVOCATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: jeton }),
    });
    if (res.ok) return { ok: true };
    // Google répond 400 pour un jeton déjà expiré ou déjà révoqué. Le but est atteint : on ne le compte pas en échec.
    if (res.status === 400) return { ok: true, deja: true };
    return { ok: false, motif: `Google a refusé la révocation (HTTP ${res.status}).` };
  } catch {
    return { ok: false, motif: 'Google n’a pas répondu.' };
  }
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const { lireJetonsAPurger, effacerJeton } = await import('../lib/gestion/comptesGoogleRepo');
  const { dechiffrer, masquer } = await import('../lib/gestion/coffre');

  console.log('');
  console.log(`${P} ${appliquer ? 'APPLIQUÉ (révocation puis effacement)' : 'SIMULATION (rien n’est révoqué, rien n’est effacé)'}`);

  const jetons = await lireJetonsAPurger();
  if (jetons.length === 0) {
    console.log(`${P} Aucun jeton individuel en base : il n’y a rien à révoquer ni à effacer.`);
    return;
  }
  console.log(`${P} ${jetons.length} jeton(s) à traiter.`);

  let revoques = 0;
  let effaces = 0;
  let echecs = 0;
  for (const j of jetons) {
    // 🔒 On dit la LONGUEUR du jeton, jamais sa valeur : un secret lu à l'écran finit dans un historique de terminal.
    console.log(`${P}  · ${j.email} — ${masquer(j.refreshTokenChiffre)}`);
    if (!appliquer) continue;

    let clair: string;
    try {
      clair = dechiffrer(j.refreshTokenChiffre);
    } catch (e) {
      // Clé changée : on ne peut plus révoquer. On l'efface quand même — le garder ne le rendrait pas révocable, et
      //   la personne peut retirer l'accès elle-même sur myaccount.google.com/permissions.
      console.error(`${P}    ⚠ illisible (${e instanceof Error ? e.message : String(e)}) — effacé sans révocation.`);
      console.error(`${P}      → ${j.email} peut retirer l’accès sur myaccount.google.com/permissions`);
      await effacerJeton(j.utilisateurId);
      effaces += 1;
      continue;
    }

    const r = await revoquer(clair);
    if (r.ok) {
      revoques += 1;
      console.log(`${P}    révoqué chez Google${r.deja ? ' (il ne valait déjà plus rien)' : ''}`);
    } else {
      echecs += 1;
      // 🔴 ON N'EFFACE PAS UN JETON QU'ON N'A PAS PU RÉVOQUER : il resterait valable et plus personne ne pourrait
      //    le retirer. On le laisse, et on le redira à la prochaine exécution.
      console.error(`${P}    ⚠ ${r.motif} — NON effacé, à relancer plus tard.`);
      continue;
    }
    await effacerJeton(j.utilisateurId);
    effaces += 1;
  }

  console.log('');
  console.log(`${P} ${revoques} révoqué(s) · ${effaces} effacé(s) · ${echecs} en échec.`);
  if (!appliquer) console.log(`${P} Pour exécuter réellement : npm run gestion:purger-jetons-google -- --appliquer`);
}

const lanceDirect = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (lanceDirect) {
  void main()
    .catch((e) => { console.error(`${P} échec`, e); process.exitCode = 1; })
    .finally(async () => { const { closePool } = await import('../lib/db/client'); await closePool(); });
}
