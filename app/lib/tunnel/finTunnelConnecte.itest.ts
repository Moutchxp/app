import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { query, closePool } from '../db/client';
import { poserMotDePasse } from '../internaute/authCredential';
import { lireReponseCoordonnees } from '../internaute/coordonneesConnues';
import { emissionDirecteConnecte, lireIssueIngestion } from './finTunnelConnecte';

/**
 * ══ LOT TUNNEL-CONNECTE — DE BOUT EN BOUT, AVEC UNE VRAIE SESSION (décisions d'Arno du 17/10/2026) ══════════════════════
 *
 * Contre un VRAI serveur Next (`E2E_BASE_URL`) en MODE RECETTE (aucun mail réel : la boîte de test `E2E_BOITE` reçoit le
 * message), branché sur une base JETABLE (`DATABASE_URL` = svav_jetable…, copie de la base qui porte les données du moteur).
 *   ① compte réel (mot de passe argon2id posé par le module de prod), connexion par la route réelle → cookie de session ;
 *   ② la page lit le compte (connecté) ; ③ l'ingestion avec la session rend de quoi émettre DIRECTEMENT (ni écran A ni B),
 *      la case F2 cochée dans le formulaire est ENREGISTRÉE sur le compte, le projet est rattaché au compte ;
 *   ④ l'émission produit le certificat, et le mail intercepté part à l'e-mail du compte avec le PDF ;
 *   ⑤ non connecté : dossier neuf → parcours d'avant (écrans A et B).
 * 🔒 REFUSE de tourner ailleurs que sur une base `svav_jetable…` (jamais la base principale, jamais svav_recette).
 */
const BASE = process.env.E2E_BASE_URL ?? '';
const BOITE = process.env.E2E_BOITE ?? '';
const baseJetable = (() => { try { return new URL(process.env.DATABASE_URL ?? '').pathname.startsWith('/svav_jetable'); } catch { return false; } })();
const pret = BASE !== '' && BOITE !== '' && baseJetable;

const SUFFIXE = Date.now().toString(36);
const EMAIL = `tunnel.connecte.${SUFFIXE}@exemple.test`;
const EMAIL_VISITEUR = `tunnel.visiteur.${SUFFIXE}@exemple.test`;
const MDP = 'Essai-tunnel-connecte-2026';

/* Un point déjà certifié SANS_VIS_A_VIS dans la base copiée (projet 491) : le moteur rejoue le même résultat. */
const projet = {
  versionTunnel: 1,
  payload: { typeBien: 'Appartement', surface: '60', nbPieces: 3, epoque: '1970-1990', terrasse: false, balcon: true, jardin: false, adresseResidence: null },
  verdict: 'SANS_VIS_A_VIS', score: 55.65777969318191, etage: 2, dernierEtage: false, residencePrincipale: true,
  communeInsee: '92004', lat: 48.90699661314679, lon: 2.269452638779335, adresseSaisie: 'essai tunnel connecté',
  adresseNormalisee: 'essai tunnel connecté', azimutDeg: 351.83333333333337, hauteurSousPlafondM: 2.7,
  hauteurVisionM: 2 * (2.7 + 0.3) + 1.65, modeOrigine: 'semi_auto',
};
const corps = (email: string, consentements: { finalite: string; version: number }[]) => ({
  identite: { prenom: 'Essai', nom: 'Tunnel', email, telephone: '+33612345678' },
  consentements,
  projet,
});

let cookie = '';
let internauteId = '';
const versionF2 = async (): Promise<number> => {
  const { rows } = await query<{ version: number }>(
    `SELECT max(version)::int AS version FROM internaute_consentement_texte WHERE finalite = 'email_marketing'`);
  return rows[0]?.version ?? 1;
};
const json = (methode: string, chemin: string, b?: unknown, avecCookie = true) => fetch(`${BASE}${chemin}`, {
  method: methode,
  headers: { 'Content-Type': 'application/json', ...(avecCookie && cookie ? { Cookie: cookie } : {}) },
  ...(b === undefined ? {} : { body: JSON.stringify(b) }),
});
const attendre = async <T>(f: () => Promise<T | null>, ms = 120_000): Promise<T> => {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v !== null) return v;
    if (Date.now() > fin) throw new Error('délai dépassé');
    await new Promise((r) => setTimeout(r, 1000));
  }
};

