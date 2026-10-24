import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONDITIONS_VIDES, versSaisieConditions, type ConditionsEntree } from './conditionsEntree';
import { changementsDossier, refusDossier, titreDossier, type LectureDossier, type SaisieDossier } from './dossierLocation';

/**
 * 🔴 Arno (24/10/2026) — « DOSSIER DE LOCATION » : le formulaire « Nouveau locataire » rouvert en MODIFICATION depuis « Locations du
 * mois ». On éprouve : le récapitulatif (les SEULS champs modifiés, par bloc), le refus d'une version dépassée (rien n'est écrit), la
 * mise à jour par les gestes existants (aucune création, aucun doublon), le journal complet (compte, session, écran, entité, champ),
 * et AUCUN geste Drive. Données fictives ; base simulée.
 */
const conditions: ConditionsEntree = {
  depot: 'agence', prelevement: true, jour: 5, garant: false, assurance: 'gli', assurancePrecision: 'Garantme', honorairesLocataire: 'agence',
  honorairesProprietaire: 'gestion', sommes: { prorataLoyer: 50000, prorataCharges: 5000, depotGarantie: 100000, honorairesAgence: 68086 },
  reglement: 'virement', reglementPrecision: null, commentaire: null,
};
const suivi = {
  type: 'bail' as const, dateSignature: '2026-09-01', honoProprietaireHt: '567,38', honoLocataireHt: '567,38', negociateurId: 3, apporteurId: null, apporteurTaux: '',
  mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: 'relocation' as const, collegueId: null,
  commissionApporteur: '', primeMode: 'aucune' as const, primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '',
  categoriePrime: 'logement' as const,
};
const lecture: LectureDossier = {
  activiteId: 100, bailId: 70, lotId: 51, version: 'v1', titre: 'Dossier de location — MARTIN Léa — 7 rue des Essais Courbevoie',
  bien: { id: 51, titre: '7 rue des Essais Courbevoie', famille: 'logement' }, lots: [{ id: 51, libelle: 'Appartement — 7 rue des Essais Courbevoie' }], entree: '2026-09-12',
  locataires: [{ id: 230, civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', codePostal: '92400', commune: 'COURBEVOIE', note: null,
    contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }] }],
  contacts: [], conditions: { occupationId: 900, valeurs: conditions, loyer: { principal: 100000, provisions: 10000 }, lignesHonoraires: [] },
  entretien: { aPrevoir: true, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-10-01' }] }, suivi,
};
const noms = { negociateur: (id: number) => (id === 3 ? 'Jean-Baptiste Pons' : id === 4 ? 'Arnaud Jorel' : `n° ${id}`), collegue: (id: number) => `n° ${id}`, apporteur: (id: number) => `n° ${id}` };
const saisie = (o: Partial<SaisieDossier> = {}): SaisieDossier => ({
  version: 'v1', locataires: [], conditions: versSaisieConditions(conditions, { principal: 100000, provisions: 10000 }),
  entretien: { aPrevoir: true, entretiens: [{ sorte: 'chaudiere', dateAnniversaire: '2026-10-01' }] }, suivi, ...o,
});

