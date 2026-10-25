import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (25/10/2026) — LE RÉSUMÉ DE TRANSACTION (Locations du mois) : chaque information = la donnée validée en amont (fiche du bien,
 * fiche locataire, dossier de location). On éprouve, sur une base SIMULÉE (aucune écriture réelle) :
 *   · le « Type de bien » lu dans la fiche du bien (le constat CHEKROUNE / STUDIO COIFFURE : fiche « Local », résumé « Logement ») ;
 *   · une modification de la fiche du bien, puis de la fiche locataire, se voit dans le résumé ;
 *   · « Modifier » de l'encart écrit dans la ligne de suivi (celle que lit le Dossier de location) et journalise compte, session, écran ;
 *   · le « Statut du bien » validé à la main l'emporte, puis « Revenir au statut calculé » ; aucun effet de bord.
 */
const base = vi.hoisted(() => ({
  ligne: {} as Record<string, unknown>,
  etats: [] as Record<string, unknown>[],
  ecrits: [] as { sql: string; params: unknown[] }[],
  statut: null as string | null,
  /** Les fiches des lots (la base simulée) : « Type de bien » écrit par le geste de la fiche, relu par le résumé. */
  fiches: [] as { id: number; categorie: string | null; nature: string | null; type_bien: string | null }[],
  gestesFiche: [] as { lotId: number; groupe: unknown; champs: Record<string, unknown>; ecran: string | null }[],
}));
const repondre = (sqlBrut: string, params: unknown[] = []): { rows: unknown[]; rowCount: number } => {
  const s = sqlBrut.replace(/\s+/g, ' ').trim();
  if (/^(INSERT|UPDATE)/.test(s)) base.ecrits.push({ sql: s, params });
  if (s.includes('AS lots_fiche') && s.includes('FROM gestion_location_activite a')) return { rows: [{ ...base.ligne, lots_fiche: base.fiches.length > 0 ? base.fiches : base.ligne.lots_fiche }], rowCount: 1 };
  if (s.startsWith('SELECT lot_id, bail_id FROM gestion_location_activite WHERE id = $1')) return { rows: [{ lot_id: '364', bail_id: '520' }], rowCount: 1 };
  if (s.startsWith('SELECT id::text, categorie, nature, type_bien FROM gestion_annuaire_lot')) return { rows: base.fiches.map((f) => ({ ...f, id: String(f.id) })), rowCount: base.fiches.length };
  if (s.startsWith('SELECT apporteur_id, lot_id FROM gestion_location_activite')) return { rows: [{ apporteur_id: null, lot_id: '364' }], rowCount: 1 };
  if (s.includes('ap.nom AS apporteur, a.apporteur_taux')) { const e = base.etats.shift(); return { rows: e === undefined ? [] : [e], rowCount: 1 }; }
  if (s.startsWith('SELECT statut_bien_manuel AS s FROM gestion_location_activite')) return { rows: [{ s: base.statut }], rowCount: 1 };
  return { rows: [], rowCount: 0 };
};
vi.mock('server-only', () => ({}));
vi.mock('../../db/client', () => ({
  query: async (sql: string, params?: unknown[]) => repondre(sql, params),
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(async (sql: string, params?: unknown[]) => repondre(sql, params)),
}));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
// Le geste de la fiche du bien (« Famille du bien ») : simulé ici — il écrit la catégorie du lot ; son Historique est éprouvé avec la fiche.
vi.mock('../encartBienRepo', async () => {
  const { traceCourante } = await import('../../gestion/traceJournal');
  return { modifierEncartBien: vi.fn(async (lotId: number, groupe: unknown, champs: Record<string, unknown>) => {
    base.gestesFiche.push({ lotId, groupe, champs, ecran: traceCourante()?.ecran ?? null });
    const f = base.fiches.find((x) => x.id === lotId);
    if (f !== undefined) f.categorie = String(champs.categorie);
    return { etat: 'ok', data: { changements: [] } };
  }) };
});

