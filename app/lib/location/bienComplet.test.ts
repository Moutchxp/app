import { describe, expect, it } from 'vitest';
import { aRenseignerDuBien, DPE_NON_SOUMIS, familleDeCategorie, idFiscalInhabituel, manquesDuBien, normaliserIdFiscal, TYPES_LOCAL, verifierBienComplet, verifierComplements } from './bienComplet';
import { alertesDpe, aujourdhuiParis, interdictionEnVigueur } from './reglagesDpe';

/** Le DPE et l'entretien d'un logement / local complets (Arno, 18/10/2026 : obligatoires à la création). */
const DPE_OK = { dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false, aujourdhui: '2026-10-18' };

describe('🔴 formulaire complet du bien — la règle pure (écran ET serveur)', () => {
  it('obligatoires : un propriétaire, l’adresse, la FAMILLE, puis le type propre à la famille', () => {
    // L'ordre est celui du formulaire (Arno, 17/10/2026) : propriétaire(s), le bien, puis l'adresse.
    expect(Object.keys(manquesDuBien({ proprietaireIds: [], adresse: ' ' }))).toEqual(['proprietaires', 'famille', 'adresse']);
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'logement', ...DPE_OK }))).toEqual(['typeLogement']);
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'local', ...DPE_OK }))).toEqual(['typeLocal']);
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'parking' }))).toEqual(['parkingType']);
    expect(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'logement', typeLogement: 'studio', ...DPE_OK })).toEqual({});
    expect(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'local', typeLocal: 'bureaux', annexes: [{ autreAdresse: true, adresse: '' }], ...DPE_OK }))
      .toEqual({ 'annexe-0': 'Annexe 1 : l’autre adresse est à renseigner.' });
  });
  it('la famille d’un bien existant se DÉDUIT de sa catégorie (rien n’est écrit)', () => {
    expect([familleDeCategorie('logement'), familleDeCategorie('local'), familleDeCategorie('parking'), familleDeCategorie('box'), familleDeCategorie('cave'), familleDeCategorie(null)])
      .toEqual(['logement', 'local', 'parking', 'parking', null, null]);
  });
  it('le reste est facultatif, mais refusé s’il est mal formé', () => {
    const base = { proprietaireIds: [1, 1, 2], logement: { adresse: '1 rue A', famille: 'logement', typeLogement: 'maison', dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false }, annexes: [] };
    const v = verifierBienComplet(base);
    expect(v.ok && v.proprietaireIds).toEqual([1, 2]);
    expect(v.ok && v.logement).toMatchObject({ categorie: 'logement', meuble: null, dpeClasse: 'D', dpeNonSoumis: null, nombrePieces: null });
    expect(verifierBienComplet({ ...base, logement: { ...base.logement, nombrePieces: '2,5' } }).ok).toBe(false);
    expect(verifierBienComplet({ ...base, logement: { ...base.logement, dpeClasse: 'H' } }).ok).toBe(false);
    expect(verifierBienComplet({ ...base, logement: { ...base.logement, codePostal: '7501' } }).ok).toBe(false);
    expect(verifierBienComplet({ ...base, annexes: [{ categorie: 'logement' }] }).ok).toBe(false);
  });
  it('les compléments : virgule décimale, classe DPE en majuscule, « oui / non » pour meublé', () => {
    const v = verifierComplements({ surfaceHabitableM2: '41,8', dpeClasse: 'c', meuble: 'non', typeLogement: '' });
    expect(v.ok && v.valeurs).toMatchObject({ surfaceHabitableM2: 41.8, dpeClasse: 'C', meuble: false, typeLogement: null });
  });
});

