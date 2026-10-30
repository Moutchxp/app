import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TUILE « TRANSACTION » — la base, simulée : sans la migration 433 RIEN ne s'écrit ; rien n'est jamais supprimé ; une modification
 * journalise seulement ce qui change ; « Annuler » refuse un geste dépassé par un plus récent. (Éprouvé aussi sur la base jetable.)
 */
const disponible = vi.fn<() => Promise<boolean>>();
const lotD = vi.fn<() => Promise<boolean>>(async () => false);
const lotE = vi.fn<() => Promise<boolean>>(async () => false);
const lotG = vi.fn<() => Promise<boolean>>(async () => false);
const lotI = vi.fn<() => Promise<boolean>>(async () => false);
const lotP = vi.fn<() => Promise<boolean>>(async () => false);
const lotR = vi.fn<() => Promise<boolean>>(async () => false);
const lotS = vi.fn<() => Promise<boolean>>(async () => false);
const lotV = vi.fn<() => Promise<boolean>>(async () => false);
const lotBJ = vi.fn<() => Promise<boolean>>(async () => false);
vi.mock('../admin/schemaDroits', () => ({ droitTransactionDisponible: () => disponible(), repartitionDisponible: () => lotD(), prixVenteDisponible: () => lotE(),
  annulationDisponible: () => lotG(), uniteCommissionDisponible: () => lotI(), statutDisponible: () => lotP(), interCabinetDisponible: () => lotR(), commissionneDisponible: () => lotS(),
  modeCommissionDisponible: () => lotV(), personneTypeDisponible: () => lotBJ() }));
const appels: { sql: string; params: unknown[] }[] = [];
let reponses: ((sql: string) => { rows: Record<string, unknown>[] } | undefined)[] = [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  for (const r of reponses) { const x = r(sql.replace(/\s+/g, ' ')); if (x !== undefined) return x; }
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));

const repo = await import('./repo');
const A = { id: 3, libelle: 'arno' };
beforeEach(() => { appels.length = 0; reponses = []; disponible.mockResolvedValue(true); lotD.mockResolvedValue(false); lotE.mockResolvedValue(false); lotG.mockResolvedValue(false); lotI.mockResolvedValue(false); lotP.mockResolvedValue(false); lotR.mockResolvedValue(false); lotS.mockResolvedValue(false); lotBJ.mockResolvedValue(false); q.mockClear(); });

describe('sans la migration 433', () => {
  it('toute écriture est refusée avec le motif, sans une requête', async () => {
    disponible.mockResolvedValue(false);
    expect(await repo.modifierVente(1, { mois: 2 }, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(await repo.rattacherRetro(1, 2, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(await repo.enregistrerGestion(2025, 1, { nbLots: null, honorairesHt: 1, adhocHt: null, salarieHt: null, resteHt: null, note: null }, A))
      .toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(appels).toEqual([]);
  });
});

describe('rien n’est jamais supprimé', () => {
  it('le dépôt n’émet aucun DELETE ni TRUNCATE', () => {
    const src = readFileSync('app/lib/transaction/repo.ts', 'utf8');
    expect(src).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(src).not.toMatch(/\bTRUNCATE\b/i);
  });
});

describe('modifier une vente', () => {
  it('écrit et journalise SEULEMENT les champs qui changent (valeur avant / après)', async () => {
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'A', honoraires_ttc: '12000', statut: 'vendue', annee: 2025, mois_acte: '2025-03-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.modifierVente(5, { mois: 4, libelle: 'A' }, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql).toContain('mois_acte = $2');
    expect(maj.sql).not.toContain('libelle');
    expect(maj.params).toEqual([5, '2025-04-01']);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params.slice(0, 5)).toEqual(['vente', 5, 'modification', JSON.stringify({ mois_acte: '2025-03-01' }), JSON.stringify({ mois_acte: '2025-04-01' })]);
  });
  it('un compromis n’a pas de mois de l’acte', async () => {
    reponses.push((s) => (s.includes('FOR UPDATE') ? { rows: [{ libelle: 'A', honoraires_ttc: 1, statut: 'vendue', annee: 2025, mois_acte: '2025-03-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    await repo.modifierVente(5, { statut: 'compromis' }, A);
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([5, 'compromis', null]);
  });
});

describe('annuler un geste', () => {
  it('refuse quand la ligne a été modifiée depuis par un geste plus récent', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '7', entite: 'retrocession', entite_id: '4', action: 'rattachement', avant: { vente_id: null }, apres: { vente_id: 10 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_retrocession WHERE id = $1 FOR UPDATE') ? { rows: [{ vente_id: '11', apporteur: null, montant_ttc: '1200', retire_le: null }] } : undefined));
    const r = await repo.annulerGeste(7, A);
    expect(r.ok).toBe(false);
    expect(appels.some((x) => x.sql.startsWith('UPDATE'))).toBe(false);
  });
  it('une MISE À JOUR par l’import (compromis devenu vente, D2) s’annule en remettant la valeur d’avant — jamais en retirant la vente', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '5', entite: 'vente', entite_id: '18', action: 'import_mise_a_jour', avant: { statut: 'compromis', annee: 2025 }, apres: { statut: 'vendue', annee: 2026 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'OURY/BERTRAND', honoraires_ttc: '50000', statut: 'vendue', annee: 2026, mois_acte: '2026-02-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '6' }] } : undefined));
    expect(await repo.annulerGeste(5, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql).not.toContain('retire_le');
    expect(maj.params.slice(1)).toEqual(['compromis', 2025]);
  });
  it('remet la valeur d’avant et journalise l’annulation (annule_journal_id)', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '7', entite: 'retrocession', entite_id: '4', action: 'rattachement', avant: { vente_id: null }, apres: { vente_id: 10 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_retrocession WHERE id = $1 FOR UPDATE') ? { rows: [{ vente_id: '10', apporteur: null, montant_ttc: '1200', retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '8' }] } : undefined));
    expect(await repo.annulerGeste(7, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_retrocession'))!.params).toEqual([4, null]);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params[2]).toBe('annulation');
    expect(j.params[6]).toBe(7);
  });
});

describe('LOT C — attribuer une vente notée chez les deux sociétés', () => {
  const notesEnBase = (s: string) => (s.includes('WHERE double_cle = $1') ? { rows: [{ id: '1', societe: 'criterimmo' }, { id: '2', societe: 'macj' }] } : undefined);
  const etat: Record<string, string> = { '1': 'a_attribuer', '2': 'a_attribuer' };
  it('« Attribuer à MACJ » : MACJ retenue, CRITERIMMO écartée, chaque note journalisée ; « Remettre à attribuer » défait', async () => {
    reponses.push(notesEnBase);
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'X', honoraires_ttc: '1', statut: 'vendue', annee: 2025, mois_acte: null,
      date_compromis: null, apporteur: null, note: null, retire_le: null, attribution: etat[String(appels.at(-1)!.params[0])] }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.attribuer('double|X', 'macj', A)).toEqual({ ok: true });
    const majs = appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente'));
    expect(majs.map((x) => x.params)).toEqual([[1, 'ecartee'], [2, 'retenue']]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toEqual(['attribution', 'attribution']);
    appels.length = 0; etat['1'] = 'ecartee'; etat['2'] = 'retenue';
    expect(await repo.attribuer('double|X', null, A)).toEqual({ ok: true });
    expect(appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente')).map((x) => x.params)).toEqual([[1, 'a_attribuer'], [2, 'a_attribuer']]);
  });
  it('une société qui n’a pas noté la vente est refusée', async () => {
    reponses.push((s) => (s.includes('WHERE double_cle = $1') ? { rows: [{ id: '1', societe: 'criterimmo' }] } : undefined));
    expect((await repo.attribuer('double|X', 'macj', A)).ok).toBe(false);
  });
});

describe('🔴 LOT D (434) — compromis, répartition, « Acte signé »', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: null, honorairesTtc: 12000, dateCompromis: '2026-10-20',
    dateActePrevue: '2027-01-15', dateActe: null, adresseBien: '1 rue A, Puteaux', note: null, entreeId: 5, sortieId: 7, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const,
    personnes: [{ id: null, role: 'vendeur' as const, nom: 'DUPONT', telephone: '06 12 34 56 78', email: null, adresse: null }, { id: null, role: 'acquereur' as const, nom: 'MARTIN', telephone: null, email: null, adresse: null }],
    parties: [{ sorte: 'entree' as const, compteId: 5, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie' as const, compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
    lignes: [], prixVente: null, ...o });
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY') ? { rows: [{ id: '5', nom: 'Jean-Baptiste PONS' }, { id: '7', nom: 'Mylène EBERLIN' }] } : undefined);
  // JB : CRITERIMMO depuis toujours ; Mylène : CRITERIMMO jusqu'au 31/10/2026, MACJ à compter du 01/11/2026.
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' },
    { compte_id: '7', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '7', societe: 'macj', depuis: '2026-11-01' }] } : undefined);
  const ecritures = () => appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql));

  it('sans la 434 : refus avec le motif, rien n’est écrit ; la lecture ne nomme aucune colonne neuve', async () => {
    expect(await repo.enregistrerDossier(null, dossier(), '2026-10-27', A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_434 });
    expect(ecritures()).toEqual([]);
    await repo.lireVentes('macj');
    expect(appels.map((x) => x.sql).join(' ')).not.toMatch(/transaction_partie|repartition|date_acte/);
  });
  it('une répartition ≠ 100 % est refusée AVANT toute écriture (la saisie reste à l’écran)', async () => {
    lotD.mockResolvedValue(true);
    reponses.push(comptes, periodes);
    const r = await repo.enregistrerDossier(null, dossier({ parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 60, montantHt: null },
      { sorte: 'sortie', compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] }), '2026-10-27', A);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motif).toMatch(/exactement 100 %/);
    expect(ecritures()).toEqual([]);
  });
  it('un compromis neuf : la vente, ses personnes, ses parties — la société FIGÉE à la date de la vente ; tout journalisé', async () => {
    lotD.mockResolvedValue(true);
    let id = 40;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    const r = await repo.enregistrerDossier(null, dossier(), '2026-10-27', A);
    expect(r).toEqual({ ok: true, valeur: 41 });
    const v = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_vente ('))!;
    expect(v.sql).toContain('repartition');
    expect(v.params).toContain('DUPONT / MARTIN');
    expect(v.params).toContain(2027); // l'année du prévisionnel : celle de l'acte prévu
    const parties = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_partie'));
    // Le compromis est du 20/10/2026 : Mylène était encore CRITERIMMO ce jour-là.
    expect(parties.map((x) => [x.params[1], x.params[2], x.params[4], x.params[7]])).toEqual([['entree', 5, 'criterimmo', 50], ['sortie', 7, 'criterimmo', 50]]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_personne'))).toHaveLength(2);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toEqual(['saisie', 'saisie', 'saisie', 'personnes', 'repartition']);
  });
  it('une personne déjà connue (même téléphone) est RÉUTILISÉE, jamais recréée', async () => {
    lotD.mockResolvedValue(true);
    reponses.push(comptes, periodes, (s) => (s.startsWith('SELECT id, nom, telephone, email, adresse FROM transaction_personne')
      ? { rows: [{ id: '3', nom: 'Paul DUPONT', telephone: '+33 6 12 34 56 78', email: null, adresse: null }] } : undefined),
    (s) => (s.includes('FROM transaction_personne WHERE id = $1 FOR UPDATE') ? { rows: [{ nom: 'Paul DUPONT', telephone: '+33 6 12 34 56 78', email: null, adresse: null, note: null, retire_le: null }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '50' }] } : undefined));
    await repo.enregistrerDossier(null, dossier(), '2026-10-27', A);
    const nouvelles = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_personne'));
    expect(nouvelles.map((x) => x.params[0])).toEqual(['MARTIN']);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_personne')).map((x) => x.params[1])).toContain(3);
  });
  it('« Acte signé » : vente encaissée au mois de l’acte ; « Revenir en compromis » le défait (journalisé)', async () => {
    lotD.mockResolvedValue(true);
    const ligne = { libelle: 'X', honoraires_ttc: '12000', statut: 'compromis', annee: 2027, mois_acte: null, date_compromis: '2026-10-20', apporteur: null, note: null, retire_le: null,
      attribution: null, adresse_bien: null, date_acte_prevue: '2027-01-15', date_acte: null, negociateur_entree_id: '5', negociateur_sortie_id: '7', apporteur_id: null, retro_apporteur_ttc: '0', repartition: true };
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [ligne] } : undefined), (s) => (s.includes('RETURNING id') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.acteSigne(41, '2026-12-18', A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.params).toEqual([41, 'vendue', 2026, '2026-12-01', '2026-12-18']);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!.params[2]).toBe('acte_signe');
    appels.length = 0;
    Object.assign(ligne, { statut: 'vendue', annee: 2026, mois_acte: '2026-12-01', date_acte: '2026-12-18' });
    expect(await repo.retourCompromis(41, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([41, 'compromis', null, 2027, null]);
    Object.assign(ligne, { statut: 'compromis' });
    expect((await repo.retourCompromis(41, A)).ok).toBe(false);
  });
  it('« Annuler » une répartition : l’ensemble posé est retiré, celui d’avant revient (jamais supprimé)', async () => {
    lotD.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '12', entite: 'vente', entite_id: '41', action: 'repartition', avant: { ids: [1, 2] }, apres: { ids: [3, 4, 5] }, deja: false }] } : undefined),
    (s) => (s.startsWith('SELECT id FROM transaction_partie WHERE vente_id') ? { rows: [{ id: '3' }, { id: '4' }, { id: '5' }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '13' }] } : undefined));
    expect(await repo.annulerGeste(12, A)).toEqual({ ok: true });
    const majs = appels.filter((x) => x.sql.startsWith('UPDATE transaction_partie'));
    expect(majs.map((x) => [x.sql.includes('retire_le = now()'), x.params[0]])).toEqual([[true, [3, 4, 5]], [false, [1, 2]]]);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect([j.params[2], j.params[6]]).toEqual(['repartition', 12]);
  });
});

