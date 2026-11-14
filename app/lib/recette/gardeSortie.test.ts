import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (15/11/2026) — LA RECETTE ENVOYAIT POUR DE VRAI (13–14/11) : Next remet son `fetch` d'origine à chaque rechargement à chaud du
 * code serveur, et le verrou posé une seule fois au démarrage disparaissait. Ces épreuves prouvent les trois couches :
 *   1. la garde AU PLUS BAS NIVEAU des vraies fonctions (envoi Gmail, agenda, création Drive, SMTP), relue à chaque appel ;
 *   2. le `fetch` global qui RÉSISTE à la remise à zéro de Next ;
 *   3. l'auto-contrôle de démarrage, et l'arrêt du serveur s'il échoue.
 * Et la règle : base de recette (ou autre que la production) sans mode recette → tout envoi réel REFUSÉ et journalisé. Aucun réseau :
 * chaque « vrai » `fetch` est un faux qui compte ses appels.
 */
const { depots } = vi.hoisted(() => ({ depots: [] as Record<string, unknown>[] }));
vi.mock('./boite', async (orig) => ({ ...(await orig<typeof import('./boite')>()), deposerDansBoite: (e: Record<string, unknown>) => { depots.push(e); } }));

const { politiqueSortie, fetchSortant, nomDeBase } = await import('./gardeSortie');
const { installerVerrouRecette, retirerVerrouRecette, verrouRecettePose, autoControleRecette } = await import('./installer');
const { envoyerViaGmail } = await import('../gestion/envoiGmail');
const { creerPorteAgenda } = await import('../gestion/agendaGoogle');
const { creerDossier } = await import('../gestion/driveCreation');
const { obtenirTransporteur } = await import('../email');
const { demarrerServeurNode } = await import('./demarrageNode');
const { etatEnvoiReel, destinatairesDuMessage, envoiReelPermis } = await import('./garde');
const { CLE_MARQUE, CLE_TACHE, MARQUE_APPLICATION } = await import('../gestion/agendaTache');
/** Un événement de tâche tel que l'application le pose (marque privée + numéro de tâche). */
const evenement = (tacheId: number) => ({ summary: 'Pré-visite', start: { dateTime: '2026-11-15T10:00:00+01:00' }, end: { dateTime: '2026-11-15T10:15:00+01:00' },
  extendedProperties: { private: { [CLE_MARQUE]: MARQUE_APPLICATION, [CLE_TACHE]: String(tacheId) } } });

const RECETTE = { SVAV_GARDE_EPREUVE: '1', SVAV_RECETTE: '1', NODE_ENV: 'development', DATABASE_URL: 'postgres://u:secret@localhost/svav_recette' };
const BASE_RECETTE_SANS_MODE = { SVAV_GARDE_EPREUVE: '1', NODE_ENV: 'development', DATABASE_URL: 'postgres://u:secret@localhost/svav_recette' };
const PRODUCTION = { SVAV_GARDE_EPREUVE: '1', NODE_ENV: 'production', GESTION_URL_APPLICATION: 'https://authentification.sansvisavis.com', DATABASE_URL: 'postgres://u@localhost/sansvisavis' };