describe('🔴 DPE et « Entretien à prévoir » obligatoires à la création d’un logement / local (Arno, 18/10/2026)', () => {
  const bien = (o: Record<string, unknown> = {}) => ({ proprietaireIds: [1], adresse: '1 rue A', famille: 'logement', typeLogement: 'studio', ...DPE_OK, ...o });
  it('bloqué sans classe, sans date, sans Oui / Non, avec Oui sans entretien', () => {
    expect(Object.keys(manquesDuBien(bien({ dpeClasse: '' })))).toEqual(['dpe']);
    expect(Object.keys(manquesDuBien(bien({ dpeDate: '' })))).toEqual(['dpeDate']);
    expect(Object.keys(manquesDuBien(bien({ entretienAPrevoir: null })))).toEqual(['entretien']);
    expect(Object.keys(manquesDuBien(bien({ entretienAPrevoir: true, entretiens: [] })))).toEqual(['entretienListe']);
    // Rien de choisi : les quatre messages, dans l'ordre du formulaire.
    expect(Object.keys(manquesDuBien(bien({ dpeClasse: '', dpeDate: '', entretienAPrevoir: null })))).toEqual(['dpe', 'dpeDate', 'entretien']);
    expect(manquesDuBien(bien({ dpeClasse: '' })).dpe).toBe('Choisissez la classe DPE (A à G) ou « Non soumis ».');
  });
  it('Oui avec un entretien : Chaudière, Ramonage, ou un « Autre » NOMMÉ (dates facultatives)', () => {
    expect(manquesDuBien(bien({ entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '' }] }))).toEqual({});
    expect(manquesDuBien(bien({ entretienAPrevoir: 'oui', entretiens: [{ sorte: 'ramonage' }] }))).toEqual({});
    expect(manquesDuBien(bien({ entretienAPrevoir: true, entretiens: [{ sorte: 'autre', nom: 'VMC' }] }))).toEqual({});
    expect(Object.keys(manquesDuBien(bien({ entretienAPrevoir: true, entretiens: [{ sorte: 'autre', nom: ' ' }] })))).toEqual(['entretien-autre-0']);
    expect(manquesDuBien(bien({ entretienAPrevoir: false, entretiens: [] }))).toEqual({});
  });
  it('« Non soumis » sans date est accepté (et la date éventuelle n’est pas gardée)', () => {
    expect(manquesDuBien(bien({ dpeClasse: DPE_NON_SOUMIS, dpeDate: '' }))).toEqual({});
    const v = verifierBienComplet({ proprietaireIds: [1], logement: { adresse: '1 rue A', famille: 'local', typeLocal: 'bureaux', dpeClasse: DPE_NON_SOUMIS, dpeDate: '2020-01-01', entretienAPrevoir: false }, annexes: [] });
    expect(v.ok && v.logement).toMatchObject({ dpeClasse: null, dpeDate: null, dpeNonSoumis: true });
  });
  it('date dans le futur refusée ; date du jour acceptée', () => {
    expect(manquesDuBien(bien({ dpeDate: '2026-10-19' })).dpeDate).toBe('La date du DPE ne peut pas être dans le futur.');
    expect(manquesDuBien(bien({ dpeDate: '2026-10-18' }))).toEqual({});
  });
  it('un parking nu n’est pas concerné', () => {
    expect(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple' })).toEqual({});
    const v = verifierBienComplet({ proprietaireIds: [1], logement: { adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple', dpeClasse: DPE_NON_SOUMIS }, annexes: [] });
    expect(v.ok && v.logement).toMatchObject({ dpeClasse: null, dpeNonSoumis: null });
  });
  it('le serveur refuse avec le même message (verifierBienComplet = la règle de l’écran)', () => {
    const r = verifierBienComplet({ proprietaireIds: [1], logement: { adresse: '1 rue A', famille: 'logement', typeLogement: 'studio' }, annexes: [] });
    expect(r).toEqual({ ok: false, motif: expect.stringContaining('Choisissez la classe DPE (A à G) ou « Non soumis ».') });
    expect(!r.ok && r.motif).toContain('Entretien à prévoir : répondez Oui ou Non.');
  });
  it('alertes NON bloquantes : classe G (réglage daté) et DPE de plus de 10 ans', () => {
    expect(alertesDpe({ classe: 'G', date: '2024-03-01' }, '2026-10-18')).toEqual(['Location interdite depuis le 01/01/2025 pour un nouveau bail']);
    expect(alertesDpe({ classe: 'D', date: '2016-10-17' }, '2026-10-18')).toEqual(['DPE de plus de 10 ans : il n’est plus valable']);
    expect(alertesDpe({ classe: 'D', date: '2016-10-18' }, '2026-10-18')).toEqual([]);
    expect(alertesDpe({ classe: 'G', date: '2010-01-01', nonSoumis: true }, '2026-10-18')).toEqual([]);
    // La date vient du réglage : F n'est pas encore interdite en 2026, elle le sera le 01/01/2028.
    expect(interdictionEnVigueur('F', '2026-10-18')).toBeNull();
    expect(alertesDpe({ classe: 'F', date: '2027-06-01' }, '2028-01-01')).toEqual(['Location interdite depuis le 01/01/2028 pour un nouveau bail']);
    expect(interdictionEnVigueur('g', '2024-12-31')).toBeNull();
    // Les alertes ne bloquent pas : une classe G récente s'enregistre.
    expect(manquesDuBien(bien({ dpeClasse: 'G' }))).toEqual({});
  });
  it('la date du jour est celle de Paris (jamais celle de Londres la nuit)', () => {
    expect(aujourdhuiParis(new Date('2026-10-18T22:30:00Z'))).toBe('2026-10-19');
    expect(aujourdhuiParis(new Date('2026-10-18T21:30:00Z'))).toBe('2026-10-18');
  });
  it('bien existant : « DPE à renseigner » / « Entretien à renseigner » affichés, jamais pour un parking ni sans la migration 379', () => {
    const vide = { dpeClasse: null, dpeDate: null, dpeNonSoumis: null, entretienAPrevoir: null, entretiens: [] };
    expect(aRenseignerDuBien(vide, 'logement')).toEqual(['DPE à renseigner', 'Entretien à renseigner']);
    expect(aRenseignerDuBien({ ...vide, dpeNonSoumis: true, entretienAPrevoir: false }, 'local')).toEqual([]);
    expect(aRenseignerDuBien({ ...vide, dpeClasse: 'C' }, 'logement')).toEqual(['DPE à renseigner', 'Entretien à renseigner']);
    expect(aRenseignerDuBien(vide, 'parking')).toEqual([]);
    expect(aRenseignerDuBien({ ...vide, entretiens: undefined }, 'logement')).toEqual(['DPE à renseigner']);
  });
});

describe('🔴 « Bien en gestion ? » (Arno, 20/10/2026) — réponse obligatoire, portée par le bien', () => {
  const PARKING = { proprietaireIds: [1], adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple' };
  it('posée sans réponse : un manque, le DERNIER (ordre du formulaire) ; Oui ou Non : plus rien', () => {
    expect(manquesDuBien({ ...PARKING, enGestion: null })).toEqual({ enGestion: 'Bien en gestion ? : répondez Oui ou Non.' });
    expect(Object.keys(manquesDuBien({ proprietaireIds: [], adresse: '', enGestion: null })).at(-1)).toBe('enGestion');
    expect(manquesDuBien({ ...PARKING, enGestion: 'oui' })).toEqual({ enGestion: 'Bien en gestion ? : répondez Oui ou Non.' });
    expect(manquesDuBien({ ...PARKING, enGestion: true })).toEqual({});
    expect(manquesDuBien({ ...PARKING, enGestion: false })).toEqual({});
  });
  it('non posée (appel d’avant ce lot) : aucun manque, le bien est « en gestion » par défaut', () => {
    expect(manquesDuBien(PARKING)).toEqual({});
    const sans = verifierBienComplet({ proprietaireIds: [1], annexes: [], logement: { adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple' } });
    expect(sans.ok && sans.enGestion).toBe(true);
  });
  it('le serveur applique la même règle : null refusé, Non gardé, Oui gardé', () => {
    const base = { proprietaireIds: [1], annexes: [], logement: { adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple' } };
    expect(verifierBienComplet({ ...base, enGestion: null })).toEqual({ ok: false, motif: 'Bien en gestion ? : répondez Oui ou Non.' });
    const non = verifierBienComplet({ ...base, enGestion: false });
    expect(non.ok && non.enGestion).toBe(false);
    const oui = verifierBienComplet({ ...base, enGestion: true });
    expect(oui.ok && oui.enGestion).toBe(true);
  });
});

describe('🔴 « Paiement des charges » (Arno, 21/10/2026, migration 400) : facultatif, Propriétaire / Agence', () => {
  it('relu tel quel ; vide = non renseigné ; toute autre valeur refusée ; jamais dans « Reste à renseigner »', () => {
    const v = (x: unknown) => verifierComplements({ chargesCopro: x });
    expect(v('proprietaire')).toMatchObject({ ok: true, valeurs: { chargesCopro: 'proprietaire' } });
    expect(v('agence')).toMatchObject({ ok: true, valeurs: { chargesCopro: 'agence' } });
    for (const x of [undefined, null, '', '  ']) expect(v(x)).toMatchObject({ ok: true, valeurs: { chargesCopro: null } });
    expect(v('syndic')).toEqual({ ok: false, motif: 'Paiement des charges : Propriétaire ou Agence.' });
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple' }))).toEqual([]);
  });
  it('enregistré avec le bien pour les trois familles (création)', () => {
    for (const famille of ['logement', 'local', 'parking'] as const) {
      const propre = famille === 'logement' ? { typeLogement: 'studio' } : famille === 'local' ? { typeLocal: TYPES_LOCAL[0] } : { parkingType: 'box_simple' };
      const r = verifierBienComplet({ proprietaireIds: [1], annexes: [], logement: { adresse: '1 rue A', famille, ...propre,
        ...(famille === 'parking' ? {} : { dpeClasse: 'C', dpeDate: '2024-01-01', entretienAPrevoir: false }), chargesCopro: 'agence' } });
      if (!r.ok) throw new Error(`${famille} : ${r.motif}`);
      expect(r.logement.chargesCopro, famille).toBe('agence');
    }
  });
});

describe('🔴 « ID fiscal du bien » (Arno, 21/10/2026, migration 401) : facultatif, espaces retirés, avertissement à 12 chiffres', () => {
  it('espaces retirés ; vide = non renseigné ; 40 caractères au plus ; jamais dans « Reste à renseigner »', () => {
    expect(normaliserIdFiscal(' 92 1234 5678 90 ')).toBe('921234567890');
    for (const x of [undefined, null, '', '   ', 12]) expect(normaliserIdFiscal(x)).toBeNull();
    expect(verifierComplements({ idFiscal: '92 1234 5678 90' })).toMatchObject({ ok: true, valeurs: { idFiscal: '921234567890' } });
    expect(verifierComplements({ idFiscal: '9212' })).toMatchObject({ ok: true, valeurs: { idFiscal: '9212' } }); // l'avertissement ne bloque pas
    expect(verifierComplements({})).toMatchObject({ ok: true, valeurs: { idFiscal: null } });
    expect(verifierComplements({ idFiscal: '1'.repeat(41) })).toEqual({ ok: false, motif: 'L’ID fiscal du bien fait 40 caractères au plus.' });
    expect(Object.keys(manquesDuBien({ proprietaireIds: [1], adresse: '1 rue A', famille: 'parking', parkingType: 'box_simple' }))).toEqual([]);
  });
  it('l’avertissement : tout ce qui n’est pas 12 chiffres (espaces non comptés), jamais à vide', () => {
    for (const x of ['921234567890', '92 12 34 56 78 90', '', '  ', null]) expect(idFiscalInhabituel(x), String(x)).toBe(false);
    for (const x of ['9212345', '9212345678901', '92A234567890']) expect(idFiscalInhabituel(x), x).toBe(true);
  });
  it('enregistré avec le bien pour les trois familles (création), espaces retirés', () => {
    for (const famille of ['logement', 'local', 'parking'] as const) {
      const propre = famille === 'logement' ? { typeLogement: 'studio' } : famille === 'local' ? { typeLocal: TYPES_LOCAL[0] } : { parkingType: 'box_simple' };
      const r = verifierBienComplet({ proprietaireIds: [1], annexes: [], logement: { adresse: '1 rue A', famille, ...propre,
        ...(famille === 'parking' ? {} : { dpeClasse: 'C', dpeDate: '2024-01-01', entretienAPrevoir: false }), idFiscal: '92 1234 5678 90' } });
      if (!r.ok) throw new Error(`${famille} : ${r.motif}`);
      expect(r.logement.idFiscal, famille).toBe('921234567890');
    }
  });
});