describe('🔴 LOT E (435) — le prix de vente', () => {
  it('sans la 435 : la lecture ne nomme pas la colonne', async () => {
    await repo.lireVentes(null);
    expect(appels.map((x) => x.sql).join(' ')).not.toContain('prix_vente');
  });
  it('avec la 435 : lu, et modifié comme un champ de la vente (journalisé)', async () => {
    lotE.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'A', honoraires_ttc: '12000', statut: 'compromis', annee: 2026, mois_acte: null, date_compromis: null, apporteur: null, note: null, retire_le: null, attribution: null, prix_vente: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.modifierVente(5, { prixVente: 450000 }, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([5, 450000]);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!.params[4]).toBe(JSON.stringify({ prix_vente: 450000 }));
  });
});

describe('🔴 LOT F — compléter un compromis importé ne déplace aucun montant', () => {
  it('sans date : il garde son année ; sans apporteur de l’annuaire : il garde l’apporteur du fichier', async () => {
    lotD.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'HEIDIDON', honoraires_ttc: '4000', statut: 'compromis', annee: 2019, mois_acte: null, date_compromis: null, apporteur: 'Gardien Dacquet', note: null, retire_le: null,
        attribution: null, adresse_bien: null, date_acte_prevue: null, date_acte: null, negociateur_entree_id: null, negociateur_sortie_id: null, apporteur_id: null, retro_apporteur_ttc: null, repartition: false }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '70' }] } : undefined));
    const r = await repo.enregistrerDossier(12, { societe: 'criterimmo', statut: 'compromis', libelle: 'HEIDIDON', honorairesTtc: 4000, dateCompromis: null, dateActePrevue: null, dateActe: null,
      adresseBien: null, note: null, entreeId: null, sortieId: null, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const, prixVente: null, lignes: [], parties: [],
      personnes: [{ id: null, role: 'vendeur', nom: 'DUPONT', telephone: null, email: null, adresse: null }] }, '2026-10-27', A);
    expect(r.ok).toBe(true);
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'));
    expect(maj?.sql ?? '').not.toMatch(/annee|apporteur =|honoraires/);
  });
});