const { lireActivites, typeDeBienLu, natureManuelleLue, nomDuCompte } = await import('./tableauBordRepo');
const { modifierActivite, validerStatutBien, typeDeBienVersFiche, MOT_FAMILLES_DIFFERENTES } = await import('./suiviRepo');
const { typeDeBienDesFiches } = await import('./suivi');
const { natureBienLoue, natureBienCalculee, primeDe } = await import('./tableauBord');
const { avecTrace } = await import('../../gestion/traceJournal');

const AUTEUR = { id: 4, libelle: 'arno@exemple.fr' };
/** La ligne CHEKROUNE / STUDIO COIFFURE (fictive) : copie « logement » posée à l'import ; la fiche du lot 364 : catégorie vide, « Local commercial ». */
const LIGNE = {
  id: '99', type: 'bail', date_signature: '2026-09-01', date_signature_supposee: true, libelle_proprietaire: 'CHEKROUNE (Petit local)', libelle_locataire: 'STUDIO COIFFURE',
  hono_proprietaire_ht: '375', hono_locataire_ht: '0', prime_gestion_saisie: '150', mandat_gestion: true, categorie_prime: 'logement', apporteur_id: null, apporteur_nom: null,
  apporteur_taux: null, apporteur_commission_saisie: null, negociateur_id: '5', negociateur_libelle: 'Jean-Baptiste Pons', negociateur_compte: 'Jean-Baptiste PONS', avec_gestion: true,
  origine_proprietaire: null, origine_locataire: null, loyer_hc: null, charges: null, rattachement: 'rattache', source: 'import', lot_id: '364', bail_id: '520',
  categorie: null, nature: 'Local commercial', type_bien: null, origine_contact: null, collegue_id: null, collegue_libelle: null, collegue_compte: null, prime_mode: 'regle',
  origine_contact_precision: null, apporteur_mode: null, apporteur_taux_gestion: null, taux_gestion_bien_ht: null, fin_gestion: null, assurance: null,
  statut_bien_manuel: null, statut_bien_valide_le: null, statut_bien_valide_compte: null, statut_bien_valide_par_libelle: null,
  locataires: [{ id: 41, libelle: 'STUDIO COIFFURE' }], lots: [{ id: 364, libelle: 'Local commercial — 3 rue Fictive Paris' }],
  proprietaire_source: 'CHEKROUNE Martine', locataires_source: 'STUDIO COIFFURE', vacance: null,
  lots_fiche: [{ id: 364, categorie: null, nature: 'Local commercial', type_bien: null }],
};
beforeEach(() => { base.ligne = structuredClone(LIGNE); base.etats = []; base.ecrits = []; base.statut = null; base.fiches = []; base.gestesFiche = []; });

describe('🔴 « Type de bien » = la fiche du bien (une seule source)', () => {
  it('CHEKROUNE : la fiche montre « Local » (catégorie vide, nature « Local commercial ») → le résumé dit Local, plus la copie « logement »', async () => {
    const [a] = await lireActivites([2026]);
    expect(a.categoriePrime).toBe('local');
    expect(a.parking).toBe(false);
  });

  it('la fiche du bien MODIFIÉE (famille choisie « Logement ») se voit au résumé suivant ; un bail logement + parking reste « Logement » ; tout parking → « Parking »', async () => {
    base.ligne.lots_fiche = [{ id: 364, categorie: 'logement', nature: 'Local commercial', type_bien: null }];
    expect((await lireActivites([2026]))[0].categoriePrime).toBe('logement');
    expect(typeDeBienDesFiches(364, [{ id: 364, categorie: 'logement' }, { id: 365, categorie: 'parking' }])).toBe('logement');
    expect(typeDeBienDesFiches(364, [{ id: 364, categorie: null, nature: 'Parking' }, { id: 365, categorie: 'box' }])).toBe('parking');
  });

  it('ligne historique SANS bien : la copie de la ligne reste la seule valeur (rien n’est inventé)', () => {
    expect(typeDeBienLu({ lot_id: null, lots_fiche: null, categorie_prime: 'logement' })).toEqual({ categoriePrime: 'logement', parking: false });
    expect(typeDeBienLu({ lot_id: null, lots_fiche: null, categorie_prime: null })).toEqual({ categoriePrime: null, parking: false });
  });

  it('la prime suit la valeur corrigée (sans montant importé : la règle « Local ») ; un montant importé reste tel quel', async () => {
    const [a] = await lireActivites([2026]);
    const regles = [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15, primeLocal: 200 }];
    expect(primeDe(a, regles)).toBe(150);
    expect(primeDe({ ...a, primeSaisie: null }, regles)).toBe(200);
  });
});