describe('🔴 le récapitulatif : les seuls champs modifiés, par bloc', () => {
  it('rien de modifié (prérempli tel quel) : aucun changement — « Enregistrer » reste inactif', () => {
    expect(changementsDossier(lecture, saisie(), noms)).toEqual([]);
  });
  it('un champ par bloc : locataire, conditions (et loyer), entretien, suivi', () => {
    const s = saisie({
      locataires: [{ id: 230, champs: { commune: 'PUTEAUX' } }],
      conditions: { ...versSaisieConditions({ ...conditions, depot: 'bailleur' }, { principal: 100000, provisions: 10000 }), loyer: { principal: '1 050', provisions: '100' } },
      entretien: { aPrevoir: false, entretiens: [] },
      suivi: { ...suivi, negociateurId: 4, honoLocataireHt: '600' },
    });
    const c = changementsDossier(lecture, s, noms);
    expect(c.filter((x) => x.bloc === 1)).toEqual([{ bloc: 1, champ: 'MARTIN Léa — Commune', avant: 'COURBEVOIE', apres: 'PUTEAUX' }]);
    expect(c.filter((x) => x.bloc === 3).map((x) => x.champ)).toEqual(['Dépôt de garantie', 'Loyer principal', 'Total loyer charges comprises / mois', 'Entretien à prévoir', 'Entretiens']);
    expect(c.find((x) => x.champ === 'Dépôt de garantie')).toMatchObject({ avant: 'Conservé par l’agence', apres: 'Reversé au bailleur' });
    expect(c.filter((x) => x.bloc === 4)).toEqual([
      { bloc: 4, champ: 'Négociateur', avant: 'Jean-Baptiste Pons', apres: 'Arnaud Jorel' },
      { bloc: 4, champ: 'Honoraires locataire HT', avant: '567,38 €', apres: '600,00 €' },
    ]);
  });
  it('une valeur identique écrite autrement n’est pas un changement (567,38 = 567,380)', () => {
    expect(changementsDossier(lecture, saisie({ suivi: { ...suivi, honoProprietaireHt: '567,380' } }), noms)).toEqual([]);
  });
  it('les refus de la saisie (cases exclusives, loyer illisible) avant tout envoi ; le titre de la modale', () => {
    expect(refusDossier(lecture, saisie({ suivi: { ...suivi, mandatGestion: true } }))).toMatch(/pas les deux/);
    expect(refusDossier(lecture, saisie({ conditions: { ...CONDITIONS_VIDES, ...versSaisieConditions(conditions, null), loyer: { principal: 'abc', provisions: '' } } }))).toMatch(/Loyer/);
    expect(refusDossier(lecture, saisie())).toBeNull();
    expect(titreDossier([{ nom: 'MARTIN', prenom: 'Léa' }, { nom: 'MARTIN', prenom: 'Paul' }], '7 rue des Essais Courbevoie'))
      .toBe('Dossier de location — MARTIN Léa, MARTIN Paul — 7 rue des Essais Courbevoie');
  });
});