describe('🔴 LOT G (436) — annuler un compromis, le rétablir', () => {
  const ligne = (o: Record<string, unknown>) => ({ libelle: 'X', honoraires_ttc: '12000', statut: 'compromis', annee: 2027, mois_acte: null, date_compromis: null, apporteur: null, note: null,
    retire_le: null, attribution: null, annulation_date: null, annulation_motif: null, annulation_note: null, ...o });
  it('sans la 436 : refus avec le motif, rien n’est écrit', async () => {
    expect(await repo.annulerCompromis(41, { motif: 'Défaut de crédit', date: '2026-10-27', note: null }, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_436 });
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
  it('annulé : statut « annulee », motif, date, note — journalisé ; rétabli : de nouveau en cours', async () => {
    lotG.mockResolvedValue(true);
    let l = ligne({});
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [l] } : undefined), (s) => (s.includes('RETURNING id') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.annulerCompromis(41, { motif: 'Défaut de crédit', date: '2026-10-27', note: 'Refus de la banque.' }, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([41, 'annulee', '2026-10-27', 'Défaut de crédit', 'Refus de la banque.']);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!.params[2]).toBe('annulation_compromis');
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
    appels.length = 0;
    l = ligne({ statut: 'annulee', annulation_date: '2026-10-27', annulation_motif: 'Défaut de crédit', annulation_note: 'Refus de la banque.' });
    expect(await repo.retablirCompromis(41, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([41, 'compromis', null, null, null]);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!.params[2]).toBe('retablissement_compromis');
  });
  it('seul un compromis en cours s’annule ; seul un compromis annulé se rétablit', async () => {
    lotG.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FOR UPDATE') ? { rows: [ligne({ statut: 'vendue' })] } : undefined));
    expect((await repo.annulerCompromis(41, { motif: 'Défaut de crédit', date: '2026-10-27', note: null }, A)).ok).toBe(false);
    expect((await repo.retablirCompromis(41, A)).ok).toBe(false);
  });
});

describe('🔴 LOT I (437) — les commissions versées, en HT ou en TTC', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: null, honorairesTtc: 12000, dateCompromis: '2026-10-20',
    dateActePrevue: '2027-01-15', dateActe: null, adresseBien: null, note: null, entreeId: 5, sortieId: 7, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const,
    personnes: [{ id: null, role: 'vendeur' as const, nom: 'DUPONT', telephone: null, email: null, adresse: null }],
    parties: [{ sorte: 'entree' as const, compteId: 5, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie' as const, compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
    lignes: [], prixVente: null, ...o });
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY')
    ? { rows: [{ id: '5', nom: 'Jean-Baptiste PONS' }, { id: '7', nom: 'Mylène EBERLIN' }].filter((c) => (appels.at(-1)!.params[0] as number[]).includes(Number(c.id))) } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' },
    { compte_id: '7', societe: 'macj', depuis: '2000-01-01' }] } : undefined);
  const ecritures = () => appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql));
  const neuf = () => { let id = 40; reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined)); };

  it('sans la 437 : une saisie en HT (rétrocession ou commission) est refusée, rien n’est écrit ; la lecture ne nomme aucune colonne neuve', async () => {
    lotD.mockResolvedValue(true);
    expect(await repo.enregistrerDossier(null, dossier({ retroApporteurTtc: 500, retroUnite: 'ht' }), '2026-10-27', A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_437 });
    expect(await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 1000, unite: 'ttc' }, sortie: null } }), '2026-10-27', A))
      .toEqual({ ok: false, motif: repo.MOTIF_SANS_437 });
    expect(ecritures()).toEqual([]);
    await repo.lireVentes('criterimmo');
    expect(appels.map((x) => x.sql).join(' ')).not.toMatch(/l\.montant_ht|retro_apporteur_ht|l\.cote/);
  });

  it('commission d’entrée en HT, de sortie en TTC : chacune dans SON unité (une colonne, l’autre vide) ; journalisé en ensemble', async () => {
    lotD.mockResolvedValue(true); lotI.mockResolvedValue(true);
    neuf();
    const r = await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 1000, unite: 'ht' }, sortie: { montant: 1800, unite: 'ttc' } } }), '2026-10-27', A);
    expect(r.ok).toBe(true);
    const lignes = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne'));
    // [vente, négociateur, montant_ttc, montant_ht, côté]
    expect(lignes.map((x) => x.params.slice(1, 5))).toEqual([['Jean-Baptiste PONS', null, 1000, 'entree'], ['Mylène EBERLIN', 1800, null, 'sortie']]);
    expect(lignes[0].sql).toContain("'negociateur'");
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toContain('commissions');
  });

  it('le MÊME négociateur facture en HT sur une vente, en TTC sur une autre : le choix suit la commission, jamais la personne', async () => {
    lotD.mockResolvedValue(true); lotI.mockResolvedValue(true);
    neuf();
    await repo.enregistrerDossier(null, dossier({ sortieId: null, parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 100, montantHt: null }],
      commissions: { entree: { montant: 1000, unite: 'ht' }, sortie: null } }), '2026-10-27', A);
    neuf();
    await repo.enregistrerDossier(null, dossier({ sortieId: null, parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 100, montantHt: null }],
      commissions: { entree: { montant: 1200, unite: 'ttc' }, sortie: null } }), '2026-10-27', A);
    const lignes = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne')).map((x) => x.params.slice(1, 4));
    expect(lignes).toEqual([['Jean-Baptiste PONS', null, 1000], ['Jean-Baptiste PONS', 1200, null]]);
  });

  it('la rétrocession de l’apporteur en HT : `retro_apporteur_ht`, la colonne TTC vide ; la répartition déduit son équivalent TTC', async () => {
    lotD.mockResolvedValue(true); lotI.mockResolvedValue(true);
    neuf();
    expect((await repo.enregistrerDossier(null, dossier({ retroApporteurTtc: 2000, retroUnite: 'ht' }), '2026-10-27', A)).ok).toBe(true);
    const v = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_vente ('))!;
    const cols = v.sql.slice(v.sql.indexOf('cree_par_libelle, ') + 18, v.sql.indexOf(')')).split(', ');
    const val = (c: string) => v.params[3 + cols.indexOf(c)];
    expect([val('retro_apporteur_ttc'), val('retro_apporteur_ht')]).toEqual([null, 2000]);
    // 2 000 HT = 2 400 TTC > la commission ? non (12 000) ; une rétrocession HT qui la dépasse est refusée sur son équivalent TTC.
    appels.length = 0;
    const r = await repo.enregistrerDossier(null, dossier({ retroApporteurTtc: 10500, retroUnite: 'ht' }), '2026-10-27', A);
    expect(r.ok ? '' : r.motif).toMatch(/dépasse la commission/);
  });

  it('une saisie qui ne parle pas des commissions (formulaire d’avant) ne touche à aucune ligne ; une commission sans négociateur est refusée', async () => {
    lotD.mockResolvedValue(true); lotI.mockResolvedValue(true);
    neuf();
    await repo.enregistrerDossier(null, dossier(), '2026-10-27', A);
    expect(appels.some((x) => x.sql.includes('transaction_vente_ligne'))).toBe(false);
    appels.length = 0;
    const r = await repo.enregistrerDossier(null, dossier({ sortieId: null, parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 100, montantHt: null }],
      commissions: { entree: null, sortie: { montant: 500, unite: 'ht' } } }), '2026-10-27', A);
    expect(r.ok ? '' : r.motif).toMatch(/négociateur de sortie/);
    expect(ecritures()).toEqual([]);
  });

  it('lecture : une ligne d’avant (TTC, sans côté) reste TELLE QUELLE ; une ligne en HT garde son montant saisi et son équivalent TTC', async () => {
    lotD.mockResolvedValue(true); lotI.mockResolvedValue(true);
    reponses.push((s) => (s.startsWith('SELECT v.id') ? { rows: [{ id: '41', societe: 'macj', libelle: 'X', honoraires_ttc: '12000', statut: 'compromis', annee: 2027, mois_acte: null,
      date_compromis: null, apporteur: null, note: null, origine: 'import', source_fichier: null, source_onglet: null, source_ligne: null, double_cle: null, attribution: null,
      adresse_bien: null, date_acte_prevue: null, date_acte: null, negociateur_entree_id: null, negociateur_sortie_id: null, apporteur_id: null,
      retro_apporteur_ttc: '2400', retro_apporteur_ht: null, repartition: false }] } : undefined),
    (s) => (s.startsWith('SELECT l.id') ? { rows: [
      { id: '1', vente_id: '41', negociateur: 'MYLENE', role: 'negociateur', montant_ttc: '3215', nature: 'vente', compte: false, origine: 'import', cote: null, montant_ht: null },
      { id: '2', vente_id: '41', negociateur: 'MYLENE', role: 'negociateur', montant_ttc: null, nature: 'compromis', compte: false, origine: 'saisie', cote: 'entree', montant_ht: '1000' }] } : undefined));
    const [v] = await repo.lireVentes('macj');
    expect(v.lignes[0]).toMatchObject({ montantTtc: 3215, montantHt: null, cote: null });
    expect(v.lignes[1]).toMatchObject({ montantTtc: 1200, montantHt: 1000, cote: 'entree' });
    expect(v.retroApporteur).toEqual({ montant: 2400, unite: 'ttc' });
  });
});

describe('🔴 LOT I — « Annuler » les commissions versées', () => {
  it('l’ensemble posé est retiré, celui d’avant revient — seulement parmi les lignes à côté (les lignes importées ne sont jamais touchées)', async () => {
    lotD.mockResolvedValue(true); lotI.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '20', entite: 'vente', entite_id: '41', action: 'commissions', avant: { ids: [] }, apres: { ids: [8, 9] }, deja: false }] } : undefined),
    (s) => (s.startsWith('SELECT id FROM transaction_vente_ligne WHERE vente_id') ? { rows: [{ id: '8' }, { id: '9' }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '21' }] } : undefined));
    expect(await repo.annulerGeste(20, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('SELECT id FROM transaction_vente_ligne'))!.sql).toContain('cote IS NOT NULL');
    const majs = appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente_ligne'));
    expect(majs.map((x) => x.params[0])).toEqual([[8, 9], []]);
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });
});