describe('🔴 les personnes : la fiche, jamais la copie', () => {
  it('la fiche LOCATAIRE modifiée se voit au résumé suivant (les occupants du bail, lus dans l’annuaire) ; le texte du fichier en « Libellé d’origine »', async () => {
    expect((await lireActivites([2026]))[0].libelleLocataire).toBe('STUDIO COIFFURE');
    base.ligne.locataires_source = 'STUDIO COIFFURE PARIS 11';
    const [a] = await lireActivites([2026]);
    expect(a.libelleLocataire).toBe('STUDIO COIFFURE PARIS 11');
    expect(a.libelleProprietaire).toBe('CHEKROUNE Martine');
    expect(a.libelleOrigine).toEqual({ proprietaire: 'CHEKROUNE (Petit local)', locataire: 'STUDIO COIFFURE' });
  });

  it('négociateur et collègue : le nom du COMPTE ; la copie seulement sans compte', async () => {
    base.ligne.collegue_id = '7'; base.ligne.collegue_libelle = 'Jean-Baptiste Pons'; base.ligne.collegue_compte = 'Jean-Baptiste PONS';
    const [a] = await lireActivites([2026]);
    expect([a.negociateurLibelle, a.collegueLibelle]).toEqual(['Jean-Baptiste PONS', 'Jean-Baptiste PONS']);
    expect(nomDuCompte(null, 'Collaborateur Un')).toBe('Collaborateur Un');
  });
});