const avant = { env: { ...process.env }, fetch: globalThis.fetch };
let reseau: string[] = [];
const faux = (async (entree: RequestInfo | URL, init?: RequestInit) => {
  reseau.push(`${init?.method ?? 'GET'} ${String(entree)}`);
  return new Response(JSON.stringify({ id: 'VRAI-ID', name: 'x' }), { status: 200 });
}) as typeof fetch;
const poserEnv = (e: Record<string, string>) => { for (const k of ['SVAV_RECETTE', 'SITE_URL', 'GESTION_URL_APPLICATION', 'DATABASE_URL', 'SVAV_GARDE_EPREUVE']) delete process.env[k]; Object.assign(process.env, e); };
beforeEach(() => { reseau = []; depots.length = 0; vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { retirerVerrouRecette(); globalThis.fetch = avant.fetch; process.env = { ...avant.env }; vi.restoreAllMocks(); });

describe('politiqueSortie — la règle', () => {
  it('recette → simulé ; base de recette SANS le mode → refus ; production → libre ; tout le reste → refus ; jamais l’inverse', () => {
    expect(politiqueSortie(RECETTE)).toBe('recette');
    expect(politiqueSortie(BASE_RECETTE_SANS_MODE)).toBe('refus');
    expect(politiqueSortie({ ...BASE_RECETTE_SANS_MODE, GESTION_URL_APPLICATION: 'https://authentification.sansvisavis.com' })).toBe('refus'); // base de recette : jamais libre
    expect(politiqueSortie({ ...BASE_RECETTE_SANS_MODE, DATABASE_URL: 'postgres://localhost/svav_test_gestion' })).toBe('refus');
    expect(politiqueSortie(PRODUCTION)).toBe('production');
    expect(politiqueSortie({ SVAV_GARDE_EPREUVE: '1', NODE_ENV: 'development', DATABASE_URL: 'postgres://localhost/sansvisavis' })).toBe('refus'); // Mac en npm run dev
    expect(politiqueSortie({ VITEST: 'true' })).toBe('epreuve');
    expect(politiqueSortie({ VITEST: 'true' }, '', { demarrage: true })).toBe('refus'); // le vrai serveur n'a jamais l'exemption des épreuves
  });
  it('le nom de la base, jamais l’utilisateur ni le mot de passe', () => {
    expect(nomDeBase('postgres://arno:motdepasse@localhost:5432/svav_recette')).toBe('svav_recette');
  });
});

describe('🔴 1. la garde au plus bas niveau, dans les VRAIES fonctions — en RECETTE : rien ne part, tout est dans la boîte de test', () => {
  beforeEach(() => poserEnv(RECETTE));
  it('envoi Gmail : simulé (identifiant recette-…), déposé, le réseau jamais atteint', async () => {
    const r = await envoyerViaGmail({ accessToken: 'JETON-SECRET', rfc822: 'To: locataire@client.fr\r\nSubject: Quittance\r\n\r\nx' }, { fetch: faux });
    expect(r.ok).toBe(true);
    expect(reseau).toEqual([]);
    expect(depots).toEqual([expect.objectContaining({ canal: 'gmail_envoi', issue: 'intercepte', objet: 'Quittance' })]);
    expect(JSON.stringify(depots)).not.toMatch(/JETON-SECRET|Bearer|Authorization/);
  });
  it('agenda : création d’événement simulée (identifiant « recette… »), le réseau jamais atteint', async () => {
    const porte = creerPorteAgenda({ jeton: async () => ({ ok: true, jeton: 'JETON-SECRET' }), fetch: faux });
    const r = await porte.creer('a.jorel@sansvisavis.com', 35, evenement(35) as unknown as Parameters<typeof porte.creer>[2]);
    expect(reseau.filter((x) => !x.startsWith('GET'))).toEqual([]);
    expect(r.ok && r.id).toMatch(/^recette/);
    expect(depots.some((d) => d.canal === 'agenda')).toBe(true);
  });
  it('Drive : création refusée (403), le réseau jamais atteint, « Documents clients scannés » intouchable', async () => {
    const r = await creerDossier('JETON-SECRET', { parentId: 'p', nom: 'Essai' }, { fetch: faux });
    expect(r.ok).toBe(false);
    expect(reseau).toEqual([]);
    expect(depots).toEqual([expect.objectContaining({ canal: 'drive', issue: 'refuse' })]);
  });
  it('SMTP : dans la boîte de test', async () => {
    const info = await obtenirTransporteur({ host: '127.0.0.1', port: 9, user: 'u', pass: 'p' }).sendMail({ from: 'a@b.fr', to: 'x@client.fr', subject: 'Essai', text: 't' });
    expect(String(info.response)).toContain('RECETTE');
    expect(depots).toEqual([expect.objectContaining({ canal: 'smtp', issue: 'intercepte' })]);
  });
});

describe('🔴 (b) base de recette SANS le mode recette : tout envoi réel REFUSÉ et journalisé', () => {
  beforeEach(() => poserEnv(BASE_RECETTE_SANS_MODE));
  it('Gmail, agenda, Drive, SMTP : refusés ; le réseau jamais atteint ; le journal ne contient ni jeton ni destinataire', async () => {
    const g = await envoyerViaGmail({ accessToken: 'JETON-SECRET', rfc822: 'To: locataire@client.fr\r\nSubject: Quittance\r\n\r\nx' }, { fetch: faux });
    expect(g.ok).toBe(false);
    const porte = creerPorteAgenda({ jeton: async () => ({ ok: true, jeton: 'JETON-SECRET' }), fetch: faux });
    const a = await porte.creer('a@x.fr', 1, evenement(1) as unknown as Parameters<typeof porte.creer>[2]);
    expect(a.ok).toBe(false);
    expect((await creerDossier('JETON-SECRET', { parentId: 'p', nom: 'x' }, { fetch: faux })).ok).toBe(false);
    await expect(obtenirTransporteur({ host: '127.0.0.1', port: 9, user: 'u', pass: 'p' }).sendMail({ from: 'a@b.fr', to: 'x@client.fr', subject: 'S', text: 't' })).rejects.toThrow(/REFUSÉE/);
    expect(reseau.filter((x) => !x.startsWith('GET'))).toEqual([]);
    const journal = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join('\n');
    expect(journal).toMatch(/\[GARDE\] Écriture réelle REFUSÉE/);
    expect(journal).not.toMatch(/JETON-SECRET|Bearer|secret@|client\.fr/);
  });
  it('les lectures (GET) passent : la recette ne casse pas l’affichage', async () => {
    await fetchSortant(faux)('https://www.googleapis.com/drive/v3/files?q=x');
    expect(reseau).toEqual(['GET https://www.googleapis.com/drive/v3/files?q=x']);
  });
});

describe('production : inchangé (la garde laisse partir)', () => {
  it('Gmail et Drive atteignent le vrai service', async () => {
    poserEnv(PRODUCTION);
    expect((await envoyerViaGmail({ accessToken: 't', rfc822: 'To: a@b.fr\r\n\r\nx' }, { fetch: faux })).ok).toBe(true);
    expect((await creerDossier('t', { parentId: 'p', nom: 'x' }, { fetch: faux })).ok).toBe(true);
    expect(reseau).toHaveLength(2);
  });
});

describe('🔴 2. le `fetch` global RÉSISTE à la remise à zéro de Next (`resetFetch` au rechargement à chaud)', () => {
  it('après `globalThis.fetch = <fetch d’origine>`, un envoi Gmail reste intercepté ; les lectures passent', async () => {
    globalThis.fetch = faux;
    expect(installerVerrouRecette('recette')).toBe(true);
    globalThis.fetch = faux; // ce que fait Next à chaque modification du code serveur
    expect(verrouRecettePose()).toBe(true);
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: '{"raw":""}' });
    expect(((await r.json()) as { id: string }).id).toMatch(/^recette-/);
    await fetch('https://www.googleapis.com/calendar/v3/calendars/a/events', { method: 'POST', body: '{}' });
    expect(reseau).toEqual([]);
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/1');
    expect(reseau).toEqual(['GET https://gmail.googleapis.com/gmail/v1/users/me/messages/1']);
  });
  it('Next qui ENVELOPPE à son tour (patchFetch) : toujours intercepté', async () => {
    globalThis.fetch = faux;
    installerVerrouRecette('recette');
    const dessous = globalThis.fetch;
    globalThis.fetch = (async (e: RequestInfo | URL, i?: RequestInit) => dessous(e, i)) as typeof fetch;
    await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: '{}' });
    expect(reseau).toEqual([]);
  });
});