describe('🔴 LOT K — collaborateur des deux sociétés : la société se choisit SUR LA VENTE', () => {
  const dossier = (parties: unknown[]) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: null, honorairesTtc: 12000, dateCompromis: '2026-10-20',
    dateActePrevue: null, dateActe: null, adresseBien: null, note: null, entreeId: 9, sortieId: 5, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const,
    personnes: [{ id: null, role: 'vendeur' as const, nom: 'DUPONT', telephone: null, email: null, adresse: null }], parties: parties as never, lignes: [], prixVente: null });
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY') ? { rows: [{ id: '9', nom: 'Cédric JULLIEN' }, { id: '5', nom: 'Jean-Baptiste PONS' }] } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '9', societe: 'les_deux', depuis: '2000-01-01' }, { compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' }] } : undefined);
  const pa = (sorte: string, compteId: number, societe: string | null) => ({ sorte, compteId, nom: null, coordonnees: null, pourcentage: 50, montantHt: null, societe });
  beforeEach(() => { lotD.mockResolvedValue(true); });

  it('sans société choisie : refus clair AVANT toute écriture', async () => {
    reponses.push(comptes, periodes);
    const r = await repo.enregistrerDossier(null, dossier([pa('entree', 9, null), pa('sortie', 5, null)]), '2026-10-28', A);
    expect(r.ok ? '' : r.motif).toMatch(/Cédric JULLIEN travaille pour CRITERIMMO et pour MACJ : choisissez .* \(entrée du mandat\)/);
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
  it('la société choisie est FIGÉE sur sa partie ; un compte à une société garde la sienne (ce que l’écran envoie est ignoré)', async () => {
    let id = 40;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    expect((await repo.enregistrerDossier(null, dossier([pa('entree', 9, 'macj'), pa('sortie', 5, 'macj')]), '2026-10-28', A)).ok).toBe(true);
    const parties = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_partie'));
    expect(parties.map((x) => [x.params[2], x.params[4]])).toEqual([[9, 'macj'], [5, 'criterimmo']]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toContain('repartition');
  });
});

describe('🔴 LOT P (439) — le statut du négociateur FIGÉ sur la vente ; un observateur n’est jamais négociateur', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: null, honorairesTtc: 12000, dateCompromis: '2026-10-20',
    dateActePrevue: null, dateActe: null, adresseBien: null, note: null, entreeId: 5, sortieId: 7, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const,
    personnes: [{ id: null, role: 'vendeur' as const, nom: 'DUPONT', telephone: null, email: null, adresse: null }],
    parties: [{ sorte: 'entree' as const, compteId: 5, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie' as const, compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
    lignes: [], prixVente: null, ...o });
  let statuts: Record<string, string | null> = {};
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY')
    ? { rows: [{ id: '5', nom: 'Jean-Baptiste PONS', statut: statuts['5'] ?? null }, { id: '7', nom: 'Mylène EBERLIN', statut: statuts['7'] ?? null }] } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '7', societe: 'criterimmo', depuis: '2000-01-01' }] } : undefined);
  beforeEach(() => { lotD.mockResolvedValue(true); lotP.mockResolvedValue(true); statuts = { '5': 'independant', '7': 'salarie' }; });
  const insertsParties = () => appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_partie')).map((x) => [x.params[2], x.params[11]]);

  it('un compromis neuf : chaque partie porte le statut de son négociateur au moment de l’enregistrement', async () => {
    let id = 40;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    expect((await repo.enregistrerDossier(null, dossier(), '2026-10-28', A)).ok).toBe(true);
    expect(insertsParties()).toEqual([[5, 'independant'], [7, 'salarie']]);
  });
  it('un changement de statut ULTÉRIEUR ne touche pas la vente : le statut déjà figé reste (Mylène, devenue indépendante, reste « salarié »)', async () => {
    statuts = { '5': 'independant', '7': 'independant' };
    reponses.push(comptes, periodes,
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'X', honoraires_ttc: '12000', statut: 'compromis', annee: 2026, mois_acte: null, date_compromis: '2026-10-20',
        apporteur: null, note: null, retire_le: null, attribution: null, repartition: true, negociateur_entree_id: '5', negociateur_sortie_id: '7' }] } : undefined),
      (s) => (s.startsWith('SELECT compte_id, statut FROM transaction_partie') ? { rows: [{ compte_id: '5', statut: 'independant' }, { compte_id: '7', statut: 'salarie' }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '90' }] } : undefined));
    // la répartition change (60/40) : les parties sont reposées, chacune avec son statut FIGÉ
    expect((await repo.enregistrerDossier(41, dossier({ parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 60, montantHt: null },
      { sorte: 'sortie', compteId: 7, nom: null, coordonnees: null, pourcentage: 40, montantHt: null }] }), '2026-10-28', A)).ok).toBe(true);
    expect(insertsParties()).toEqual([[5, 'independant'], [7, 'salarie']]);
  });
  it('un observateur proposé comme négociateur (saisie forgée) : refus clair, rien n’est écrit', async () => {
    statuts = { '5': 'independant', '7': 'observateur' };
    reponses.push(comptes, periodes);
    const r = await repo.enregistrerDossier(null, dossier(), '2026-10-28', A);
    expect(r.ok ? '' : r.motif).toMatch(/Mylène EBERLIN est observateur \(lecture seule\) : il ne peut pas être négociateur/);
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
  it('la liste des négociateurs exclut les observateurs (et la lecture des parties lit le statut figé ET celui du compte)', async () => {
    await repo.lireNegociateurs('2026-10-28');
    expect(appels[0].sql).toContain("coalesce(to_jsonb(u) ->> 'statut', '') <> 'observateur'");
    appels.length = 0;
    reponses.push((s) => (s.startsWith('SELECT v.id') ? { rows: [{ id: '41', societe: 'criterimmo', libelle: 'X', honoraires_ttc: '12000', statut: 'compromis', annee: 2027, mois_acte: null,
      date_compromis: null, apporteur: null, note: null, origine: 'saisie', source_fichier: null, source_onglet: null, source_ligne: null, double_cle: null, attribution: null, repartition: true }] } : undefined),
    (s) => (s.startsWith('SELECT p.vente_id') ? { rows: [{ vente_id: '41', sorte: 'entree', compte_id: '5', negociateur_libelle: 'JB', societe: 'criterimmo', nom: null, coordonnees: null,
      pourcentage: '100', montant_ht: null, statut: null, statut_compte: 'associe' }] } : undefined));
    const [v] = await repo.lireVentes('criterimmo');
    expect(v.repartition!.parties[0]).toMatchObject({ statut: null, statutCompte: 'associe' });
  });
});

