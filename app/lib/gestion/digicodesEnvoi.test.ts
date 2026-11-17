import { describe, expect, it } from 'vitest';
import { bilanEnvoi, mailLocataire, mailProprietaire, objetChangement, proprietairesRegroupes, regleDepart, type ApercuEnvoi, type LogementDest } from './digicodesEnvoi';

/** 🔴🔴 Arno (16/11/2026, « Digicodes unifiés », lot 6) — les destinataires et les mails du changement de digicode. */
const L = (o: Partial<LogementDest>): LogementDest => ({ lotId: 1, libelle: '1 rue Essai — lot 1', batiment: 'A', locataires: [], proprietaires: [],
  codes: { commun: { digicode: true, code: 'C0MM' }, batiment: { digicode: true, code: 'A111' }, communChange: true, batimentChange: false }, ...o });
const loc = (id: number, o: Record<string, unknown> = {}) => ({ id, occupationId: 100 + id, nom: `NOM${id}`, prenom: `Prénom${id}`, emails: [`p${id}@exemple.test`], depart: null, inclus: true, raison: null, ...o });
const A = (logements: LogementDest[]): ApercuEnvoi => ({ adresse: '1 rue Essai', adresseCle: '1 rue essai', appliqueLe: '2026-11-20T08:00:00.000Z', logements });
const C = { expediteur: 'gestion@exemple.test', qui: { email: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nomFamille: 'Jorel' }, signature: { html: '', texte: '' } };

describe('🔴 la règle des 7 jours (décision d’Arno)', () => {
  it('départ le 1er : changement le 7 → prévenu ; le 8 → prévenu ; le 9 → non, « parti le 01/11 » ; sans départ : prévenu', () => {
    expect(regleDepart('2026-11-07T08:00:00.000Z', '2026-11-01')).toEqual({ inclus: true, raison: null });
    expect(regleDepart('2026-11-08T08:00:00.000Z', '2026-11-01')).toEqual({ inclus: true, raison: null });
    expect(regleDepart('2026-11-09T08:00:00.000Z', '2026-11-01')).toEqual({ inclus: false, raison: 'parti le 01/11' });
    expect(regleDepart('2026-11-09T08:00:00.000Z', null)).toEqual({ inclus: true, raison: null });
    expect(regleDepart('2026-11-09T08:00:00.000Z', '2026-12-31').inclus).toBe(true); // il part après le changement
  });
});

describe('🔴 UN MAIL PAR PERSONNE, nominatif, sans autre destinataire, avec SES codes seulement', () => {
  const a = A([L({ locataires: [loc(1), loc(2)] }), L({ lotId: 2, libelle: '1 rue Essai — lot 2', batiment: 'B', codes: { commun: { digicode: true, code: 'C0MM' }, batiment: { digicode: true, code: 'B222' }, communChange: true, batimentChange: false } })]);
  it('le mail du locataire : à lui seul, à son nom, la date et l’heure ; le commun et SON bâtiment — jamais celui d’un autre bâtiment', () => {
    const m = mailLocataire(a, a.logements[0], a.logements[0].locataires[0], C)!;
    expect([m.sorte, m.a, m.cc]).toEqual(['digicode_locataire', ['p1@exemple.test'], []]);
    expect(m.objet).toBe('Changement de digicode — 1 rue Essai — à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('Bonjour Prénom1 NOM1,');
    expect(m.texte).toContain('Le digicode de votre immeuble change à partir du 20/11/2026 à 09:00.');
    expect(m.texte).toContain('- Digicode commun (1 rue Essai) : C0MM');
    expect(m.texte).toContain('- Digicode du bâtiment A : A111 (inchangé)');
    expect(m.texte).not.toContain('B222');
    expect(m.texte).not.toContain('NOM2'); // l'autre colocataire n'y figure pas
  });
  it('exclu (règle des 7 jours) ou sans e-mail : pas de mail ; le bilan le dit', () => {
    expect(mailLocataire(a, a.logements[0], loc(3, { inclus: false, raison: 'parti le 01/11' }) as never, C)).toBeNull();
    expect(mailLocataire(a, a.logements[0], loc(4, { emails: [] }) as never, C)).toBeNull();
    const b = A([L({ locataires: [loc(1), loc(3, { inclus: false, raison: 'parti le 01/11' }), loc(4, { emails: [] })] })]);
    expect(bilanEnvoi(b, false)).toEqual({ logements: 1, mailsLocataires: 1, mailsProprietaires: 0, sansEmail: ['Prénom4 NOM4'], exclus: ['Prénom3 NOM3 — parti le 01/11'] });
  });
  it('les propriétaires : UN mail par propriétaire, qui regroupe SES logements, chacun avec ses codes', () => {
    const p = { id: 9, nom: 'PROPRIO', prenom: 'Jean', emails: ['jean@exemple.test'] };
    const b = A([L({ proprietaires: [p] }), L({ lotId: 2, libelle: '1 rue Essai — lot 2', batiment: 'B', proprietaires: [p], codes: { commun: { digicode: true, code: 'C0MM' }, batiment: { digicode: true, code: 'B222' }, communChange: true, batimentChange: false } })]);
    const g = proprietairesRegroupes(b);
    expect(g.map((x) => [x.personne.id, x.logements.length])).toEqual([[9, 2]]);
    const m = mailProprietaire(b, g[0], C)!;
    expect([m.sorte, m.a]).toEqual(['digicode_proprietaire', ['jean@exemple.test']]);
    expect(m.texte).toContain('Pour vos logements :');
    expect(m.texte).toContain('1 rue Essai — lot 1 (bâtiment A) :\n- Digicode commun (1 rue Essai) : C0MM\n- Digicode du bâtiment A : A111 (inchangé)');
    expect(m.texte).toContain('1 rue Essai — lot 2 (bâtiment B) :');
    expect(bilanEnvoi(b, true).mailsProprietaires).toBe(1);
    expect(objetChangement(b)).toContain('à partir du 20/11/2026 à 09:00');
  });
});

describe('🔴🔴 Arno (17/11/2026) — un mail PAR ADRESSE : le décompte de l’écran des destinataires le dit', () => {
  it('un locataire à deux adresses compte pour DEUX mails ; un propriétaire à deux adresses aussi', () => {
    const x = { id: 1, occupationId: 11, nom: 'MARTIN', prenom: 'Léa', emails: ['lea@exemple.test', 'lea.pro@exemple.test'], depart: null, inclus: true, raison: null };
    const p = { id: 9, nom: 'PROPRIO', prenom: 'Jean', emails: ['jean@exemple.test', 'jean2@exemple.test'] };
    const a: ApercuEnvoi = { adresse: '1 rue Essai', adresseCle: '1 rue essai', appliqueLe: '2026-11-20T08:00:00.000Z', logements: [L({ locataires: [x as never], proprietaires: [p] })] };
    expect(bilanEnvoi(a, true)).toMatchObject({ mailsLocataires: 2, mailsProprietaires: 2 });
  });
});