describe('🔴 3. l’auto-contrôle de démarrage', () => {
  it('verrou posé en recette : réussi, et rien n’est déposé ni envoyé', async () => {
    globalThis.fetch = faux;
    installerVerrouRecette('recette');
    expect(await autoControleRecette(RECETTE)).toEqual({ ok: true });
    expect(reseau).toEqual([]);
    expect(depots).toEqual([]);
  });
  it('verrou absent : échec', async () => {
    expect((await autoControleRecette(RECETTE)).ok).toBe(false);
  });
  it('auto-contrôle en échec au démarrage de la recette → le serveur S’ARRÊTE (code 1), message clair', async () => {
    const sortir = vi.fn();
    await demarrerServeurNode({ env: { SVAV_RECETTE: '1', NODE_ENV: 'development' }, nomMachine: () => 'mac', sortir, minuterie: () => false,
      autoControle: async () => ({ ok: false, motif: 'une écriture de contrôle a atteint le réseau' }) });
    expect(sortir).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('RECETTE ARRÊTÉE'));
  });
  it('démarrage réel de la recette (auto-contrôle vrai) : réussi, le serveur continue', async () => {
    globalThis.fetch = faux;
    const sortir = vi.fn();
    await demarrerServeurNode({ env: { SVAV_RECETTE: '1', NODE_ENV: 'development' }, nomMachine: () => 'mac', sortir, minuterie: () => false });
    expect(sortir).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('auto-contrôle réussi'));
    expect(reseau).toEqual([]);
  });
});

