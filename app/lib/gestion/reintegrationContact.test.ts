import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_PERIODE_CONTACT, ancienDuMemeNom, dateCivile, enPosteLe, motProposeReintegration, periodesEnPoste, reintegrerAvecSaisie,
} from './reintegrationContact';
import { reconnaitreSyndical, syndicauxDepuisJson, syndicauxDesAdresses, type PersonneSyndicale } from './partiesSyndic';
import { tonDeLExpediteur } from './historiqueBien';
import { contactVide, coordonneeVide, versFormulaire, validerSyndic, type AncienContact, type FicheSyndic } from './syndics';

/**
 * ══ 🔴🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — « RÉINTÉGRER » PLUTÔT QUE RECRÉER, ET LES PÉRIODES ═══
 * 🔒 Données de banc ; la base est simulée pour l'épreuve de la porte d'écriture.
 */
const appels: Array<{ sql: string; params: unknown[] }> = [];
let reponses: Array<(sql: string) => { rows: unknown[] } | undefined> = [];
const repondre = (sql: string): { rows: unknown[] } => {
  for (const r of reponses) { const x = r(sql); if (x) return x; }
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); }),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) =>
    fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); })),
}));
beforeEach(() => { appels.length = 0; reponses = []; });

const DEPART = '2026-10-10 23:36:10.199902+02';
const RETOUR = '2026-10-10 23:57:08.858239+02';
const ANCIEN: AncienContact = { id: 3, titre: 'Responsable de copropriété', prenom: 'Augustin', nom: 'JOREL', civilite: 'M.', partiLe: DEPART,
  coordonnees: [{ sorte: 'email', libelle: null, valeur: 'arnaud.jorel@gmail.com' }, { sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }] };

describe('🔴🔴 PARTIE 2 — le même nom chez le même cabinet, « ne travaille plus ici » : proposé AVANT la création', () => {
  it('sans casse ni accents, prénom + nom ; un ancien écarté (« Non, c’est une autre personne ») ne revient pas', () => {
    expect(ancienDuMemeNom([ANCIEN], { prenom: 'augustin', nom: 'Jorél' })?.id).toBe(3);
    expect(ancienDuMemeNom([ANCIEN], { prenom: 'Augustin', nom: 'JOREL' }, [3])).toBeNull();
    expect(ancienDuMemeNom([ANCIEN], { prenom: 'Arnaud', nom: 'JOREL' })).toBeNull();
    expect(ancienDuMemeNom([ANCIEN], { prenom: '', nom: '' })).toBeNull();
  });
  it('« M. Augustin JOREL a travaillé ici jusqu’au 10/10/2026 — Réintégrer cette personne ? »', () => {
    expect(motProposeReintegration(ANCIEN)).toBe('M. Augustin JOREL a travaillé ici jusqu’au 10/10/2026 — Réintégrer cette personne ?');
    expect(dateCivile('2026-10-10T22:30:00Z')).toBe('11/10/2026');
  });
  it('« Réintégrer » : la fiche EXISTANTE (même id) revient, les coordonnées saisies proposées d’abord, sans doublon, à l’immeuble du bien', () => {
    const base = { ...versFormulaire({ id: 2, nom: 'TEST ARNAUD', adresse: null, codePostal: null, ville: null, telephone: null, telephone2: null,
      email: null, note: null, creeLe: '', creeParLibelle: '', majLe: null, majParLibelle: null, contacts: [], coproprietes: [], historique: [],
      anciens: [ANCIEN] } as unknown as FicheSyndic, 176) };
    const saisie = { ...contactVide(), prenom: 'Augustin', nom: 'Jorel', civilite: null,
      coordonnees: [{ ...coordonneeVide('email'), valeur: 'arnaud@travelnkeys.com' }, { ...coordonneeVide('telephone'), valeur: '06 13 86 18 77' }] };
    const g = reintegrerAvecSaisie(base, 3, saisie, '25 rue edith cavell');
    expect(g.anciens).toEqual([]);
    expect(g.contacts).toHaveLength(1);
    const c = g.contacts[0];
    expect([c.id, c.reintegre, c.titreChoix, c.civilite, c.immeubles]).toEqual([3, true, 'Responsable de copropriété', 'M.', ['25 rue edith cavell']]);
    expect(c.coordonnees.map((k) => [k.sorte, k.valeur])).toEqual([
      ['email', 'arnaud@travelnkeys.com'], ['telephone', '06 13 86 18 77'], ['email', 'arnaud.jorel@gmail.com']]);
    /* La saisie part au serveur comme une RÉINTÉGRATION de la fiche #3, jamais comme un nouveau contact. */
    const v = validerSyndic({ nom: 'TEST ARNAUD', adresse: '1 rue _BANC', codePostal: '75001', ville: 'Paris',
      contacts: [{ id: 3, prenom: c.prenom, nom: c.nom, reintegre: true, coordonnees: [] }] });
    expect(v.ok && v.syndic.contacts[0]).toMatchObject({ id: 3, reintegre: true });
  });
});