describe('🔴 LOT Q — le statut ACTUEL du compte rapproché d’un négociateur importé', () => {
  it('nom complet ou prénom d’UN SEUL compte → son statut ; plusieurs comptes ou aucun → null (non déduit, signalé)', async () => {
    reponses.push((s) => (s.includes('SELECT id::text, identifiant, prenom, nom FROM admin_utilisateur') ? { rows: [
      { id: '2', identifiant: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel' }, { id: '4', identifiant: 'arnaud.jorel@gmail.com', prenom: 'Augustin', nom: 'Jorel' },
      { id: '5', identifiant: 'jb.pons@sansvisavis.com', prenom: 'Jean-Baptiste', nom: 'PONS' }] } : undefined),
    (s) => (s.includes("to_jsonb(u) ->> 'statut' AS statut FROM admin_utilisateur u WHERE u.id = ANY") ? { rows: [{ id: '2', statut: 'associe' }, { id: '4', statut: null }, { id: '5', statut: 'salarie' }] } : undefined));
    const t = await repo.lireStatutsNegociateurs(['ARNAUD', 'Jean-Baptiste PONS', 'Jean Baptiste', 'MYLENE', 'Augustin Jorel', 'ARNAUD']);
    expect(t).toEqual({ ARNAUD: 'associe', 'Jean-Baptiste PONS': 'salarie', 'Jean Baptiste': 'salarie', MYLENE: null, 'Augustin Jorel': null });
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
});

describe('🔴 LOT R (440) — l’inter-cabinet : le registre des lignes miroir, la rémunération d’un côté', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: 'HEIDIDON', honorairesTtc: 4000, dateCompromis: '2026-10-20',
    dateActePrevue: null, dateActe: null, adresseBien: null, note: null, entreeId: 2, sortieId: 8, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const,
    personnes: [], parties: [{ sorte: 'entree' as const, compteId: 2, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie' as const, compteId: 8, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
    lignes: [], prixVente: null, ...o });
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY') ? { rows: [{ id: '2', nom: 'Arnaud Jorel' }, { id: '8', nom: 'Pierre Thevenin' }] } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '2', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '8', societe: 'macj', depuis: '2026-10-28' }] } : undefined);
  /** La vente telle que la synchronisation la relit (dans la transaction du geste). */
  const relue = (parties: Record<string, unknown>[], registre: Record<string, unknown>[] = []) => [
    (s: string) => (s.startsWith('SELECT id, societe, honoraires_ttc, retro_apporteur_ttc') ? { rows: [{ id: '38', societe: 'criterimmo', honoraires_ttc: '4000', retro_apporteur_ttc: '0', retro_apporteur_ht: null, repartition: true, retire_le: null }] } : undefined),
    (s: string) => (s.includes('FROM transaction_partie WHERE vente_id = $1 AND retire_le IS NULL ORDER BY rang') ? { rows: parties } : undefined),
    (s: string) => (s.includes('FROM transaction_inter_cabinet WHERE vente_id = $1') ? { rows: registre } : undefined)];
  const P = (sorte: string, id: string, nom: string, societe: string, pct: string) => ({ sorte, compte_id: id, negociateur_libelle: nom, societe, nom: null, coordonnees: null, pourcentage: pct, montant_ht: null });
  const journal = () => appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2]);
  beforeEach(() => { lotD.mockResolvedValue(true); lotI.mockResolvedValue(true); lotR.mockResolvedValue(true); });

  it('HEIDIDON enregistrée : la ligne miroir de MACJ est CRÉÉE au registre (part 1 666,67 HT, 50 %), journalisée ; le taux de rémunération s’enregistre', async () => {
    let id = 37;
    reponses.push(comptes, periodes, ...relue([P('entree', '2', 'Arnaud Jorel', 'criterimmo', '50'), P('sortie', '8', 'Pierre Thevenin', 'macj', '50')]),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    const r = await repo.enregistrerDossier(null, dossier({ commissions: { entree: null, sortie: { montant: 1000, unite: 'ttc' }, taux: { entree: null, sortie: 50 } } }), '2026-10-28', A);
    expect(r.ok).toBe(true);
    const ic = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_inter_cabinet'))!;
    expect(ic.params.slice(0, 3)).toEqual([38, 'macj', 'criterimmo']);
    expect(ic.params[3]).toBeCloseTo(4000 / 1.2 / 2, 9);
    expect(ic.params[4]).toBe(50);
    expect(journal()).toContain('inter_cabinet');
    const l = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne') && x.sql.includes('taux'))!;
    expect(l.params.at(-1)).toBe(50);
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });
  it('Pierre remplacé par un négociateur CRITERIMMO : la ligne miroir est ANNULÉE (jamais supprimée) ; il revient : RÉTABLIE (jamais un doublon)', async () => {
    const actif = { vente_id: '38', societe: 'macj', porteuse: 'criterimmo', part_ht: String(4000 / 1.2 / 2), pourcentage: '50', etat: 'active', le: null };
    reponses.push(...relue([P('entree', '2', 'Arnaud Jorel', 'criterimmo', '50'), P('sortie', '5', 'Jean-Baptiste PONS', 'criterimmo', '50')], [actif]),
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ statut: 'compromis', retire_le: null, annee: 2026 }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.modifierVente(38, { note: 'x' }, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_inter_cabinet'))!;
    expect(maj.sql).toContain("etat = 'annulee'");
    expect(maj.params).toEqual([38, 'macj']);
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
    appels.length = 0; reponses = [];
    reponses.push(...relue([P('entree', '2', 'Arnaud Jorel', 'criterimmo', '50'), P('sortie', '8', 'Pierre Thevenin', 'macj', '50')], [{ ...actif, etat: 'annulee' }]),
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ statut: 'compromis', retire_le: null, annee: 2026 }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '10' }] } : undefined));
    await repo.modifierVente(38, { note: 'y' }, A);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_inter_cabinet'))).toEqual([]);
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_inter_cabinet'))!.sql).toContain("etat = 'active'");
  });
  it('« Appliquer le calcul » / la rémunération d’un côté : seul ce côté change, sur la vente d’origine ; l’autre côté est gardé tel quel ; journalisé', async () => {
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ statut: 'compromis', retire_le: null, negociateur_entree_id: '2', negociateur_sortie_id: '8' }] } : undefined),
      (s) => (s.includes('FROM admin_utilisateur WHERE id = $1') ? { rows: [{ nom: 'Pierre Thevenin' }] } : undefined),
      (s) => (s.includes('cote IS NOT NULL ORDER BY id') && s.startsWith('SELECT cote') ? { rows: [{ cote: 'entree', negociateur: 'Arnaud Jorel', montant_ttc: '2000', montant_ht: null, taux: null },
        { cote: 'sortie', negociateur: 'Pierre Thevenin', montant_ttc: '2000', montant_ht: null, taux: null }] } : undefined),
      (() => { let n = 0; return (s: string) => (s.startsWith('SELECT id FROM transaction_vente_ligne') ? { rows: n++ === 0 ? [{ id: '443' }, { id: '444' }] : [{ id: '450' }, { id: '451' }] } : undefined); })(),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '450' }] } : undefined));
    expect(await repo.enregistrerCommissionCote(38, 'sortie', { montant: 1000, unite: 'ttc' }, 50, A)).toEqual({ ok: true });
    const poses = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne'));
    // [négociateur, montant_ttc, montant_ht, côté] puis le taux
    expect(poses.map((x) => [...x.params.slice(1, 5), x.params.at(-1)])).toEqual([['Arnaud Jorel', 2000, null, 'entree', null], ['Pierre Thevenin', 1000, null, 'sortie', 50]]);
    expect(journal()).toEqual(['commissions']);
    expect(await repo.enregistrerCommissionCote(38, 'sortie', { montant: -1, unite: 'ttc' }, 50, A)).toMatchObject({ ok: false });
  });
  it('« Annuler » refuse de défaire une ligne miroir seule : elle suit la vente d’origine', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1') ? { rows: [{ id: '70', entite: 'vente', entite_id: '38', action: 'inter_cabinet', avant: null, apres: {}, deja: false }] } : undefined));
    const r = await repo.annulerGeste(70, A);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? '' : r.motif).toMatch(/suit la vente d’origine/);
  });
  it('lire MACJ : la vente portée par CRITERIMMO devient sa LIGNE MIROIR (sa seule part) ; le registre est lu', async () => {
    reponses.push(
      (s) => (s.startsWith('SELECT v.id, v.societe') ? { rows: [{ id: '38', societe: 'criterimmo', libelle: 'HEIDIDON', honoraires_ttc: '4000', statut: 'compromis', annee: 2026, mois_acte: null,
        date_compromis: null, apporteur: null, note: null, origine: 'import', source_fichier: null, source_onglet: null, source_ligne: null, double_cle: null, attribution: null,
        adresse_bien: null, date_acte_prevue: null, date_acte: null, negociateur_entree_id: '2', negociateur_sortie_id: '8', apporteur_id: null, retro_apporteur_ttc: '0', repartition: true,
        entree_nom: 'Arnaud Jorel', sortie_nom: 'Pierre Thevenin' }] } : undefined),
      (s) => (s.startsWith('SELECT l.id, l.vente_id') ? { rows: [{ id: '444', vente_id: '38', negociateur: 'Pierre Thevenin', role: 'negociateur', montant_ttc: '2000', nature: 'compromis', compte: false,
        origine: 'saisie', source_fichier: null, source_onglet: null, source_ligne: null, note: null, cote: 'sortie', montant_ht: null, taux: null }] } : undefined),
      (s) => (s.startsWith('SELECT p.vente_id, p.sorte') ? { rows: [{ vente_id: '38', ...P('entree', '2', 'Arnaud Jorel', 'criterimmo', '50') }, { vente_id: '38', ...P('sortie', '8', 'Pierre Thevenin', 'macj', '50') }] } : undefined));
    const [m] = await repo.lireVentes('macj');
    expect(m.libelle).toBe('HEIDIDON — inter-cabinet reçu de CRITERIMMO');
    expect(m.honorairesTtc).toBeCloseTo(2000, 9);
    expect(m.miroir).toMatchObject({ origineId: 38, porteuse: 'criterimmo' });
    expect(appels.some((x) => x.sql.includes('transaction_inter_cabinet ic'))).toBe(true);
    expect(appels.some((x) => x.sql.includes('FROM transaction_inter_cabinet WHERE societe = $1'))).toBe(true);
  });
});

describe('🔴 LOT S (441) — un administrateur NON COMMISSIONNÉ sur une vente', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: 'HEIDIDON', honorairesTtc: 4000, dateCompromis: '2026-10-20',
    dateActePrevue: null, dateActe: null, adresseBien: null, note: null, entreeId: 2, sortieId: 8, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const,
    personnes: [], parties: [{ sorte: 'entree' as const, compteId: 2, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie' as const, compteId: 8, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
    lignes: [], prixVente: null, ...o });
  // Arnaud : administrateur NON commissionné ; Pierre : collaborateur (toujours commissionné, même avec une valeur égarée en base).
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY')
    ? { rows: [{ id: '2', nom: 'Arnaud Jorel', role: 'administrateur', commissionne: 'false' }, { id: '8', nom: 'Pierre Thevenin', role: 'collaborateur', commissionne: 'false' }] } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '2', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '8', societe: 'macj', depuis: '2000-01-01' }] } : undefined);
  beforeEach(() => { lotD.mockResolvedValue(true); lotI.mockResolvedValue(true); lotS.mockResolvedValue(true); });

  it('à l’enregistrement, le choix est FIGÉ sur chaque partie (Arnaud : non ; Pierre, collaborateur : oui) ; aucune commission neuve pour Arnaud', async () => {
    let id = 50;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    const r = await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 1000, unite: 'ttc' }, sortie: { montant: 1000, unite: 'ttc' } } }), '2026-10-28', A);
    expect(r.ok).toBe(true);
    const parties = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_partie'));
    expect(parties.every((x) => x.sql.includes('commissionne'))).toBe(true);
    expect(parties.map((x) => [x.params[2], x.params.at(-1)])).toEqual([[2, false], [8, true]]);
    const lignes = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne'));
    expect(lignes.map((x) => [x.params[1], x.params[2], x.params[4]])).toEqual([['Pierre Thevenin', 1000, 'sortie']]);
  });
  it('une vente existante : sa commission déjà saisie (2 000 €) reste TELLE QUELLE, quoi que l’écran envoie ; rien n’est retiré ni réécrit pour elle', async () => {
    reponses.push(comptes, periodes,
      (s) => (s.includes('FROM transaction_partie WHERE vente_id = $1 AND retire_le IS NULL AND compte_id IS NOT NULL AND commissionne IS NOT NULL') ? { rows: [] } : undefined),
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'HEIDIDON', honoraires_ttc: 4000, statut: 'compromis', annee: 2026, retire_le: null }] } : undefined),
      (s) => (s.startsWith('SELECT cote, negociateur, montant_ttc, montant_ht FROM transaction_vente_ligne WHERE vente_id = $1')
        ? { rows: [{ cote: 'entree', negociateur: 'Arnaud Jorel', montant_ttc: '2000', montant_ht: null }, { cote: 'sortie', negociateur: 'Pierre Thevenin', montant_ttc: '1000', montant_ht: null }] } : undefined),
      (s) => (s.startsWith('SELECT id FROM transaction_vente_ligne') ? { rows: [{ id: '445' }, { id: '446' }] } : undefined),
      (s) => (s.startsWith('SELECT cote, negociateur, montant_ttc, montant_ht FROM transaction_vente_ligne WHERE id = ANY')
        ? { rows: [{ cote: 'entree', negociateur: 'Arnaud Jorel', montant_ttc: '2000', montant_ht: null }, { cote: 'sortie', negociateur: 'Pierre Thevenin', montant_ttc: '1000', montant_ht: null }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '60' }] } : undefined));
    // l'écran (forgé) envoie 1 € pour Arnaud : ignoré ; la commission de Pierre, inchangée
    const r = await repo.enregistrerDossier(38, dossier({ commissions: { entree: { montant: 1, unite: 'ttc' }, sortie: { montant: 1000, unite: 'ttc' } } }), '2026-10-28', A);
    expect(r.ok).toBe(true);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne'))).toEqual([]);
    expect(appels.some((x) => x.sql.startsWith('UPDATE transaction_vente_ligne'))).toBe(false);
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });
  it('« Appliquer le calcul » / rémunération d’un côté non commissionné : refusée, rien n’est écrit', async () => {
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ statut: 'compromis', retire_le: null, negociateur_entree_id: '2', negociateur_sortie_id: '8' }] } : undefined),
      (s) => (s.includes('FROM admin_utilisateur WHERE id = $1') ? { rows: [{ nom: 'Arnaud Jorel', role: 'administrateur', commissionne: 'false' }] } : undefined));
    const r = await repo.enregistrerCommissionCote(38, 'entree', { montant: 1000, unite: 'ttc' }, 50, A);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? '' : r.motif).toMatch(/n’est pas commissionné sur cette vente/);
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
  it('lecture : la partie porte le choix figé et celui du compte (un collaborateur : toujours commissionné)', async () => {
    reponses.push(
      (s) => (s.startsWith('SELECT v.id, v.societe') ? { rows: [{ id: '38', societe: 'criterimmo', libelle: 'HEIDIDON', honoraires_ttc: '4000', statut: 'compromis', annee: 2026, repartition: true,
        negociateur_entree_id: '2', negociateur_sortie_id: '8', retro_apporteur_ttc: '0', origine: 'import' }] } : undefined),
      (s) => (s.startsWith('SELECT p.vente_id, p.sorte') ? { rows: [
        { vente_id: '38', sorte: 'entree', compte_id: '2', negociateur_libelle: 'Arnaud Jorel', societe: 'criterimmo', pourcentage: '50', commissionne: null, commissionne_compte: 'administrateur:false' },
        { vente_id: '38', sorte: 'sortie', compte_id: '8', negociateur_libelle: 'Pierre Thevenin', societe: 'macj', pourcentage: '50', commissionne: null, commissionne_compte: 'collaborateur:false' }] } : undefined));
    const [v] = await repo.lireVentes(null);
    expect(v.repartition!.parties.map((p) => [p.negociateur, p.commissionne, p.commissionneCompte])).toEqual([['Arnaud Jorel', null, false], ['Pierre Thevenin', null, true]]);
  });
});

