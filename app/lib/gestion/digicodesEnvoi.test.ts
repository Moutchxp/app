import { describe, expect, it } from 'vitest';
import { bilanEnvoi, bonjour, codesEnLigne, mailGestion, mailLocataire, resumeChangements, mailProprietaire, objetChangement, proprietairesRegroupes, regleDepart, type ApercuEnvoi, type LogementDest } from './digicodesEnvoi';

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
    expect(m.objet).toBe('Changement des digicodes de votre immeuble — 1 rue Essai — à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('Bonjour Prénom1 NOM1,');
    // (Arno, 17/11/2026) l'adresse (en gras), la date commune, puis un code par ligne, l'inchangé en dernier
    expect(m.texte).toContain('1 rue Essai\n\nÀ partir du 20/11/2026 à 09:00\n\nDigicode de la copropriété : C0MM\nDigicode du bâtiment A : A111 (inchangé)');
    expect(m.html).toContain('<strong>1 rue Essai</strong>');
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
    expect(m.texte).toContain('1 rue Essai\n\nÀ partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('1 rue Essai — lot 1 (bâtiment A) :\nDigicode de la copropriété : C0MM\nDigicode du bâtiment A : A111 (inchangé)');
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

/**
 * 🔴🔴 Arno (17/11/2026) — « PLUSIEURS CODES DANS UN SEUL MAIL : […] pour CHACUN son nouveau code, sa date d'activation et une heure facultative (sans heure :
 * début de journée, et le mail n'affiche que la date). […] Avec le choix B, chaque locataire reçoit UN SEUL mail, à une seule adresse, qui regroupe tous les
 * nouveaux codes qui le concernent (copropriété + son bâtiment), chacun avec sa date (et son heure si elle existe), jamais les codes d'un autre bâtiment. Avec
 * le choix A, un seul mail à la Gestion, qui récapitule tous les changements. »
 */
describe('🔴 deux codes, deux dates : un seul mail par locataire, chaque code avec SA date', () => {
  // la copropriété le 20/11 à 09:00 ; le bâtiment A le 26/11, sans heure (début de journée)
  const DEUX = { communChange: true, communLe: '2026-11-20T08:00:00.000Z', communAvecHeure: true };
  const a = A([
    L({ locataires: [loc(1)], codes: { commun: { digicode: true, code: 'C2' }, batiment: { digicode: true, code: 'A2' }, ...DEUX, batimentChange: true, batimentLe: '2026-11-25T23:00:00.000Z', batimentAvecHeure: false } }),
    L({ lotId: 2, libelle: '1 rue Essai — lot 2', batiment: 'B', locataires: [loc(2)], codes: { commun: { digicode: true, code: 'C2' }, batiment: { digicode: true, code: 'B111' }, ...DEUX, batimentChange: false } })]);
  it('bâtiment A : le code copropriété ET celui de A, chacun à sa date (sans heure : la date seule)', () => {
    const m = mailLocataire(a, a.logements[0], a.logements[0].locataires[0], C)!;
    expect(m.a).toEqual(['p1@exemple.test']);
    expect(m.objet).toBe('Changement des digicodes de votre immeuble — 1 rue Essai — à partir du 20/11/2026 à 09:00');
    // plusieurs dates : pas de ligne commune, la date (et l'heure si donnée) au bout de chaque ligne
    expect(m.texte).toContain('1 rue Essai\n\nDigicode de la copropriété : C2, à partir du 20/11/2026 à 09:00\nDigicode du bâtiment A : A2, à partir du 26/11/2026');
    expect(m.texte).not.toContain('À partir du');
    expect(m.texte).not.toContain('26/11/2026 à');
    expect(m.texte).toContain('Jusqu’à ces dates, vos codes actuels restent valables. Pour la sécurité de tous les occupants, nous vous remercions de ne communiquer ces codes qu’aux personnes de confiance.');
  });
  it('bâtiment B : le seul code copropriété (une date), jamais celui de A', () => {
    const m = mailLocataire(a, a.logements[1], a.logements[1].locataires[0], C)!;
    expect(m.objet).toBe('Changement des digicodes de votre immeuble — 1 rue Essai — à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('1 rue Essai\n\nÀ partir du 20/11/2026 à 09:00\n\nDigicode de la copropriété : C2\nDigicode du bâtiment B : B111 (inchangé)');
    expect(m.texte).not.toContain('A2');
  });
  it('l’écran des destinataires : chaque code avec sa date, en tête et par logement ; « copropriété », jamais « commun »', () => {
    expect(resumeChangements(a)).toBe('nouveaux codes : copropriété à partir du 20/11/2026 à 09:00, bâtiment A à partir du 26/11/2026');
    expect(codesEnLigne(a, a.logements[0])).toBe('codes : copropriété C2 (20/11/2026 à 09:00) ; bâtiment A A2 (26/11/2026)');
    expect(codesEnLigne(a, a.logements[1])).toBe('codes : copropriété C2 (20/11/2026 à 09:00) ; bâtiment B B111');
    expect(resumeChangements(A([a.logements[1]]))).toBe('nouveau code à partir du 20/11/2026 à 09:00');
  });
  it('choix A : UN mail à la Gestion, qui récapitule tous les changements, chacun à sa date', () => {
    const m = mailGestion({ ...a, adresseGestion: 'gestion@exemple.test' }, C, { mode: 'gestion', decoches: new Set(), proprietaires: false })!;
    expect(m.a).toEqual(['gestion@exemple.test']);
    // 🔴 (Arno, 17/11/2026) CE QU'IL DISAIT : « [À prévenir] Changement des digicodes de l’immeuble — … » ; désormais l'ALERTE, dite en objet et en tête
    expect(m.objet).toBe('[ALERTE] Digicode modifié sans que les locataires aient été prévenus — 1 rue Essai');
    // l'adresse en gras, un code par ligne avec sa date, l'inchangé en dernier
    expect(m.texte).toContain('Bonjour,\n\nALERTE : digicode modifié sans que les locataires aient été prévenus.\n\n1 rue Essai');
    expect(m.texte).toContain('AUCUN mail n’a été envoyé aux locataires');
    expect(m.html).toContain('<strong>1 rue Essai</strong>');
    expect(m.texte).toContain('  Digicode de la copropriété : C2, à partir du 20/11/2026 à 09:00\n  Digicode du bâtiment A : A2, à partir du 26/11/2026');
    expect(m.texte).toContain('  Digicode de la copropriété : C2, à partir du 20/11/2026 à 09:00\n  Digicode du bâtiment B : B111 (inchangé)');
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « MAIL DE CHANGEMENT DE DIGICODE (locataires et propriétaires) : après la salutation, l'adresse de la copropriété sur sa propre
 * ligne (en gras) ; si tous les codes changent à la même date : une ligne « À partir du JJ/MM/AAAA à HH:MM » (heure seulement si elle a été donnée) […] ; un
 * code par ligne […] ; la ligne « (inchangé) » est gardée en dernier ; même présentation dans le mail récapitulatif à la Gestion. »
 */
describe('🔴 la présentation du mail', () => {
  it('seul le bâtiment change, sans heure : « À partir du 26/11/2026 » (la date seule) ; le code du bâtiment d’abord, la copropriété « (inchangé) » en dernier', () => {
    const a = A([L({ locataires: [loc(1)], codes: { commun: { digicode: true, code: 'C0MM' }, batiment: { digicode: true, code: 'A9' }, communChange: false, batimentChange: true,
      batimentLe: '2026-11-25T23:00:00.000Z', batimentAvecHeure: false } })]);
    const m = mailLocataire(a, a.logements[0], a.logements[0].locataires[0], C)!;
    expect(m.texte).toContain('1 rue Essai\n\nÀ partir du 26/11/2026\n\nDigicode du bâtiment A : A9\nDigicode de la copropriété : C0MM (inchangé)\n\nJusqu’à cette date, vos codes actuels restent valables.');
    expect(m.texte).not.toContain('26/11/2026 à');
  });
  it('l’adresse en gras est échappée dans le HTML', () => {
    const a = { ...A([L({ locataires: [loc(1)] })]), adresse: '1 rue <Essai> & Cie' };
    expect(mailLocataire(a, a.logements[0], a.logements[0].locataires[0], C)!.html).toContain('<strong>1 rue &lt;Essai&gt; &amp; Cie</strong>');
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « MAIL DE CHANGEMENT DE DIGICODE, trop sec : réécris-le pour un être humain, sur ce modèle (locataires) […] Même ton pour le mail aux
 * propriétaires […] et pour le récapitulatif à la Gestion (sobre, interne). Aucun chiffre ni téléphone écrit en dur. Version HTML et texte brut identiques sur le
 * fond. »
 */
describe('🔴 le mail, écrit pour un être humain', () => {
  const a = A([L({ locataires: [loc(1, { civilite: 'Mme', nom: 'MARTIN', prenom: 'Léa' }), loc(2, { civilite: null, nom: 'DURAND', prenom: 'Zoé' })],
    proprietaires: [{ id: 9, nom: 'PROPRIO', prenom: 'Jean', civilite: 'M.', emails: ['j@exemple.test'] }] })]);
  it('le locataire : l’objet, « Bonjour Madame MARTIN, », puis le modèle d’Arno mot pour mot, dans l’ordre', () => {
    const m = mailLocataire(a, a.logements[0], a.logements[0].locataires[0], C)!;
    expect(m.objet).toBe('Changement des digicodes de votre immeuble — 1 rue Essai — à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain(['Bonjour Madame MARTIN,',
      'Nous souhaitons vous informer que les codes d’accès de votre immeuble vont prochainement changer. Afin que vous puissiez continuer à accéder à votre logement sans difficulté, voici les nouveaux codes qui vous concernent :',
      '1 rue Essai', 'À partir du 20/11/2026 à 09:00', 'Digicode de la copropriété : C0MM\nDigicode du bâtiment A : A111 (inchangé)',
      'Jusqu’à cette date, vos codes actuels restent valables. Pour la sécurité de tous les occupants, nous vous remercions de ne communiquer ces codes qu’aux personnes de confiance.',
      'Notre service Gestion reste à votre disposition pour toute question, par simple retour de ce mail.',
      'Nous vous remercions de votre attention et vous souhaitons une très bonne journée.', 'Bien cordialement,'].join('\n\n'));
    // HTML et texte : le même fond (chaque phrase est dans les deux)
    for (const phrase of ['Bonjour Madame MARTIN,', 'voici les nouveaux codes qui vous concernent :', 'Digicode de la copropriété : C0MM', 'personnes de confiance.',
      'par simple retour de ce mail.', 'une très bonne journée.']) expect(m.html).toContain(phrase);
  });
  it('sans civilité connue : « Bonjour Zoé DURAND, » ; « M. » : Monsieur ; « M. et Mme » : Madame, Monsieur', () => {
    expect(mailLocataire(a, a.logements[0], a.logements[0].locataires[1], C)!.texte).toContain('Bonjour Zoé DURAND,');
    expect([bonjour({ nom: 'PROPRIO', prenom: 'Jean', civilite: 'M.' }), bonjour({ nom: 'DUPONT', prenom: null, civilite: 'M. et Mme' })])
      .toEqual(['Bonjour Monsieur PROPRIO,', 'Bonjour Madame, Monsieur DUPONT,']);
  });
  it('le propriétaire : le même ton, « …dans l’immeuble où se situe votre bien. Pour votre information, voici les nouveaux codes : », un bloc par logement', () => {
    const m = mailProprietaire(a, proprietairesRegroupes(a)[0], C)!;
    expect(m.objet).toBe('Changement des digicodes de l’immeuble — 1 rue Essai — à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('Bonjour Monsieur PROPRIO,\n\nNous souhaitons vous informer que les codes d’accès vont prochainement changer dans l’immeuble où se situe votre bien. Pour votre information, voici les nouveaux codes :\n\n1 rue Essai\n\nÀ partir du 20/11/2026 à 09:00\n\n1 rue Essai — lot 1 (bâtiment A) :\nDigicode de la copropriété : C0MM');
    expect(m.texte).toContain('Notre service Gestion reste à votre disposition pour toute question, par simple retour de ce mail.');
  });
  it('aucun chiffre ni téléphone écrit en dur dans le texte des mails (seuls l’adresse, la date, l’heure et les codes)', () => {
    const m = mailLocataire(a, a.logements[0], a.logements[0].locataires[0], C)!;
    const sansDonnees = m.texte.replace(/\d{2}\/\d{2}\/\d{4}( à \d{2}:\d{2})?/g, '').replace(/C0MM|A111|1 rue Essai/g, '');
    expect(sansDonnees).not.toMatch(/\d/);
  });
});
