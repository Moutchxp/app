import { modeRecette } from '../../../../../lib/recette/mode';
import { obtenirTransporteur } from '../../../../../lib/email';

export const runtime = 'nodejs';

const DESTINATAIRE = 'essai-recette@example.invalid';
// Message RFC 822 d'essai (base64url), pour l'envoi Gmail simulé.
const RAW = Buffer.from(`To: ${DESTINATAIRE}\r\nSubject: Essai du verrou de recette\r\n\r\nCe message ne doit jamais partir.`)
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * POST /api/admin/recette/essai — AUTO-TEST du mode recette (lot RECETTE-MAC). N'existe QU'EN recette (sinon 404) ;
 * administrateurs seulement (proxy : chemin non déclaré). Fait passer par le VRAI chemin du serveur un mail SMTP, un
 * envoi Gmail, une création d'événement d'agenda et une création dans le Drive, et vérifie que chacun a été retenu.
 *
 * SANS RISQUE PAR CONSTRUCTION : les requêtes Google partent SANS aucun jeton (Google les refuserait de toute façon, 401) ;
 * le mail SMTP vise un serveur inexistant (127.0.0.1:9) et une adresse `.invalid`. Rien ne peut partir, verrou ou non.
 */
export async function POST(request: Request): Promise<Response> {
  if (!modeRecette()) return new Response(null, { status: 404 });
  const resultats: string[] = [];
  const essai = async (nom: string, f: () => Promise<boolean>) => {
    try { resultats.push(`${nom}:${(await f()) ? 'retenu' : 'NON_RETENU'}`); } catch { resultats.push(`${nom}:NON_RETENU`); }
  };
  await essai('smtp', async () => {
    const info = await obtenirTransporteur({ host: '127.0.0.1', port: 9, user: 'essai', pass: 'essai' })
      .sendMail({ from: 'essai-recette@example.invalid', to: DESTINATAIRE, subject: 'Essai du verrou de recette', text: 'Ce message ne doit jamais partir.' });
    return String((info as { response?: string }).response ?? '').includes('RECETTE');
  });
  await essai('gmail', async () => {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: RAW }) });
    return r.ok && String(((await r.json()) as { id?: string }).id ?? '').startsWith('recette-');
  });
  await essai('agenda', async () => {
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: 'Essai du verrou de recette' }) });
    return r.ok && String(((await r.json()) as { id?: string }).id ?? '').startsWith('recette');
  });
  await essai('drive', async () => {
    const r = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Essai du verrou de recette' }) });
    return r.status === 403 && JSON.stringify(await r.json()).includes('RECETTE');
  });
  const cible = new URL('/admin/recette', request.url);
  cible.searchParams.set('essai', resultats.join(','));
  return Response.redirect(cible, 303);
}
