import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { lignesAncienNouveau, mailGestion, objetGestion, regleDepart, sortLocataire, verdictGestion, type ApercuEnvoi, type LogementDest } from './digicodesEnvoi';

/**
 * 🔴🔴 Arno (17/11/2026) — « GESTION TOUJOURS PRÉVENUE, pour une MODIFICATION de digicode uniquement (jamais pour une première saisie). Deux choix, l'un
 * OBLIGATOIRE, libellés : « A. Prévenir la Gestion seulement » → la Gestion […] reçoit un MAIL D'ALERTE : « Digicode modifié sans que les locataires aient été
 * prévenus », avec l'adresse et le nom de la copropriété (s'il existe), chaque code changé (ancien → nouveau), sa date (et heure) d'application, et la liste
 * des logements et locataires concernés, tous marqués « non prévenu ». « B. Prévenir la Gestion et les locataires » → les mails nominatifs partent […], puis
 * la Gestion reçoit : si TOUS les locataires concernés ont été prévenus : un MAIL D'INFORMATION « Les digicodes de <nom de la copropriété> — <adresse> sont
 * mis à jour à compter du <date[ heure]> ; tous les locataires concernés ont été prévenus par des mails individuels. », avec les codes et la liste des
 * locataires prévenus ; sinon (un locataire décoché, sans e-mail ou en échec d'envoi) : un MAIL D'ALERTE qui le dit en objet et en tête, avec, logement par
 * logement, les locataires PRÉVENUS et ceux NON PRÉVENUS (avec la raison : décoché, pas d'e-mail, échec d'envoi). Destinataires locataires : uniquement les
 * locataires en place et ceux en préavis selon la règle des 7 jours ; JAMAIS d'anciens locataires […]. Le mail à la Gestion est rangé dans l'historique de
 * la copropriété et des biens concernés. » MODULE PUR et lectures du code : rien n'est écrit ni envoyé.
 */
const loc = (id: number, o: Record<string, unknown> = {}) => ({ id, occupationId: 100 + id, nom: `_TEST GESTION DIGICODE ${id}`, prenom: `Prénom${id}`, emails: [`p${id}@exemple.test`],
  depart: null, inclus: true, raison: null, ...o });
const L = (o: Partial<LogementDest>): LogementDest => ({ lotId: 1, libelle: '7 rue _TEST Digicode — lot 1', batiment: 'A', locataires: [], proprietaires: [],
  codes: { commun: { digicode: true, code: 'TC90' }, batiment: { digicode: true, code: 'TA10' }, communChange: true, batimentChange: false, communLe: '2026-11-20T08:00:00.000Z', communAvecHeure: true }, ...o });
const A = (o: Partial<ApercuEnvoi> = {}): ApercuEnvoi => ({ adresse: '7 rue _TEST Digicode', adresseCle: '7 rue test digicode', appliqueLe: '2026-11-20T08:00:00.000Z',
  adresseGestion: 'gestion@exemple.test', copropriete: 'Résidence _TEST GESTION DIGICODE',
  changements: [{ place: 'Digicode de la copropriété', ancien: { digicode: true, code: 'T100' }, nouveau: { digicode: true, code: 'TC90' }, le: '2026-11-20T08:00:00.000Z', avecHeure: true }],
  logements: [L({ lotId: 1, locataires: [loc(1), loc(2)] }), L({ lotId: 2, libelle: '7 rue _TEST Digicode — lot 2', locataires: [loc(3, { emails: [] }), loc(4, { inclus: false, raison: 'parti le 01/11', depart: '2026-11-01' })] })], ...o });
const C = { expediteur: 'gestion@exemple.test', qui: { email: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nomFamille: 'Jorel' }, signature: { html: '', texte: '' } };
const tousPartis = (a: ApercuEnvoi) => new Map(a.logements.flatMap((l) => l.locataires.map((x) => [x.occupationId, true] as [number, boolean])));