describe('🔴 LOT V (442) — une commission CALCULÉE suit le calcul ; une commission SAISIE À LA MAIN reste telle quelle', () => {
  // « Location ? » : 7 500 TTC, apporteur 1 000 TTC (base 6 500 TTC) ; JB (5) à l'entrée, Mylène (7) à la sortie, taux 25 % à la sortie.
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: 'Location ?', honorairesTtc: 7500, dateCompromis: '2026-10-20',
    dateActePrevue: null, dateActe: null, adresseBien: null, note: null, entreeId: 5, sortieId: 7, apporteurId: null, apporteurNom: null, retroApporteurTtc: 1000, retroUnite: 'ttc' as const,
    personnes: [], parties: [{ sorte: 'entree' as const, compteId: 5, nom: null, coordonnees: null, pourcentage: 70, montantHt: null }, { sorte: 'sortie' as const, compteId: 7, nom: null, coordonnees: null, pourcentage: 30, montantHt: null }],
    lignes: [], prixVente: null, ...o });
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY')
    ? { rows: [{ id: '5', nom: 'Jean-Baptiste PONS', role: 'collaborateur' }, { id: '7', nom: 'Mylène EBERLIN', role: 'collaborateur' }] } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '7', societe: 'criterimmo', depuis: '2000-01-01' }] } : undefined);
  const lignesPosees = () => appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_ligne')).map((x) => ({ nego: x.params[1], ttc: x.params[2], ht: x.params[3], cote: x.params[4], taux: x.params[7], mode: x.params[8] }));
  beforeEach(() => { lotD.mockResolvedValue(true); lotI.mockResolvedValue(true); lotR.mockResolvedValue(true); lotV.mockResolvedValue(true); });

  it('calculée : le SERVEUR calcule (honoraires du côté × taux), quoi que l’écran envoie ; le mode est enregistré', async () => {
    let id = 70;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    const r = await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 1, unite: 'ttc' }, sortie: { montant: 1, unite: 'ht' },
      taux: { entree: null, sortie: 25 }, mode: { entree: 'calculee', sortie: 'calculee' } } }), '2026-10-29', A);
    expect(r.ok).toBe(true);
    // 6 500 × 70 % × 50 % = 2 275 TTC ; 6 500 × 30 % × 25 % = 487,50 TTC, dans l'unité choisie (HT : 406,25), sans arrondi
    const [e, s] = lignesPosees();
    expect([e.nego, e.ttc, e.ht, e.cote, e.taux, e.mode]).toEqual(['Jean-Baptiste PONS', 2275, null, 'entree', null, 'calculee']);
    expect([s.ttc, s.ht, s.cote, s.taux, s.mode]).toEqual([null, 487.5 / 1.2, 'sortie', 25, 'calculee']);
  });

  it('saisie à la main : le montant tapé, tel quel ; le mode « manuelle » enregistré', async () => {
    let id = 70;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 2275, unite: 'ttc' }, sortie: { montant: 1625, unite: 'ttc' },
      taux: { entree: null, sortie: 25 }, mode: { entree: 'calculee', sortie: 'manuelle' } } }), '2026-10-29', A);
    expect(lignesPosees().map((l) => [l.cote, l.ttc, l.mode])).toEqual([['entree', 2275, 'calculee'], ['sortie', 1625, 'manuelle']]);
  });

  it('un écran d’avant ce lot (sans mode) : le montant envoyé, comme avant ; sans la 442 : le calcul se fait, aucune colonne neuve n’est nommée', async () => {
    let id = 70;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 1000, unite: 'ttc' }, sortie: null, taux: { entree: null, sortie: null } } }), '2026-10-29', A);
    expect(lignesPosees().map((l) => [l.cote, l.ttc, l.mode])).toEqual([['entree', 1000, null]]);
    appels.length = 0; lotV.mockResolvedValue(false);
    await repo.enregistrerDossier(null, dossier({ commissions: { entree: { montant: 1, unite: 'ttc' }, sortie: null, taux: { entree: null, sortie: null }, mode: { entree: 'calculee', sortie: null } } }), '2026-10-29', A);
    expect(appels.some((x) => x.sql.includes('mode_commission'))).toBe(false);
    expect(lignesPosees().map((l) => [l.cote, l.ttc])).toEqual([['entree', 2275]]);
  });

  it('une vente existante passée de 60/40 à 70/30 : la commission calculée est recalculée et enregistrée, « recalculée suite à : changement de la répartition »', async () => {
    reponses.push(comptes, periodes,
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'Location ?', honoraires_ttc: 7500, statut: 'compromis', annee: 2026, retire_le: null,
        apporteur_id: null, retro_apporteur_ttc: 1000, retro_apporteur_ht: null }] } : undefined),
      (s) => (s.startsWith('SELECT id FROM transaction_partie') ? { rows: [{ id: '90' }, { id: '91' }] } : undefined),
      (s) => (s.startsWith('SELECT sorte, compte_id') ? { rows: [
        { sorte: 'entree', compte_id: '5', negociateur_libelle: 'Jean-Baptiste PONS', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: '60', montant_ht: null },
        { sorte: 'sortie', compte_id: '7', negociateur_libelle: 'Mylène EBERLIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: '40', montant_ht: null }] } : undefined),
      (s) => (s.startsWith('SELECT cote') && s.includes('FROM transaction_vente_ligne WHERE vente_id = $1 AND retire_le IS NULL AND cote IS NOT NULL')
        ? { rows: [{ cote: 'entree', negociateur: 'Jean-Baptiste PONS', montant_ttc: '1950', montant_ht: null, taux: null, mode_commission: null },
          { cote: 'sortie', negociateur: 'Mylène EBERLIN', montant_ttc: '650', montant_ht: null, taux: '25', mode_commission: null }] } : undefined),
      (s) => (s.startsWith('SELECT id FROM transaction_vente_ligne') ? { rows: [{ id: '449' }, { id: '450' }] } : undefined),
      (s) => (s.includes('FROM transaction_vente_ligne WHERE id = ANY')
        ? { rows: [{ cote: 'entree', negociateur: 'Jean-Baptiste PONS', montant_ttc: '1950', montant_ht: null, taux: null, mode_commission: null },
          { cote: 'sortie', negociateur: 'Mylène EBERLIN', montant_ttc: '650', montant_ht: null, taux: '25', mode_commission: null }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '95' }] } : undefined));
    const r = await repo.enregistrerDossier(37, dossier({ commissions: { entree: { montant: 1950, unite: 'ttc' }, sortie: { montant: 650, unite: 'ttc' },
      taux: { entree: null, sortie: 25 }, mode: { entree: 'calculee', sortie: 'calculee' } } }), '2026-10-29', A);
    expect(r.ok).toBe(true);
    // 6 500 × 70 % × 50 % = 2 275 ; 6 500 × 30 % × 25 % = 487,50 (le constat d'Arno : le calcul 487,50, plus jamais 650 resté dans le champ)
    expect(lignesPosees().map((l) => [l.cote, l.ttc, l.taux, l.mode])).toEqual([['entree', 2275, null, 'calculee'], ['sortie', 487.5, 25, 'calculee']]);
    // rien n'est effacé : les lignes d'avant sont RETIRÉES (retire_le), journalisées avec la cause
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
    expect(appels.some((x) => x.sql.startsWith('UPDATE transaction_vente_ligne SET retire_le = now()') && JSON.stringify(x.params[0]) === JSON.stringify([449, 450]))).toBe(true);
    const journal = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal') && x.params[2] === 'commissions');
    expect(String(journal.at(-1)?.params[5])).toMatch(/^Commissions recalculées suite à : changement de la répartition — Commissions versées : entrée Jean-Baptiste PONS 2275 € TTC/);
  });

  it('le taux changé (Mylène 25 % → 40 %), la commission de la vente changée : les causes sont dites', async () => {
    reponses.push(comptes, periodes,
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'Location ?', honoraires_ttc: 7000, statut: 'compromis', annee: 2026, retire_le: null,
        apporteur_id: null, retro_apporteur_ttc: 1000, retro_apporteur_ht: null }] } : undefined),
      (s) => (s.startsWith('SELECT id FROM transaction_partie') ? { rows: [{ id: '90' }, { id: '91' }] } : undefined),
      (s) => (s.startsWith('SELECT sorte, compte_id') ? { rows: [
        { sorte: 'entree', compte_id: '5', negociateur_libelle: 'Jean-Baptiste PONS', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: '70', montant_ht: null },
        { sorte: 'sortie', compte_id: '7', negociateur_libelle: 'Mylène EBERLIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: '30', montant_ht: null }] } : undefined),
      (s) => (s.startsWith('SELECT cote') && s.includes('FROM transaction_vente_ligne WHERE vente_id = $1 AND retire_le IS NULL AND cote IS NOT NULL')
        ? { rows: [{ cote: 'sortie', negociateur: 'Mylène EBERLIN', montant_ttc: '450', montant_ht: null, taux: '25', mode_commission: 'calculee' }] } : undefined),
      (s) => (s.startsWith('SELECT id FROM transaction_vente_ligne') ? { rows: [{ id: '450' }] } : undefined),
      (s) => (s.includes('FROM transaction_vente_ligne WHERE id = ANY') ? { rows: [{ cote: 'sortie', negociateur: 'Mylène EBERLIN', montant_ttc: '450', montant_ht: null, taux: '25', mode_commission: 'calculee' }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '95' }] } : undefined));
    await repo.enregistrerDossier(37, dossier({ commissions: { entree: null, sortie: { montant: 450, unite: 'ttc' }, taux: { entree: null, sortie: 40 }, mode: { entree: null, sortie: 'calculee' } } }), '2026-10-29', A);
    expect(lignesPosees().map((l) => [l.cote, l.ttc, l.taux])).toEqual([['sortie', 6500 * 0.3 * 0.4, 40]]);
    const journal = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal') && x.params[2] === 'commissions');
    expect(String(journal.at(-1)?.params[5])).toMatch(/^Commission recalculée suite à : changement des honoraires de la vente, changement du taux — /);
  });

  it('« Revenir au calcul » / « Appliquer le calcul » : mode « calculee » enregistré ; une saisie à la main : « manuelle »', async () => {
    const vente = (s: string) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ statut: 'compromis', retire_le: null, negociateur_entree_id: '5', negociateur_sortie_id: '7' }] } : undefined);
    const compte = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = $1') ? { rows: [{ nom: 'Mylène EBERLIN', role: 'collaborateur', commissionne: null }] } : undefined);
    const avant = (s: string) => (s.includes('FROM transaction_vente_ligne') && s.includes('WHERE vente_id = $1 AND retire_le IS NULL AND cote IS NOT NULL')
      ? { rows: [{ cote: 'sortie', negociateur: 'Mylène EBERLIN', montant_ttc: '1625', montant_ht: null, taux: '25', mode_commission: 'manuelle' }] } : undefined);
    let ids = 0;
    reponses.push(vente, compte, avant, (s) => (s.startsWith('SELECT id FROM transaction_vente_ligne') ? { rows: [{ id: String(450 + (ids++ > 1 ? 1 : 0)) }] } : undefined),
      (s) => (s.includes('FROM transaction_vente_ligne WHERE id = ANY') ? { rows: [{ cote: 'sortie', negociateur: 'Mylène EBERLIN', montant_ttc: '1625', montant_ht: null, taux: '25', mode_commission: 'manuelle' }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '451' }] } : undefined));
    await repo.enregistrerCommissionCote(37, 'sortie', { montant: 487.5, unite: 'ttc' }, 25, A, 'calculee');
    expect(lignesPosees().map((l) => [l.cote, l.ttc, l.mode])).toEqual([['sortie', 487.5, 'calculee']]);
    const journal = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal') && x.params[2] === 'commissions');
    expect(String(journal.at(-1)?.params[5])).toMatch(/^Calcul appliqué — /);
  });

  it('lecture : le mode enregistré est lu (442) ; sans elle, aucune colonne neuve n’est nommée', async () => {
    reponses.push((s) => (s.startsWith('SELECT l.id, l.vente_id') ? { rows: [{ id: '450', vente_id: '37', negociateur: 'Mylène EBERLIN', role: 'negociateur', montant_ttc: '1625', cote: 'sortie',
      montant_ht: null, taux: '25', mode_commission: 'manuelle', nature: 'compromis', compte: false, origine: 'saisie' }] } : undefined),
      (s) => (s.startsWith('SELECT v.id, v.societe') ? { rows: [{ id: '37', societe: 'criterimmo', libelle: 'Location ?', honoraires_ttc: '7500', statut: 'compromis', annee: 2026, origine: 'saisie' }] } : undefined));
    const [v] = await repo.lireVentes(null);
    expect(v.lignes[0]).toMatchObject({ cote: 'sortie', taux: 25, mode: 'manuelle' });
    appels.length = 0; lotV.mockResolvedValue(false);
    await repo.lireVentes(null);
    expect(appels.some((x) => x.sql.includes('mode_commission'))).toBe(false);
  });
});

