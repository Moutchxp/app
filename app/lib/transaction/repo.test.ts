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
vi.mock('../admin/schemaDroits', () => ({ droitTransactionDisponible: () => disponible(), repartitionDisponible: () => lotD(), prixVenteDisponible: () => lotE(),
  annulationDisponible: () => lotG(), uniteCommissionDisponible: () => lotI() }));
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
beforeEach(() => { appels.length = 0; reponses = []; disponible.mockResolvedValue(true); lotD.mockResolvedValue(false); lotE.mockResolvedValue(false); lotG.mockResolvedValue(false); lotI.mockResolvedValue(false); q.mockClear(); });

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