// ── LE DÉPÔT : gestes existants simulés, base simulée ───────────────────────────────────────────────────────────────
const gestes = vi.hoisted(() => ({
  modifierPersonne: vi.fn(async () => ({ etat: 'ok', data: undefined })),
  modifierConditionsEntree: vi.fn(async () => ({ etat: 'ok', data: undefined })),
  modifierEncartBien: vi.fn(async () => ({ etat: 'ok', data: { changements: [] } })),
  mettreAJourActivite: vi.fn(async () => ({ etat: 'ok' })),
}));
const ecrits: { sql: string; params: unknown[] }[] = [];
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    ecrits.push({ sql: s, params });
    if (s.includes('FROM gestion_location_activite a WHERE a.id = $1')) return { rows: [{ id: '100', bail_id: '70', type: 'bail', date_signature: '2026-09-01', hono_proprietaire_ht: '567.38',
      hono_locataire_ht: '567.38', negociateur_id: '3', apporteur_id: null, apporteur_taux: null, apporteur_commission_saisie: null, mandat_gestion: false, avec_gestion: true,
      categorie_prime: 'logement', origine_proprietaire_saisie: null, origine_locataire_saisie: null, origine_contact: 'relocation', collegue_id: null, prime_mode: 'aucune',
      prime_gestion_saisie: '0', origine_contact_precision: null, apporteur_mode: null, apporteur_taux_gestion: null, modifie_le: null }] };
    if (s.includes('FROM gestion_bail b JOIN gestion_annuaire_lot')) return { rows: [{ lot_id: '51', entree: '2026-09-12', adresse: '7 rue des Essais', commune: 'Courbevoie', nature: 'Appartement', categorie: 'logement', type_bien: null }] };
    if (s.startsWith('SELECT id::text, locataire_id::text, lot_id::text FROM gestion_annuaire_occupation')) return { rows: [{ id: '900', locataire_id: '230', lot_id: '51' }] };
    if (s.includes('FROM gestion_annuaire_lot l WHERE l.id = ANY')) return { rows: [{ id: '51', libelle: 'Appartement — 7 rue des Essais Courbevoie' }] };
    if (s.includes('FROM gestion_annuaire_locataire WHERE id = ANY')) return { rows: [{ id: '230', civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', code_postal: '92400', commune: 'COURBEVOIE', note: null }] };
    if (s.includes('FROM gestion_annuaire_contact')) return { rows: [] };
    if (s.includes('FROM gestion_contact_carte')) return { rows: [] };
    if (s.includes('FROM admin_utilisateur') && s.includes('coalesce(nullif(btrim(concat_ws') && !s.includes('gestion_journal')) return { rows: [{ id: '3', libelle: 'Jean-Baptiste Pons' }, { id: '4', libelle: 'Arnaud Jorel' }] };
    if (s.includes('FROM gestion_location_apporteur')) return { rows: [] };
    if (s.includes('pg_get_constraintdef')) return { rows: [{ def: "CHECK ((entite = ANY (ARRAY['location_activite'::text, 'location_bail'::text, 'annuaire'::text])))" }] };
    if (s.includes('FROM gestion_journal j')) return { rows: [{ par: 'Jean-Baptiste Pons', quand: '2026-10-24 12:05:00+00' }] };
    return { rows: [], rowCount: 1 };
  },
  withTransaction: async () => { throw new Error('inattendu'); },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./suivi/suiviRepo', () => ({ annuaireDisponible: async () => true, mettreAJourActivite: gestes.mettreAJourActivite }));
vi.mock('../gestion/annuaireEditionRepo', () => ({ modifierPersonne: gestes.modifierPersonne }));
vi.mock('../gestion/partieCategorieRepo', () => ({ lireCartesRattachees: async (f: { lotId?: number }) => (f.lotId === 51 ? [{ id: '5', nom: 'Durand', prenom: 'Paul', qualite: 'Garant', adresse: '', loc_id: '230', loc_nom: null, garanties: null }] : [{ id: '5', nom: 'Durand', prenom: 'Paul', qualite: 'Garant', adresse: '', loc_id: '230', loc_nom: null, garanties: null }]) }));
vi.mock('./conditionsEntreeRepo', () => ({
  conditionsParOccupation: async () => new Map([[900, { bailCle: 'b', occupationIds: [900], conditions, saisiLe: '', saisiPar: '', modifiees: false, lignes: [], honoraires: null, loyer: { principal: 100000, provisions: 10000 }, bailId: 70 }]]),
  modifierConditionsEntree: gestes.modifierConditionsEntree,
}));
vi.mock('./creationBienRepo', () => ({ complementsDuBien: async () => ({ entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-10-01' }] }) }));
vi.mock('./encartBienRepo', () => ({ modifierEncartBien: gestes.modifierEncartBien }));
// 🔴 AUCUN GESTE DRIVE : chaque module d'écriture du Drive refuse s'il est appelé.
const DRIVE_INTERDIT = () => { throw new Error('Drive interdit en Dossier de location'); };
vi.mock('../gestion/arbreStatutDriveRepo', () => ({ creerDossierDuBien: DRIVE_INTERDIT, deplacerDossierDuBien: DRIVE_INTERDIT }));
vi.mock('./brancheBailDriveRepo', () => ({ creerBrancheBail: DRIVE_INTERDIT, renommerBrancheBail: DRIVE_INTERDIT }));

const { lireDossierLocation, modifierDossierLocation } = await import('./dossierLocationRepo');
const { avecTrace } = await import('../gestion/traceJournal');
const auteur = { id: 12, libelle: 'lea.martin@exemple.fr' };
beforeEach(() => { ecrits.length = 0; for (const g of Object.values(gestes)) g.mockClear(); });

describe('🔴 le dépôt du dossier', () => {
  it('préremplissage fidèle : les 4 blocs lus dans les sources', async () => {
    const r = await lireDossierLocation(100);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.titre).toBe('Dossier de location — MARTIN Léa — 7 rue des Essais Courbevoie');
    expect(r.data.locataires.map((l) => [l.id, l.nom, l.prenom])).toEqual([[230, 'MARTIN', 'Léa']]);
    expect(r.data.conditions?.valeurs.depot).toBe('agence');
    expect(r.data.entretien?.aPrevoir).toBe(true);
    expect(r.data.contacts).toEqual([{ id: 5, libelle: 'DURAND Paul', qualite: 'Garant' }]);   // une seule fois (bien et locataire)
    expect(r.data.suivi).toMatchObject({ dateSignature: '2026-09-01', honoProprietaireHt: '567,38', negociateurId: 3, origineContact: 'relocation', primeMode: 'aucune' });
    expect(r.data.version).toMatch(/^[0-9a-z]+$/);
  });

  it('🔴 conflit : version dépassée → refus explicite (qui, quand), RIEN n’est écrit', async () => {
    const r = await modifierDossierLocation(100, { version: 'ancienne', suivi: { ...suivi, negociateurId: 4 } }, auteur);
    expect(r).toEqual({ etat: 'conflit', motif: expect.stringContaining('modifiée par Jean-Baptiste Pons le 24/10/2026 à 14:05') });
    for (const g of Object.values(gestes)) expect(g).not.toHaveBeenCalled();
    expect(ecrits.some((e) => /^(INSERT|UPDATE|DELETE)\b/.test(e.sql))).toBe(false);
  });

  it('mise à jour sans doublon : chaque partie par son geste existant ; rien n’est créé', async () => {
    const lu = await lireDossierLocation(100);
    if (lu.etat !== 'ok') throw new Error('lecture');
    const r = await avecTrace({ sessionId: 'jti-abc', ecran: 'Dossier de location (Suivi du mois)' }, () => modifierDossierLocation(100, {
      version: lu.data.version, locataires: [{ id: 230, champs: { commune: 'PUTEAUX' } }],
      conditions: { ...versSaisieConditions({ ...conditions, depot: 'bailleur' }, { principal: 100000, provisions: 10000 }) },
      entretien: { aPrevoir: false, entretiens: [] }, suivi: { ...suivi, negociateurId: 4 },
    }, auteur));
    expect(r.etat).toBe('ok');
    expect(gestes.modifierPersonne).toHaveBeenCalledWith('locataire', 230, { commune: 'PUTEAUX' }, auteur);
    expect(gestes.modifierConditionsEntree).toHaveBeenCalledWith(900, expect.objectContaining({ depot: 'bailleur' }), auteur);
    expect(gestes.modifierEncartBien).toHaveBeenCalledWith(51, 'dpe', { entretienAPrevoir: 'non', entretiens: '[]' }, auteur);
    expect(gestes.mettreAJourActivite).toHaveBeenCalledWith(100, expect.objectContaining({ negociateurId: 4 }), auteur, { conserverMontants: true });
    expect(ecrits.some((e) => e.sql.startsWith('INSERT INTO gestion_location_activite') || e.sql.startsWith('INSERT INTO gestion_bail')
      || e.sql.startsWith('INSERT INTO gestion_annuaire_locataire') || e.sql.startsWith('INSERT INTO gestion_annuaire_occupation'))).toBe(false);
  });

  it('🔴 le journal : une ligne par champ — compte (id), session, écran, entité + id, champ, ancienne et nouvelle valeur', async () => {
    const lu = await lireDossierLocation(100);
    if (lu.etat !== 'ok') throw new Error('lecture');
    ecrits.length = 0;
    await avecTrace({ sessionId: 'jti-abc', ecran: 'Dossier de location (Suivi du mois)' }, () => modifierDossierLocation(100, {
      version: lu.data.version, suivi: { ...suivi, negociateurId: 4 },
    }, auteur));
    const j = ecrits.filter((e) => e.sql.startsWith('INSERT INTO gestion_journal'));
    expect(j).toHaveLength(1);
    expect(j[0].sql).toContain('sujet, champ, session_id, ecran');
    expect(j[0].params).toEqual(['location_activite', 100, 'location_dossier_suivi', 'Jean-Baptiste Pons', 'Arnaud Jorel',
      'Dossier de location — Suivi commercial — Négociateur : Jean-Baptiste Pons → Arnaud Jorel', 12, 'lea.martin@exemple.fr',
      'activite', 'Négociateur', 'jti-abc', 'Dossier de location (Suivi du mois)']);
  });

  it('rien de modifié : aucun geste, aucune écriture', async () => {
    const lu = await lireDossierLocation(100);
    if (lu.etat !== 'ok') throw new Error('lecture');
    ecrits.length = 0;
    expect(await modifierDossierLocation(100, { version: lu.data.version }, auteur)).toEqual({ etat: 'ok', data: { changements: [] } });
    for (const g of Object.values(gestes)) expect(g).not.toHaveBeenCalled();
    expect(ecrits.some((e) => /^(INSERT|UPDATE|DELETE)\b/.test(e.sql))).toBe(false);
  });

  it('🔴 AUCUN GESTE DRIVE : le dépôt et la route n’appellent aucune écriture du Drive', () => {
    const repo = readFileSync('app/lib/location/dossierLocationRepo.ts', 'utf8');
    expect(repo).not.toMatch(/from '[^']*[Dd]rive[^']*'/);
    const route = readFileSync('app/(admin)/api/admin/gestion/annuaire/location/route.ts', 'utf8');
    const branche = route.slice(route.indexOf("case 'modifier-dossier-location'"), route.indexOf("case 'modifier-fiche-bien'"));
    expect(branche).not.toMatch(/[Dd]rive/);
  });
});