describe('🔴 LOT AE — la vente est enregistrée chez la société de son négociateur d’entrée (porteuse)', () => {
  const dossier = (entreeId: number | null, o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: 'DURAND', honorairesTtc: 6000,
    dateCompromis: '2026-10-29', dateActePrevue: null, dateActe: null, adresseBien: null, note: null, entreeId, sortieId: 5, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0,
    retroUnite: 'ttc' as const, personnes: [], lignes: [], prixVente: null,
    parties: [...(entreeId === null ? [] : [{ sorte: 'entree' as const, compteId: entreeId, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }]),
      { sorte: 'sortie' as const, compteId: 5, nom: null, coordonnees: null, pourcentage: entreeId === null ? 100 : 50, montantHt: null }], ...o });
  // les comptes demandés seulement (comme la base)
  const tous = [{ id: '5', nom: 'Jean-Baptiste PONS', role: 'collaborateur' }, { id: '7', nom: 'Mylène EBERLIN', role: 'collaborateur' }];
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY')
    ? { rows: tous.filter((c) => (appels.at(-1)!.params[0] as number[]).includes(Number(c.id))) } : undefined);
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '7', societe: 'macj', depuis: '2000-01-01' }] } : undefined);
  beforeEach(() => { lotD.mockResolvedValue(true); });

  it('créée depuis CRITERIMMO, négociateur d’entrée chez MACJ : enregistrée MACJ ; sans négociateur d’entrée : la page (CRITERIMMO)', async () => {
    let id = 80;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    expect((await repo.enregistrerDossier(null, dossier(7), '2026-10-29', A)).ok).toBe(true);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_vente (societe'))!.params[0]).toBe('macj');
    appels.length = 0;
    const r = await repo.enregistrerDossier(null, dossier(null), '2026-10-29', A);
    expect(r.ok).toBe(true);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_vente (societe'))!.params[0]).toBe('criterimmo');
  });

  it('modifiée : le négociateur d’entrée passe chez MACJ → la vente bascule (colonne `societe`), journalisé « Société porteuse du mandat : CRITERIMMO → MACJ »', async () => {
    reponses.push(comptes, periodes,
      (s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'DURAND', honoraires_ttc: 6000, statut: 'compromis', annee: 2026, retire_le: null, societe: 'criterimmo' }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '95' }] } : undefined));
    expect((await repo.enregistrerDossier(81, dossier(7), '2026-10-29', A)).ok).toBe(true);
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente SET') && x.sql.includes('societe = $'))!;
    expect(maj.params).toContain('macj');
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal') && x.params[2] === 'modification')!;
    expect(j.params[5]).toBe('Société porteuse du mandat : CRITERIMMO → MACJ (la société du négociateur d’entrée).');
    expect(JSON.parse(String(j.params[3]))).toMatchObject({ societe: 'criterimmo' });
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });

  it('le script : `ventesMalRangees` (lecture seule) ; `rangerPorteuse` range, journalise et resynchronise le registre ; une vente bien rangée : rien', async () => {
    reponses.push((s) => (s.includes('JOIN LATERAL') ? { rows: [{ id: '81', libelle: 'DURAND', statut: 'compromis', societe: 'criterimmo', porteuse: 'macj', negociateur: 'Mylène EBERLIN' }] } : undefined));
    expect(await repo.ventesMalRangees()).toEqual([{ id: 81, libelle: 'DURAND', statut: 'compromis', enregistree: 'criterimmo', porteuse: 'macj', negociateurEntree: 'Mylène EBERLIN' }]);
    expect(appels.every((x) => x.sql.startsWith('SELECT'))).toBe(true);
    appels.length = 0; reponses = [];
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'DURAND', statut: 'compromis', retire_le: null, societe: 'criterimmo' }] } : undefined),
      (s) => (s.startsWith('SELECT sorte, compte_id') ? { rows: [{ sorte: 'entree', compte_id: '7', negociateur_libelle: 'Mylène EBERLIN', societe: 'macj', pourcentage: '50' },
        { sorte: 'sortie', compte_id: '5', negociateur_libelle: 'Jean-Baptiste PONS', societe: 'criterimmo', pourcentage: '50' }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '96' }] } : undefined));
    expect(await repo.rangerPorteuse(81, A)).toEqual({ ok: true, valeur: { avant: 'criterimmo', apres: 'macj' } });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente SET'))!.params).toEqual([81, 'macj']);
    expect(String(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!.params[5])).toMatch(/^Rangée chez sa société porteuse du mandat : CRITERIMMO → MACJ/);
    appels.length = 0; reponses = [];
    reponses.push((s) => (s.includes('FOR UPDATE') ? { rows: [{ libelle: 'DURAND', statut: 'compromis', retire_le: null, societe: 'macj' }] } : undefined),
      (s) => (s.startsWith('SELECT sorte, compte_id') ? { rows: [{ sorte: 'entree', compte_id: '7', negociateur_libelle: 'Mylène EBERLIN', societe: 'macj', pourcentage: '100' }] } : undefined));
    expect(await repo.rangerPorteuse(81, A)).toEqual({ ok: true, valeur: null });
    expect(appels.some((x) => /^(INSERT|UPDATE)/.test(x.sql))).toBe(false);
  });
});