describe('🔴🔴 LES PÉRIODES EN POSTE — période 1 jusqu’au départ, période 2 depuis le retour', () => {
  const per = periodesEnPoste([{ depart: DEPART, retour: RETOUR }], null);
  it('deux périodes ; reconnue pendant chacune, pas entre les deux ; aujourd’hui : en poste', () => {
    expect(per).toEqual([{ du: null, au: DEPART }, { du: RETOUR, au: null }]);
    expect(enPosteLe(per, '2026-10-01T10:00:00Z')).toBe(true);
    expect(enPosteLe(per, '2026-10-10T21:45:00Z')).toBe(false); // 23:45 à Paris : entre le départ et le retour
    expect(enPosteLe(per, '2026-10-11T10:00:00Z')).toBe(true);
    expect(enPosteLe(per, null)).toBe(true);
    expect(enPosteLe(periodesEnPoste([], DEPART), null)).toBe(false);
  });
  it('la reconnaissance des mails : chaque période avec SES coordonnées, rien entre les deux', () => {
    const p: PersonneSyndicale[] = [
      { sorte: 'contact_syndic', role: 'Syndic — Responsable de copropriété', nom: 'M. Augustin JOREL', emails: ['arnaud.jorel@gmail.com'], telephones: ['0613861877'], partiLe: null, periodes: [per[0]] },
      { sorte: 'contact_syndic', role: 'Syndic — Responsable de copropriété', nom: 'M. Augustin JOREL', emails: ['arnaud@travelnkeys.com'], telephones: [], partiLe: null, periodes: [per[1]] },
    ];
    expect(reconnaitreSyndical(p, { email: 'arnaud.jorel@gmail.com' }, '2026-10-01T10:00:00Z')?.nom).toBe('M. Augustin JOREL');
    expect(reconnaitreSyndical(p, { email: 'arnaud.jorel@gmail.com' }, '2026-10-11T10:00:00Z')).toBeNull(); // ancien e-mail, après le départ
    expect(reconnaitreSyndical(p, { email: 'arnaud@travelnkeys.com' }, '2026-10-10T21:45:00Z')).toBeNull(); // entre les deux
    expect(reconnaitreSyndical(p, { email: 'arnaud@travelnkeys.com' }, '2026-10-11T10:00:00Z')?.nom).toBe('M. Augustin JOREL');
    expect(reconnaitreSyndical(p, { email: 'arnaud@travelnkeys.com' }, null)?.nom).toBe('M. Augustin JOREL');
    /* Le liseré d'un mail suit la période. */
    const s = syndicauxDepuisJson(syndicauxDesAdresses(p, [{ adresse: 'arnaud@travelnkeys.com', premierMail: '2026-10-11T10:00:00Z' }]));
    expect(tonDeLExpediteur({ sens: 'recu', de: 'arnaud@travelnkeys.com', recuLe: '2026-10-11T10:00:00Z' }, new Map(), s)).toBe('rose');
    expect(tonDeLExpediteur({ sens: 'recu', de: 'arnaud@travelnkeys.com', recuLe: '2026-10-10T21:45:00Z' }, new Map(), s)).toBe('gris');
  });
});

describe('🔒 la porte d’écriture : la période terminée est GARDÉE au journal avant d’effacer le départ', () => {
  it('« Réintégrer » : une ligne de journal (départ → retour), puis la remise en poste', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE') ? { rows: [{ id: '2' }] } : undefined),
      (sql) => (sql.includes('parti_le IS NOT NULL AS parti FROM gestion_syndic_contact') ? { rows: [{ id: '3', parti: true, parti_le: DEPART }] } : undefined),
    ];
    const v = validerSyndic({ nom: 'Cab', adresse: '1 rue _BANC', codePostal: '75001', ville: 'Paris', confirmeDoublons: true,
      contacts: [{ id: 3, prenom: 'Augustin', nom: 'JOREL', reintegre: true, coordonnees: [{ sorte: 'email', valeur: 'arnaud@travelnkeys.com' }] }] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(2, v.syndic, { id: 7, libelle: 'arno' });
    const i = appels.findIndex((a) => a.sql.includes(`'${ACTION_PERIODE_CONTACT}'`));
    const j = appels.findIndex((a) => a.sql.includes('SET parti_le = NULL'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(j);
    expect(appels[i].sql.replace(/\s+/g, ' ')).toContain("VALUES ('annuaire', $1, 'syndic_contact_periode', $2, now()::text, $3, $4, $5)");
    expect(appels[i].params.slice(0, 2)).toEqual([3, DEPART]);
  });
});