describe.skipIf(!pret)('LOT TUNNEL-CONNECTE — émission de bout en bout, internaute connecté', () => {
  beforeAll(async () => {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO internaute (prenom, nom, email, telephone, source_collecte, parcours)
       VALUES ('Essai', 'Tunnel', $1, '+33612345678', 'essai_tunnel_connecte', 'complet') RETURNING id`, [EMAIL]);
    internauteId = rows[0].id;
    await poserMotDePasse(internauteId, MDP);
  });
  afterAll(async () => { await closePool?.(); });

  it('① connexion par la route réelle → cookie de session', async () => {
    const r = await json('POST', '/api/internaute/auth/login', { email: EMAIL, motDePasse: MDP }, false);
    expect(r.status).toBe(200);
    const pose = r.headers.get('set-cookie') ?? '';
    cookie = pose.split(';')[0];
    expect(cookie).toMatch(/=/);
  });

  it('② la page lit le compte : connecté, coordonnées du compte', async () => {
    const r = await json('GET', '/api/internaute/coordonnees');
    const c = lireReponseCoordonnees(await r.json());
    expect(c).not.toBeNull();
    expect(c?.email).toBe(EMAIL);
  });

  let emission: { jetonEmission: string; projetId: number } | null = null;
  it('③ ingestion avec la session : émission DIRECTE (ni écran A ni B), F2 enregistrée, projet rattaché au compte', async () => {
    const r = await json('POST', '/api/internaute', corps(EMAIL, [{ finalite: 'email_marketing', version: await versionF2() }]));
    expect(r.status).toBe(200);
    const issue = lireIssueIngestion(await r.json());
    expect(issue.jetonRectification).toBeNull();
    emission = emissionDirecteConnecte({ connecte: true, ingestion: issue });
    expect(emission).not.toBeNull();
    const { rows: p } = await query<{ internaute_id: string }>('SELECT internaute_id FROM internaute_projet WHERE id = $1', [emission!.projetId]);
    expect(p[0].internaute_id).toBe(internauteId);
    const { rows: f2 } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM internaute_consentement WHERE internaute_id = $1 AND finalite = 'email_marketing'`, [internauteId]);
    expect(f2[0].n).toBe(1);
  });

  it('④ émission : certificat émis, mail intercepté vers l’e-mail du compte, avec le PDF', async () => {
    const r = await json('POST', '/api/certificat', { jeton: emission!.jetonEmission, projetId: emission!.projetId }, false);
    const d = (await r.json()) as { ok?: boolean; numero?: string };
    expect(r.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(d.numero).toMatch(/^SAVV-\d{4}-\d{6}$/);
    const mail = await attendre(async () => {
      let fichiers: string[] = [];
      try { fichiers = readdirSync(BOITE).filter((f) => f.endsWith('.json')); } catch { return null; }
      for (const f of fichiers) {
        const e = JSON.parse(readFileSync(path.join(BOITE, f), 'utf8')) as { canal: string; a?: string; objet?: string; pieces?: string[] };
        if (e.canal === 'smtp' && e.a === EMAIL) return e;
      }
      return null;
    });
    expect(mail.objet ?? '').toContain(d.numero!);
    expect((mail.pieces ?? []).some((p) => /\.pdf$/i.test(p))).toBe(true);
    const { rows: a } = await query<{ statut: string }>(
      `SELECT ca.statut FROM certificat_acheminement ca JOIN certificat c ON c.id = ca.certificat_id WHERE c.projet_id = $1`,
      [emission!.projetId]);
    expect(a[0]?.statut).toBe('envoye');
  }, 180_000);

  it('⑤ non connecté (dossier neuf) : parcours d’avant, écrans A et B', async () => {
    const r = await json('POST', '/api/internaute', corps(EMAIL_VISITEUR, []), false);
    expect(r.status).toBe(200);
    const issue = lireIssueIngestion(await r.json());
    expect(issue.jetonRectification).not.toBeNull();
    expect(emissionDirecteConnecte({ connecte: false, ingestion: issue })).toBeNull();
  });
});