describe('🔴 LOT BH — « Supprimer » l’apporteur d’une affaire : le lien est retiré, même un nom écrit d’import (journalisé)', () => {
  it('retirerApporteur : l’apporteur (nom écrit, sans fiche) et sa rétrocession sont effacés de la vente ; la modification est journalisée (avant → après)', async () => {
    lotD.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'HEIDIDON', honoraires_ttc: '4000', statut: 'compromis', annee: 2026, mois_acte: null, date_compromis: '2026-10-20', apporteur: 'Gardien Dacquet', note: null, retire_le: null,
        attribution: null, adresse_bien: null, date_acte_prevue: null, date_acte: null, negociateur_entree_id: null, negociateur_sortie_id: null, apporteur_id: null, retro_apporteur_ttc: '500', repartition: false }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '71' }] } : undefined));
    const r = await repo.enregistrerDossier(12, { societe: 'criterimmo', statut: 'compromis', libelle: 'HEIDIDON', honorairesTtc: 4000, dateCompromis: '2026-10-20', dateActePrevue: null, dateActe: null,
      adresseBien: null, note: null, entreeId: null, sortieId: null, apporteurId: null, apporteurNom: null, retirerApporteur: true, retroApporteurTtc: 0, retroUnite: 'ttc' as const, prixVente: null, lignes: [], parties: [],
      personnes: [{ id: null, role: 'vendeur', nom: 'DUPONT', telephone: null, email: null, adresse: null }] }, '2026-10-27', A);
    expect(r.ok).toBe(true);
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql.replace(/\s+/g, ' ')).toContain('apporteur =');
    const cols = maj.sql.replace(/\s+/g, ' ').match(/SET (.*) WHERE/)![1].split(',').map((c) => c.trim().split(' =')[0]);
    expect(maj.params[cols.indexOf('apporteur') + 1]).toBeNull();
    expect(maj.params[cols.indexOf('retro_apporteur_ttc') + 1]).toBe(0);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params[2]).toBe('modification');
    expect(JSON.parse(String(j.params[3]))).toMatchObject({ apporteur: 'Gardien Dacquet' });
    expect(JSON.parse(String(j.params[4]))).toMatchObject({ apporteur: null });
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });
});

describe('🔴 LOT BJ (443) — vendeurs / acquéreurs : particulier ou société, représentants ; journal de l’affaire', () => {
  const venteActuelle = { libelle: 'X', honoraires_ttc: '1000', statut: 'compromis', annee: 2026, mois_acte: null, date_compromis: '2026-10-20', apporteur: null, note: null, retire_le: null,
    attribution: null, adresse_bien: null, date_acte_prevue: null, date_acte: null, negociateur_entree_id: null, negociateur_sortie_id: null, apporteur_id: null, retro_apporteur_ttc: '0', repartition: false };
  const saisie = (personnes: unknown[]) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: 'X', honorairesTtc: 1000, dateCompromis: '2026-10-20', dateActePrevue: null, dateActe: null,
    adresseBien: null, note: null, entreeId: null, sortieId: null, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0, retroUnite: 'ttc' as const, prixVente: null, lignes: [], parties: [],
    personnes: personnes as never });
  it('sans la 443 : une société (ou une civilité, un prénom, des représentants) est refusée, rien n’est écrit', async () => {
    lotD.mockResolvedValue(true);
    const r = await repo.enregistrerDossier(12, saisie([{ id: null, role: 'acquereur', nom: 'SCI DU PARC', telephone: null, email: null, adresse: null, type: 'societe', civilite: null, prenom: null, representants: [] }]), '2026-10-30', A);
    expect(r).toEqual({ ok: false, motif: repo.MOTIF_SANS_443 });
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
  it('avec la 443 : la société et ses 2 représentants (fiches créées : type, civilité, prénom), les liens posés ; journalisé sur les fiches ET sur l’affaire', async () => {
    lotD.mockResolvedValue(true); lotBJ.mockResolvedValue(true);
    let suivant = 100;
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [venteActuelle] } : undefined),
      (s) => (s.startsWith('INSERT INTO transaction_personne ') ? { rows: [{ id: String(suivant++) }] } : undefined),
      (s) => (s.includes('RETURNING id') ? { rows: [{ id: '900' }] } : undefined));
    const r = await repo.enregistrerDossier(12, saisie([{ id: null, role: 'acquereur', nom: 'SCI DU PARC', telephone: null, email: null, adresse: null, type: 'societe', civilite: null, prenom: null,
      representants: [{ id: null, civilite: 'Mme', nom: 'BERCIER', prenom: 'Mira', telephone: '06 11 22 33 44', email: null, adresse: null },
        { id: null, civilite: null, nom: 'MARTIN', prenom: 'Paul', telephone: null, email: 'p@x.fr', adresse: null }] }]), '2026-10-30', A);
    expect(r.ok).toBe(true);
    const fiches = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_personne '));
    expect(fiches.map((x) => x.params.slice(0, 7))).toEqual([['SCI DU PARC', null, null, null, 'societe', null, null], ['BERCIER', '06 11 22 33 44', null, null, 'particulier', 'Mme', 'Mira'],
      ['MARTIN', null, 'p@x.fr', null, 'particulier', null, 'Paul']]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_personne_representant')).map((x) => x.params.slice(0, 3))).toEqual([[100, 101, 0], [100, 102, 1]]);
    const journal = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => [x.params[0], x.params[1], x.params[2]]);
    expect(journal).toContainEqual(['personne', 100, 'representants']);
    expect(journal).toContainEqual(['vente', 12, 'representants']);
    expect(journal).toContainEqual(['vente', 12, 'personne']);
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });
  it('« Annuler » refuse une ligne « personne » / « représentants » du journal de l’affaire (elle se corrige dans « Modifier »)', async () => {
    lotD.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '30', entite: 'vente', entite_id: '12', action: 'representants', avant: {}, apres: {}, deja: false }] } : undefined));
    expect((await repo.annulerGeste(30, A)).ok).toBe(false);
  });
});

describe('🔴 LOT BL — une fiche existante s’enregistre mise en forme à sa prochaine validation (jamais réécrite autrement)', () => {
  it('la lecture n’écrit rien ; l’enregistrement d’une fiche « Mira bercier » (lue telle quelle) la met en forme (journalisé)', async () => {
    lotD.mockResolvedValue(true); lotBJ.mockResolvedValue(true);
    await repo.lireVentes('criterimmo');
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
    const { lireDossier } = await import('./saisie');
    const s = lireDossier({ societe: 'criterimmo', statut: 'compromis', libelle: 'X', honorairesTtc: '1000', personnes: [{ id: 21, role: 'vendeur', nom: 'Mira bercier' }] });
    expect(s.ok && s.valeur.personnes[0].nom).toBe('MIRA BERCIER');
    reponses.push((x) => (x.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'X', honoraires_ttc: '1000', statut: 'compromis', annee: 2026, mois_acte: null,
      date_compromis: null, apporteur: null, note: null, retire_le: null, attribution: null, adresse_bien: null, date_acte_prevue: null, date_acte: null, negociateur_entree_id: null,
      negociateur_sortie_id: null, apporteur_id: null, retro_apporteur_ttc: '0', repartition: false }] } : undefined),
    (x) => (x.includes('FROM transaction_personne WHERE id = $1 FOR UPDATE') ? { rows: [{ nom: 'Mira bercier', telephone: null, email: null, adresse: null, note: null, retire_le: null, type: null, civilite: null, prenom: null }] } : undefined),
    (x) => (x.includes('RETURNING id') ? { rows: [{ id: '900' }] } : undefined));
    expect((await repo.enregistrerDossier(12, s.ok ? s.valeur : (null as never), '2026-10-30', A)).ok).toBe(true);
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_personne SET'))!;
    expect(maj.params).toEqual([21, 'MIRA BERCIER']);
  });
});