describe('🔴🔴 Arno (15/11/2026) — l’exception d’envoi réel de la recette : RECETTE_ENVOI_REEL_VERS', () => {
  const MOI = 'a.jorel@sansvisavis.com';
  const AVEC = { ...RECETTE, RECETTE_ENVOI_REEL_VERS: MOI };
  const raw = (entetes: string) => JSON.stringify({ raw: Buffer.from(`${entetes}\r\nSubject: [TEST] Essai\r\n\r\ncorps`).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') });
  const envoyer = () => fetchSortant(faux);
  const URL_ENVOI = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

  it('désactivée par défaut ; refusée si la base n’est pas svav_recette, hors mode recette, ou adresse illisible', () => {
    expect(etatEnvoiReel(RECETTE)).toEqual({ actif: false, demande: false });
    expect(etatEnvoiReel(AVEC)).toEqual({ actif: true, adresse: MOI });
    expect(etatEnvoiReel({ ...AVEC, DATABASE_URL: 'postgres://u@localhost/sansvisavis' })).toMatchObject({ actif: false, refus: 'la base n’est pas svav_recette' });
    expect(etatEnvoiReel({ ...AVEC, DATABASE_URL: 'postgres://u@localhost/svav_test_gestion' })).toMatchObject({ actif: false });
    expect(etatEnvoiReel({ ...AVEC, SVAV_RECETTE: '' })).toMatchObject({ actif: false, refus: 'le mode recette n’est pas actif' });
    expect(etatEnvoiReel({ ...AVEC, RECETTE_ENVOI_REEL_VERS: 'pas-une-adresse' })).toMatchObject({ actif: false, refus: 'adresse illisible' });
  });
  it('destinataires : À, Cc, Cci (et en-têtes repliés) ; illisible → null (le doute intercepte)', () => {
    expect(destinatairesDuMessage('To: "Arno" <A.Jorel@sansvisavis.com>\r\nCc: x@y.fr,\r\n z@w.fr\r\nBcc: b@c.fr\r\n\r\ncorps')).toEqual([MOI, 'x@y.fr', 'z@w.fr', 'b@c.fr']);
    expect(destinatairesDuMessage('To: groupe: a@b.fr;\r\n\r\nc')).toBeNull();
    expect(destinatairesDuMessage('To: sans-arobase\r\n\r\nc')).toBeNull();
    expect(envoiReelPermis([], { actif: true, adresse: MOI })).toBe(false);
  });
  it('🔴 TOUS les destinataires = l’adresse permise : le mail part pour de vrai (une trace « envoyé pour de vrai » dans la boîte)', async () => {
    poserEnv(AVEC);
    await envoyer()(URL_ENVOI, { method: 'POST', body: raw(`To: ${MOI}`) });
    expect(reseau).toEqual([`POST ${URL_ENVOI}`]);
    expect(depots).toEqual([expect.objectContaining({ canal: 'gmail_envoi', issue: 'envoye_reel', a: MOI, objet: '[TEST] Essai' })]);
  });
  it('🔴 un SEUL autre destinataire (À, Cc ou Cci) : intercepté EN ENTIER — aucun envoi partiel', async () => {
    poserEnv(AVEC);
    for (const e of [`To: ${MOI}, collegue@sansvisavis.com`, `To: ${MOI}\r\nCc: gestion@criterimmo.fr`, `To: ${MOI}\r\nBcc: client@exemple.fr`, 'To: collegue@sansvisavis.com',
      `To: ${MOI}.pirate.fr`, `To: x${MOI}`]) {
      const r = await envoyer()(URL_ENVOI, { method: 'POST', body: raw(e) });
      expect(((await r.json()) as { id: string }).id).toMatch(/^recette-/);
    }
    expect(reseau).toEqual([]);
    expect(depots.every((d) => d.issue === 'intercepte')).toBe(true);
  });
  it('🔴 l’agenda et le Drive restent TOUJOURS interceptés, même vers l’adresse permise', async () => {
    poserEnv(AVEC);
    await envoyer()('https://www.googleapis.com/calendar/v3/calendars/a.jorel%40sansvisavis.com/events', { method: 'POST', body: JSON.stringify({ attendees: [{ email: MOI }] }) });
    await envoyer()('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: '{}' });
    expect(reseau).toEqual([]);
  });
  it('base qui n’est pas svav_recette : l’exception est ignorée, tout reste intercepté', async () => {
    poserEnv({ ...AVEC, DATABASE_URL: 'postgres://u@localhost/svav_recette_copie' });
    await envoyer()(URL_ENVOI, { method: 'POST', body: raw(`To: ${MOI}`) });
    expect(reseau).toEqual([]);
  });
  it('le fetch GLOBAL (accesseur de la recette) applique la même exception', async () => {
    poserEnv(AVEC);
    globalThis.fetch = faux;
    installerVerrouRecette('recette');
    await fetch(URL_ENVOI, { method: 'POST', body: raw(`To: ${MOI}`) });
    await fetch(URL_ENVOI, { method: 'POST', body: raw(`To: ${MOI}\r\nCc: autre@sansvisavis.com`) });
    expect(reseau).toEqual([`POST ${URL_ENVOI}`]);
  });
  it('SMTP : la même règle — un autre destinataire dans l’enveloppe : intercepté', async () => {
    poserEnv(AVEC);
    const info = await obtenirTransporteur({ host: '127.0.0.1', port: 9, user: 'u', pass: 'p' }).sendMail({ from: 'a@b.fr', to: MOI, cc: 'autre@exemple.fr', subject: 'S', text: 't' });
    expect(String(info.response)).toContain('RECETTE');
    expect(depots).toEqual([expect.objectContaining({ canal: 'smtp', issue: 'intercepte' })]);
  });
});

describe('🔴 le bandeau RECETTE nomme l’exception', () => {
  it('rouge, « envois réels autorisés vers … » quand elle est active ; sinon inchangé', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(admin)/layout.tsx', 'utf8');
    expect(src).toContain('`RECETTE — envois réels autorisés vers ${reel.adresse}`');
    expect(src).toContain("background: reel.actif ? 'var(--color-svv-red)' : 'var(--color-svv-ink)'");
    expect(src).toContain("'RECETTE — aucun envoi réel'");
  });
});
