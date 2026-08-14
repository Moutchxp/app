/**
 * N6-B — CLI D'AUTORISATION Google Drive (lecture seule). Obtient un refresh_token à coller dans `.env`. Le script N'ÉCRIT
 * JAMAIS `.env` lui-même : il IMPRIME la ligne prête à coller. Lancer : npm run drive:autoriser
 *
 * ⚠️ La redirection `urn:ietf:wg:oauth:2.0:oob` est SUPPRIMÉE par Google depuis 2022 → on utilise une redirection LOOPBACK :
 * un mini-serveur HTTP local sur http://127.0.0.1:<port libre> capte le paramètre `code`. Pour un client « application de
 * bureau », le loopback est accepté SANS déclaration préalable de l'URI ; si Google le refuse, le script affiche l'URI exacte
 * à déclarer côté Google au lieu de contourner. Paramètres d'autorisation : access_type=offline + prompt=consent (sinon Google
 * ne renvoie pas de refresh_token à la 2ᵉ autorisation).
 */
import '../lib/chargerEnv';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ENDPOINT_TOKEN, SCOPE_DRIVE_READONLY } from '../lib/permis/drive';

function main(): void {
  const clientId = (process.env.GOOGLE_DRIVE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '').trim();
  if (clientId === '' || clientSecret === '') {
    console.error('[drive:autoriser] GOOGLE_DRIVE_CLIENT_ID et GOOGLE_DRIVE_CLIENT_SECRET doivent être dans .env (les deux sont déjà censés y être).');
    process.exitCode = 2;
    return;
  }
  const state = randomUUID();

  const serveur = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!url.searchParams.has('code') && !url.searchParams.has('error')) { res.statusCode = 204; res.end(); return; } // favicon, etc.
    const erreur = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const etatRecu = url.searchParams.get('state');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<p>Autorisation reçue. Vous pouvez fermer cet onglet et revenir au terminal.</p>');

    void (async () => {
      try {
        if (erreur) throw new Error(`Google a refusé : ${erreur}`);
        if (etatRecu !== state) throw new Error('state invalide (anti-CSRF) — relance le script.');
        if (!code) throw new Error('aucun paramètre « code » reçu.');
        const redirectUri = `http://127.0.0.1:${port}`;
        const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
        const rep = await fetch(ENDPOINT_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const j = (await rep.json()) as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
        if (!rep.ok || j.error) throw new Error(`échange du code refusé : ${j.error ?? rep.status} ${j.error_description ?? ''}`.trim());
        if (!j.refresh_token) throw new Error('réponse sans refresh_token (ré-autorise avec un compte neuf, ou révoque l’accès de l’app puis recommence — access_type=offline + prompt=consent sont pourtant demandés).');
        console.log('\n[drive:autoriser] ✅ SUCCÈS. Colle cette ligne dans ton fichier .env (à la racine du dépôt) :\n');
        console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${j.refresh_token}\n`);
        console.log('Puis relance une relève : le versement des liens Drive sera actif.');
      } catch (e) {
        console.error('\n[drive:autoriser] ÉCHEC :', e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
      } finally {
        serveur.close();
      }
    })();
  });

  let port = 0;
  serveur.listen(0, '127.0.0.1', () => {
    const adr = serveur.address();
    port = typeof adr === 'object' && adr !== null ? adr.port : 0;
    const redirectUri = `http://127.0.0.1:${port}`;
    const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    consent.searchParams.set('client_id', clientId);
    consent.searchParams.set('redirect_uri', redirectUri);
    consent.searchParams.set('response_type', 'code');
    consent.searchParams.set('scope', SCOPE_DRIVE_READONLY);
    consent.searchParams.set('access_type', 'offline');
    consent.searchParams.set('prompt', 'consent');
    consent.searchParams.set('state', state);
    console.log('[drive:autoriser] 1) Ouvre CETTE URL dans ton navigateur (connecté au compte de la boîte pro) :\n');
    console.log('   ' + consent.toString() + '\n');
    console.log('[drive:autoriser] 2) Accepte la portée « Voir tes fichiers Google Drive » (lecture seule).');
    console.log(`[drive:autoriser]    En attente de la redirection sur ${redirectUri} …`);
    console.log(`[drive:autoriser]    Si Google refuse le loopback : déclare EXACTEMENT cette URI de redirection côté Google Cloud\n[drive:autoriser]    (Identifiants → ton client OAuth « application de bureau ») : ${redirectUri}`);
  });
}

main();
