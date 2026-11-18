import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (18/11/2026) — « avec le réglage, chacun des cinq mails part aux quatre adresses, avec gestion@criterimmo.fr et sans
 * a.dasilva@sansvisavis.com ; sans le réglage, c'est la règle actuelle. »
 * Les cinq mails prennent leurs destinataires au MÊME endroit (`destinatairesSortie`, directement ou par `collaborateursInternes`) :
 * ici, l'alerte de bout en bout (la passe automatique, base et envoi simulés), `collaborateursInternes` lui-même, et le
 * branchement des trois autres sur ce point unique. « Sortie enregistrée » est éprouvée dans sortieLocatairesRepo.test.ts.
 */
const h = vi.hoisted(() => ({ reglage: null as string | null, comptes: [] as { identifiant: string }[], envoyes: [] as { a: string[]; objet: string }[] }));
vi.mock('../db/client', () => {
  const query = async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ');
    if (s.startsWith('SELECT collaborateurs_prevenus AS v FROM gestion_config')) return { rows: [{ v: h.reglage }], rowCount: 1 };
    if (s.includes('FROM admin_utilisateur WHERE actif')) return { rows: h.comptes, rowCount: h.comptes.length };
    if (s.includes('alerte_envoyee_le IS NOT NULL) AS deja')) return { rows: [{ deja: true }], rowCount: 1 };
    if (s.startsWith('UPDATE gestion_location_previsite SET alerte_envoyee_le = now()')) return { rows: [{ id: '9' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { query, withTransaction: async (fn: (q: typeof query) => Promise<unknown>) => fn(query) };
});
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true, oublierSchemaLocation: () => {} }));
vi.mock('./mailsPreavisSortieRepo', () => ({
  mailsAvisDisponibles: async () => true,
  envoyerSerie: async (mails: { a: string[]; objet: string }[]) => { h.envoyes.push(...mails); return mails.map((m) => ({ ...m, envoye: true })); },
}));
vi.mock('./previsiteBase', async (orig) => ({
  ...(await orig<typeof import('./previsiteBase')>()),
  previsiteDisponible: async () => true,
  aujourdhui: async () => '2026-11-18',
  lireGroupe: async () => ({ ok: true, g: { cle: 'k', recuLe: '2026-11-01', dateMax: '2026-12-01', ids: [11] } }),
  suiviOuvert: async () => null,
  assurerSuivi: async () => ({ id: '9' }),
  contexte: async () => ({ adresse: '52 Avenue de L’Arche, 92400 Courbevoie', lotId: 7, locataires: [], expediteur: 'gestion@criterimmo.fr', signature: {}, brute: '' }),
}));
vi.mock('./previsite', async (orig) => ({
  ...(await orig<typeof import('./previsite')>()),
  enAlerte: () => true,
  mailPrevisite: (o: { a: string[]; objet: string; sorte: string }) => ({ sorte: o.sorte, a: [...o.a], objet: o.objet }),
  paragraphesAlertePrevisite: () => [],
}));

import { passeAlertesPrevisite } from './previsiteAuto';
import { collaborateursInternes } from './previsiteBase';

const QUATRE = ['a.jorel@sansvisavis.com', 'jb.pons@sansvisavis.com', 'c.jullien@sansvisavis.com', 'gestion@criterimmo.fr'];
const COMPTES = [{ identifiant: 'a.jorel@sansvisavis.com' }, { identifiant: 'jb.pons@sansvisavis.com' }, { identifiant: 'c.jullien@sansvisavis.com' }, { identifiant: 'a.dasilva@sansvisavis.com' }];
const LIGNE = { occupationIds: [11] } as never;

beforeEach(() => { h.reglage = null; h.comptes = COMPTES; h.envoyes = []; });

describe('🔴 l’alerte « aucune pré-visite fixée » (la passe automatique)', () => {
  it('AVEC le réglage : part aux quatre adresses, gestion@criterimmo.fr comprise, sans a.dasilva', async () => {
    h.reglage = QUATRE.join(', ');
    const b = await passeAlertesPrevisite([LIGNE]);
    expect(b.alertes).toBe(1);
    expect(h.envoyes).toHaveLength(1);
    expect(h.envoyes[0].objet).toBe('Alerte préavis — aucune pré-visite fixée — 52 Avenue de L’Arche, 92400 Courbevoie');
    expect(h.envoyes[0].a).toEqual(QUATRE);
    expect(h.envoyes[0].a).not.toContain('a.dasilva@sansvisavis.com');
  });
  it('SANS le réglage : la règle actuelle (tous les comptes actifs Gestion / Location), a.dasilva comprise', async () => {
    await passeAlertesPrevisite([LIGNE]);
    expect(h.envoyes[0].a).toEqual(COMPTES.map((c) => c.identifiant));
  });
});

describe('🔴 collaborateursInternes — la source des copies internes de la pré-visite', () => {
  it('avec le réglage : les quatre adresses ; vide ou invalide : les comptes actifs', async () => {
    h.reglage = QUATRE.join(', ');
    expect(await collaborateursInternes()).toEqual(QUATRE);
    h.reglage = '';
    expect(await collaborateursInternes()).toEqual(COMPTES.map((c) => c.identifiant));
    h.reglage = 'gestion@criterimmo.fr, gestion@criterimmo.fr';
    expect(await collaborateursInternes()).toEqual(COMPTES.map((c) => c.identifiant));
  });
});

describe('🔴 les autres mails internes prennent leurs destinataires au même point unique', () => {
  const sans = (f: string) => readFileSync(f, 'utf8').replace(/\s+/g, ' ');
  it('compte rendu et refus de pré-visite : `collaborateursInternes()` en destinataires de la copie interne', () => {
    const src = sans('app/lib/location/previsiteRepo.ts');
    const cr = src.slice(src.indexOf('const internes = await collaborateursInternes(); /*'), src.indexOf('export async function destinatairesCompteRendu'));
    expect(cr).toContain("mailPrevisite({ sorte: 'previsite_compte_rendu', de: c.expediteur, a: internes");
    const refus = src.slice(src.indexOf('async function mailRefus'));
    expect(refus).toContain('const internes = await collaborateursInternes();');
    expect(refus).toContain("copieInterneLocataires({ sorte: 'previsite_refus', de: c.expediteur, a: internes");
  });
  it('le parcours préavis / sortie : `destinatairesSortie` pour le mail interne « Sortie de locataire »', () => {
    const src = sans('app/lib/location/mailsPreavisSortieRepo.ts');
    expect(src).toContain('const internes = await destinatairesSortie(qui.email);');
    expect(src).toContain("sorte: 'sortie_interne', objet: objetMailSortie({ adresse: bail.adresse, lotId: bail.lotId }), a: internes");
    expect(sans('app/lib/location/previsiteBase.ts')).toContain('export const collaborateursInternes = (): Promise<string[]> => destinatairesSortie(null);');
  });
});