describe('🔴 « Modifier » de l’encart : la ligne de suivi (celle du Dossier de location), journalisée avec compte, session, écran', () => {
  const ETAT = { origine_contact: null, origine_contact_precision: null, collegue: null, apporteur: null, apporteur_taux: null, apporteur_commission_saisie: null, prime_mode: 'regle', prime_gestion_saisie: '150' };

  it('écrit dans gestion_location_activite (lue telle quelle par le Dossier de location) ; une ligne de journal par champ changé', async () => {
    base.etats = [ETAT, { ...ETAT, origine_contact: 'internet' }];
    const r = await avecTrace({ sessionId: 'sess-1', ecran: 'Suivi du mois' }, () => modifierActivite(99, {
      origineContact: 'internet', collegueId: null, apporteurId: null, apporteurTaux: '', commissionApporteur: '', primeMode: 'regle', primeMontant: '', origineContactPrecision: '', conserverMontants: true }, AUTEUR));
    expect(r).toEqual({ etat: 'ok' });
    const maj = base.ecrits.find((e) => e.sql.startsWith('UPDATE gestion_location_activite SET origine_contact = $2'));
    expect(maj?.params.slice(0, 2)).toEqual([99, 'internet']);
    const journal = base.ecrits.filter((e) => e.sql.startsWith('INSERT INTO gestion_journal'));
    expect(journal).toHaveLength(1);
    expect(journal[0].sql).toContain("VALUES ('location_activite', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)");
    expect(journal[0].params).toEqual([99, 'location_suivi_ligne_modifiee', 'Origine du contact : (vide)', 'Origine du contact : Internet',
      'Suivi du mois — Origine du contact : (vide) → Internet', 4, 'arno@exemple.fr', 'activite', 'Origine du contact', 'sess-1', 'Suivi du mois']);
    // Le Dossier de location lit l'origine dans CETTE ligne (une seule source pour les champs de la transaction).
    expect(readFileSync('app/lib/location/dossierLocationRepo.ts', 'utf8')).toContain('FROM gestion_location_activite a WHERE a.id = $1');
  });

  it('rien de changé : aucune ligne de journal', async () => {
    base.etats = [{ ...ETAT, origine_contact: 'internet' }, { ...ETAT, origine_contact: 'internet' }];
    expect(await modifierActivite(99, { origineContact: 'internet', primeMode: 'regle', conserverMontants: true }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(base.ecrits.some((e) => e.sql.startsWith('UPDATE gestion_location_activite'))).toBe(true);
    expect(base.ecrits.filter((e) => e.sql.startsWith('INSERT INTO gestion_journal'))).toEqual([]);
  });

  it('la route enveloppe « Modifier » et « Statut du bien » dans la trace (session, écran « Suivi du mois »)', () => {
    const route = readFileSync('app/(admin)/api/admin/location/suivi/route.ts', 'utf8').replace(/\s+/g, ' ');
    expect(route).toContain("case 'modifier-activite': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Suivi du mois' }, () => modifierActivite(");
    expect(route).toContain("case 'statut-bien': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Suivi du mois' }, () => validerStatutBien(");
  });
});

describe('🔴 « Statut du bien » validé à la main (424)', () => {
  it('validé : enregistré sur la ligne (qui, quand), journalisé ; ni l’origine ni la gestion ne sont touchées', async () => {
    const r = await avecTrace({ sessionId: 'sess-2', ecran: 'Suivi du mois' }, () => validerStatutBien(99, 'nouveau_gestion', AUTEUR));
    expect(r).toEqual({ etat: 'ok' });
    const maj = base.ecrits.find((e) => e.sql.startsWith('UPDATE gestion_location_activite SET statut_bien_manuel'))!;
    expect(maj.params).toEqual([99, 'nouveau_gestion', 4, 'arno@exemple.fr']);
    expect(maj.sql).not.toMatch(/origine_contact|avec_gestion|mandat_gestion/);
    const j = base.ecrits.find((e) => e.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.params.slice(0, 5)).toEqual([99, 'location_statut_bien_valide', 'Statut du bien : statut calculé', 'Statut du bien : Nouveau · gestion',
      'Suivi du mois — Statut du bien : statut calculé → Nouveau · gestion']);
    expect(j.params.slice(-2)).toEqual(['sess-2', 'Suivi du mois']);
  });

  it('« Revenir au statut calculé » : effacé (qui et quand aussi), journalisé ; un statut inconnu est refusé, rien n’est écrit', async () => {
    base.statut = 'nouveau_gestion';
    expect(await validerStatutBien(99, null, AUTEUR)).toEqual({ etat: 'ok' });
    expect(base.ecrits.find((e) => e.sql.startsWith('UPDATE'))?.params.slice(0, 2)).toEqual([99, null]);
    expect(base.ecrits.find((e) => e.sql.startsWith('INSERT'))?.params[1]).toBe('location_statut_bien_calcule');
    base.ecrits = [];
    expect(await validerStatutBien(99, 'syndic', AUTEUR)).toEqual({ etat: 'refus', motif: 'Statut du bien inconnu.' });
    expect(base.ecrits).toEqual([]);
  });

  it('PRIORITAIRE partout (pastille, légende, panneau : `natureBienLoue`) ; sans lui, le calcul revient', async () => {
    base.ligne = { ...base.ligne, statut_bien_manuel: 'nouveau_gestion', statut_bien_valide_le: new Date('2026-10-25T09:00:00Z'), statut_bien_valide_compte: 'Arnaud Jorel' };
    const [a] = await lireActivites([2026]);
    expect(natureBienCalculee(a).nature).toBe('a_qualifier');
    expect(natureBienLoue(a)).toEqual({ nature: 'nouveau_gestion', raison: 'validé par Arnaud Jorel le 25/10/2026', manuelle: { par: 'Arnaud Jorel', le: '2026-10-25T09:00:00.000Z' } });
    expect(natureBienLoue({ ...a, natureManuelle: null }).nature).toBe('a_qualifier');
    expect(natureManuelleLue({ statut_bien_manuel: 'syndic' })).toBeNull();
  });
});

describe('🔴 Arno (25/10/2026, réponse (a)) — « Type de bien » choisi dans Nouveau locataire / le Dossier de location → la fiche du bien', () => {
  it('écrit dans la fiche du LOT PRINCIPAL par le geste de la fiche (écran tracé), puis le résumé le relit', async () => {
    base.fiches = [{ id: 364, categorie: null, nature: 'Local commercial', type_bien: null }];
    expect((await lireActivites([2026]))[0].categoriePrime).toBe('local');
    const note = await avecTrace({ sessionId: 'sess-3', ecran: 'Dossier de location (Suivi du mois)' }, () => typeDeBienVersFiche(99, 'logement', AUTEUR));
    expect(note).toBeNull();
    expect(base.gestesFiche).toEqual([{ lotId: 364, groupe: 'bien', champs: { categorie: 'logement' }, ecran: 'Dossier de location (Suivi du mois)' }]);
    expect((await lireActivites([2026]))[0].categoriePrime).toBe('logement');
  });

  it('la fiche dit déjà la même chose : rien n’est écrit', async () => {
    base.fiches = [{ id: 364, categorie: null, nature: 'Local commercial', type_bien: null }];
    expect(await typeDeBienVersFiche(99, 'local', AUTEUR)).toBeNull();
    expect(await typeDeBienVersFiche(99, null, AUTEUR)).toBeNull();
    expect(base.gestesFiche).toEqual([]);
  });

  it('LOTS DE FAMILLES DIFFÉRENTES : la fiche n’est pas écrasée, le message le dit ; le résumé garde la fiche', async () => {
    base.fiches = [{ id: 364, categorie: 'logement', nature: 'Appartement', type_bien: null }, { id: 365, categorie: 'parking', nature: null, type_bien: null }];
    expect(await typeDeBienVersFiche(99, 'local', AUTEUR)).toBe(MOT_FAMILLES_DIFFERENTES);
    expect(MOT_FAMILLES_DIFFERENTES).toBe('Type de bien : familles différentes selon les lots — modifier dans « Caractéristiques du bien loué ».');
    expect(base.gestesFiche).toEqual([]);
    expect((await lireActivites([2026]))[0].categoriePrime).toBe('logement');
  });

  it('les deux enregistrements passent par ce report (Nouveau locataire : écran tracé « Nouveau locataire » ; Dossier : sa phrase remonte)', () => {
    const repo = readFileSync('app/lib/location/suivi/suiviRepo.ts', 'utf8');
    expect(repo).toContain('const note = await typeDeBienVersFiche(r.data.id, categorieChoisie(brut), auteur);');
    expect(repo).toContain('const note = await typeDeBienVersFiche(activiteId, categorie, auteur);');
    const route = readFileSync('app/(admin)/api/admin/location/suivi/route.ts', 'utf8').replace(/\s+/g, ' ');
    expect(route).toContain("case 'enregistrer-activite': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Nouveau locataire' }, () => enregistrerActiviteBail(");
    expect(readFileSync('app/lib/location/dossierLocationRepo.ts', 'utf8')).toContain('data: { changements, ...(note === null ? {} : { note }) }');
  });
});