describe('🔴 A. « Prévenir la Gestion seulement » : le mail d’ALERTE', () => {
  it('l’objet et la tête le disent ; le nom et l’adresse ; chaque code ancien → nouveau, à sa date et son heure ; logements et locataires concernés, tous « NON PRÉVENU »', () => {
    const a = A();
    const m = mailGestion(a, C, { mode: 'gestion', decoches: new Set(), proprietaires: false })!;
    expect(m.a).toEqual(['gestion@exemple.test']); // l'adresse des préférences, jamais en dur
    expect(m.objet).toBe('[ALERTE] Digicode modifié sans que les locataires aient été prévenus — Résidence _TEST GESTION DIGICODE — 7 rue _TEST Digicode');
    expect(m.texte.startsWith('Bonjour,\n\nALERTE : digicode modifié sans que les locataires aient été prévenus.\n\nRésidence _TEST GESTION DIGICODE — 7 rue _TEST Digicode')).toBe(true);
    expect(m.texte).toContain('Code modifié (ancien → nouveau) :\nDigicode de la copropriété : T100 → TC90, à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('Prénom1 _TEST GESTION DIGICODE 1 (p1@exemple.test) — NON PRÉVENU');
    expect(m.texte).toContain('Prénom2 _TEST GESTION DIGICODE 2 (p2@exemple.test) — NON PRÉVENU');
    expect(m.texte).toContain('Prénom3 _TEST GESTION DIGICODE 3 — NON PRÉVENU');
    // un locataire parti avant (règle des 7 jours) n'est PAS concerné : il n'est ni prévenu ni compté
    expect(m.texte).toContain('Prénom4 _TEST GESTION DIGICODE 4 — parti le 01/11 : non concerné');
    expect(m.html).toContain('<strong>ALERTE : digicode modifié sans que les locataires aient été prévenus.</strong>');
  });
  it('sans nom de copropriété : l’adresse seule', () => {
    expect(objetGestion(A({ copropriete: null }), 'gestion')).toBe('[ALERTE] Digicode modifié sans que les locataires aient été prévenus — 7 rue _TEST Digicode');
  });
});

describe('🔴 B. « Prévenir la Gestion et les locataires »', () => {
  const tousAvecMail = (): ApercuEnvoi => A({ logements: [L({ lotId: 1, locataires: [loc(1), loc(2)] }), L({ lotId: 2, locataires: [loc(4, { inclus: false, raison: 'parti le 01/11' })] })] });
  it('TOUS les locataires concernés prévenus : le mail d’INFORMATION, la phrase d’Arno mot pour mot, les codes et les locataires prévenus', () => {
    const a = tousAvecMail();
    const m = mailGestion(a, C, { mode: 'locataires', decoches: new Set(), proprietaires: false, resultats: tousPartis(a) })!;
    expect(m.objet).toBe('[Information] Digicodes mis à jour — Résidence _TEST GESTION DIGICODE — 7 rue _TEST Digicode — à compter du 20/11/2026 à 09:00');
    expect(m.texte).toContain('Les digicodes de Résidence _TEST GESTION DIGICODE — 7 rue _TEST Digicode sont mis à jour à compter du 20/11/2026 à 09:00 ; tous les locataires concernés ont été prévenus par des mails individuels.');
    expect(m.texte).toContain('Digicode de la copropriété : T100 → TC90, à partir du 20/11/2026 à 09:00');
    expect(m.texte).toContain('Prénom1 _TEST GESTION DIGICODE 1 (p1@exemple.test) — prévenu par mail');
    expect(m.texte).not.toContain('ALERTE');
  });
  it('un locataire DÉCOCHÉ, un SANS E-MAIL, un ÉCHEC D’ENVOI : le mail d’ALERTE, en objet et en tête, avec la raison de chacun', () => {
    const a = A({ logements: [L({ lotId: 1, locataires: [loc(1), loc(2), loc(5)] }), L({ lotId: 2, locataires: [loc(3, { emails: [] })] })] });
    const resultats = new Map([[101, true], [105, false]]);
    expect(verdictGestion(a, 'locataires', new Set([102]), resultats)).toEqual({ sorte: 'alerte_b', nonPrevenus: 3 });
    const m = mailGestion(a, C, { mode: 'locataires', decoches: new Set([102]), proprietaires: false, resultats })!;
    expect(m.objet).toBe('[ALERTE] Digicode modifié : 3 locataires non prévenus — Résidence _TEST GESTION DIGICODE — 7 rue _TEST Digicode');
    expect(m.texte.startsWith('Bonjour,\n\nALERTE : 3 locataires concernés n’ont pas été prévenus du changement de digicode.')).toBe(true);
    expect(m.texte).toContain('Prénom1 _TEST GESTION DIGICODE 1 (p1@exemple.test) — prévenu par mail');
    expect(m.texte).toContain('Prénom2 _TEST GESTION DIGICODE 2 (p2@exemple.test) — NON PRÉVENU (décoché)');
    expect(m.texte).toContain('Prénom5 _TEST GESTION DIGICODE 5 (p5@exemple.test) — NON PRÉVENU (échec d’envoi)');
    expect(m.texte).toContain('Prénom3 _TEST GESTION DIGICODE 3 — NON PRÉVENU (pas d’e-mail)');
  });
  it('un seul non prévenu : le singulier', () => {
    const a = tousAvecMail();
    expect(objetGestion(a, 'locataires', new Set([102]), tousPartis(a))).toBe('[ALERTE] Digicode modifié : 1 locataire non prévenu — Résidence _TEST GESTION DIGICODE — 7 rue _TEST Digicode');
  });
  it('le sort de chacun : A — non prévenu ; B — pas d’e-mail, décoché, échec d’envoi, prévenu', () => {
    expect(sortLocataire(loc(1) as never, 'gestion', new Set())).toEqual({ prevenu: false, raison: 'choix A' });
    expect(sortLocataire(loc(1, { emails: [] }) as never, 'locataires', new Set())).toEqual({ prevenu: false, raison: 'pas d’e-mail' });
    expect(sortLocataire(loc(1) as never, 'locataires', new Set([101]))).toEqual({ prevenu: false, raison: 'décoché' });
    expect(sortLocataire(loc(1) as never, 'locataires', new Set(), new Map([[101, false]]))).toEqual({ prevenu: false, raison: 'échec d’envoi' });
    expect(sortLocataire(loc(1) as never, 'locataires', new Set(), new Map([[101, true]]))).toEqual({ prevenu: true });
  });
  it('ancien → nouveau, une ligne par code ; « plus de digicode » dit en mots', () => {
    expect(lignesAncienNouveau(A({ changements: [{ place: 'Digicode du bâtiment A', ancien: { digicode: true, code: 'TA10' }, nouveau: { digicode: false, code: null }, le: '2026-11-19T23:00:00.000Z', avecHeure: false }] })))
      .toEqual(['Digicode du bâtiment A : TA10 → plus de digicode, à partir du 20/11/2026']);
  });
});

describe('🔴 JAMAIS d’anciens locataires ; la Gestion pour une MODIFICATION seulement ; l’historique', () => {
  const repo = readFileSync(new URL('./digicodesEnvoiRepo.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  it('les locataires lus : ceux dont l’occupation couvre AUJOURD’HUI (entrée passée, sortie absente ou à venir) — un ancien locataire n’est jamais lu', () => {
    // 🔴 (Arno, 20/11/2026) la sortie absente ou à venir : la règle UNIQUE (`sqlOccupationEnPlace`, historiqueBien.ts), plus écrite à la main ici
    expect(repo).toContain("FROM gestion_annuaire_occupation o WHERE o.lot_id = ANY($1::bigint[]) AND o.entree <= ${SQL_AUJOURDHUI_PARIS} AND ${sqlOccupationEnPlace('o')}");
  });
  it('la règle des 7 jours : en préavis, parti au plus 7 jours avant le changement — prévenu ; au-delà — non concerné', () => {
    expect(regleDepart('2026-11-20T08:00:00.000Z', '2026-11-13')).toEqual({ inclus: true, raison: null });
    expect(regleDepart('2026-11-20T08:00:00.000Z', '2026-11-12')).toEqual({ inclus: false, raison: 'parti le 12/11' });
  });
  it('le mail à la Gestion ne part que du « Modifier » daté (planifierEtPrevenir) — jamais d’une première saisie ni d’une correction', () => {
    const sources = ['digicodesRepo.ts', 'digicodesBienRepo.ts', 'coproprieteEcritureRepo.ts', 'digicodesEnvoiRepo.ts'].map((f) => [f, readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')] as const);
    expect(sources.filter(([, t]) => /\bmailGestion\(/.test(t)).map(([f]) => f)).toEqual(['digicodesEnvoiRepo.ts']);
    expect((repo.match(/mailGestion\(/g) ?? []).length).toBe(1);
    expect(repo).toContain('export async function planifierEtPrevenir(');
  });
  it('le mail à la Gestion est rangé dans chaque bien concerné, et l’historique des digicodes de la copropriété le lit (une fois par mail)', () => {
    expect(repo).toContain('autres: autresLots.map((x) => ({ lotId: x.lotId, occupationIds: [] }))');
    const lecture = readFileSync(new URL('./digicodesRepo.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    expect(lecture).toContain("WHERE sorte = 'digicode_gestion' AND lot_id = ANY($1::bigint[])");
    expect(lecture).toContain('if (!liste.some((m) => m.cle === r.cle))');
  });
});
