import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { avertissementCartes, changementsFiche, refusFiche, type CarteFicheLue, type LectureFicheLocataire } from './ficheLocataireCartes';

/**
 * 🔴 Arno (25/10/2026) — « FICHE LOCATAIRE » DU SUIVI DU MOIS, EN CARTES : la règle pure (avertissement, récapitulatif, contrôles) et
 * l'écriture sur base SIMULÉE (mise à jour sans doublon par les gestes existants, conflit sans rien écraser, journal tracé : compte,
 * session, écran « Fiche locataire (Suivi du mois) »). Données fictives.
 */
const LEA: CarteFicheLue = { id: 230, sorte: 'client', civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', codePostal: '92400',
  commune: 'COURBEVOIE', note: null, contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }] };
const PAUL: CarteFicheLue = { id: 5, sorte: 'contact', civilite: 'M.', prenom: 'Paul', nom: 'DURAND', qualite: 'Garant', adresse: null, codePostal: null, commune: 'LYON', note: null,
  contacts: [{ id: 1, sorte: 'email', affichage: 'paul@exemple.test', libelle: 'E-mail' }] };
const LU: LectureFicheLocataire = { locataireId: 230, bailId: 70, titre: 'Fiche locataire — Mme MARTIN Léa', version: 'v1', cartes: [LEA, PAUL] };

describe('🔴 la règle pure', () => {
  it('l’avertissement de l’ancienne vue : aucune carte de locataire complète → la carte et ce qui lui manque', () => {
    expect(avertissementCartes(LU.cartes)).toEqual({ titre: 'Aucune carte complète pour ce locataire', lignes: ['Mme MARTIN Léa : E-mail manquant'] });
    const complete = { ...LEA, contacts: [...LEA.contacts, { id: 2, sorte: 'email' as const, affichage: 'lea@exemple.test', libelle: 'E-mail' }] };
    expect(avertissementCartes([complete, PAUL])).toBeNull();
  });
  it('le récapitulatif : carte par carte, « ancienne → nouvelle » ; une carte ajoutée en une ligne', () => {
    expect(changementsFiche(LU, { version: 'v1', modifiees: [{ id: 230, sorte: 'client', champs: { commune: 'PUTEAUX' } }, { id: 5, sorte: 'contact', champs: { qualite: 'Conjoint' } }],
      nouvelles: [{ sorte: 'client', champs: { nom: 'PETIT', prenom: 'Marc', coordonnees: [{ sorte: 'telephone', valeur: '06 11 11 11 11' }] } }] })).toEqual([
      { carte: 'Locataire Mme MARTIN Léa', champ: 'Commune', avant: 'COURBEVOIE', apres: 'PUTEAUX' },
      { carte: 'Contact M. DURAND Paul', champ: 'Qualité', avant: 'Garant', apres: 'Conjoint' },
      { carte: 'Nouveau colocataire', champ: 'Carte', avant: '(aucune)', apres: 'PETIT Marc — 06 11 11 11 11' }]);
  });
  it('les contrôles : nom jamais vide ; sans carte complète, un colocataire ajouté doit l’être (nom, téléphone ET e-mail) ; un contact a un e-mail', () => {
    expect(refusFiche(LU, { version: 'v1', modifiees: [{ id: 230, sorte: 'client', champs: { nom: ' ' } }], nouvelles: [] })).toBe('Mme MARTIN Léa : le nom ne peut pas être vide.');
    expect(refusFiche(LU, { version: 'v1', modifiees: [], nouvelles: [{ sorte: 'client', champs: { nom: 'PETIT', coordonnees: [{ sorte: 'telephone', valeur: '06 11 11 11 11' }] } }] }))
      .toMatch(/^Nouveau colocataire :/);
    expect(refusFiche(LU, { version: 'v1', modifiees: [], nouvelles: [{ sorte: 'client', champs: { nom: 'PETIT', coordonnees: [{ sorte: 'telephone', valeur: '06 11 11 11 11' }, { sorte: 'email', valeur: 'm@exemple.test' }] } }] })).toBeNull();
    expect(refusFiche(LU, { version: 'v1', modifiees: [], nouvelles: [{ sorte: 'contact', champs: { nom: 'VOISIN' } }] })).toBe('Nouveau contact : un e-mail.');
  });
  it('la famille garde sa carte complète : la dernière ne peut pas perdre son e-mail', () => {
    const complete = { ...LEA, contacts: [...LEA.contacts, { id: 2, sorte: 'email' as const, affichage: 'lea@exemple.test', libelle: 'E-mail' }] };
    const lu = { ...LU, cartes: [complete, PAUL] };
    expect(refusFiche(lu, { version: 'v1', modifiees: [{ id: 230, sorte: 'client', champs: { coordonnees: [{ sorte: 'telephone', valeur: '06 00 00 00 01' }] } }], nouvelles: [] }))
      .toMatch(/carte complète/);
  });
});

// ── L'écriture, sur base SIMULÉE ──────────────────────────────────────────────────────────────────────────────────────────────────
const appels: { sql: string; params: unknown[] }[] = [];
const gestes = vi.hoisted(() => ({
  modifierPersonne: vi.fn(async () => ({ etat: 'ok', data: undefined })), creerPersonne: vi.fn(async () => ({ etat: 'ok', data: { id: 999 } })),
  ajouterOccupantDans: vi.fn(async () => 1234), modifierCarte: vi.fn(async () => ({ ok: true, id: 5, nb: 1 })),
  creerContactsDuBien: vi.fn(async () => ({ ok: true, n: 1, carteIds: [77] })), ecrireRattachementsDans: vi.fn(async () => 1),
}));
vi.mock('server-only', () => ({}));
const norme = (s: string): string => s.replace(/\s+/g, ' ');
const repondre = async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_annuaire_locataire WHERE id = $1')) return { rows: [{ id: '230' }] };
  if (s.includes('FROM gestion_bail b')) return { rows: [{ id: '70', lot_id: '51', entree: '2026-09-12' }] };
  if (s.includes('SELECT DISTINCT locataire_id::text AS l')) return { rows: [{ l: '230' }] };
  if (s.includes('FROM gestion_annuaire_locataire WHERE id = ANY')) return { rows: [{ id: '230', civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', code_postal: '92400', commune: 'COURBEVOIE', note: null }] };
  if (s.includes('FROM gestion_annuaire_contact')) return { rows: [{ sujet_id: '230', id: '1', sorte: 'telephone', valeur: '06 00 00 00 01', libelle: 'Mobile' }] };
  if (s.includes('SELECT DISTINCT lot_id::text AS l')) return { rows: [{ l: '51' }, { l: '52' }] };
  return { rows: [], rowCount: 1 };
};
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => repondre(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => repondre(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/annuaireEditionRepo', () => ({ modifierPersonne: gestes.modifierPersonne, creerPersonne: gestes.creerPersonne, ajouterOccupantDans: gestes.ajouterOccupantDans }));
vi.mock('../gestion/partieCategorieRepo', () => ({
  modifierCarte: gestes.modifierCarte,
  lireCartesContactDesLocataires: async () => [{ id: 5, civilite: 'M.', prenom: 'Paul', nom: 'DURAND', qualite: 'Garant', adressePostale: null, codePostal: null, commune: 'LYON', note: null,
    coordonnees: [{ sorte: 'email', valeur: 'paul@exemple.test', libelle: 'E-mail' }], telephone: null, locataireId: null }],
}));
vi.mock('./contactsLocationRepo', () => ({ creerContactsDuBien: gestes.creerContactsDuBien }));
vi.mock('./rattachementsRepo', () => ({ ecrireRattachementsDans: gestes.ecrireRattachementsDans }));
// 🔴 25/10/2026 — le bloc 3 : le chemin du Dossier de location (simulé ici ; éprouvé avec le Dossier : dossierLocation.test.ts).
const dossier = vi.hoisted(() => ({
  ordre: [] as string[],
  preparation: { etat: 'pret', changements: [{ bloc: 3, champ: 'Mode de règlement', avant: 'Virement', apres: 'Chèque' }] } as Record<string, unknown>,
  preparerDossier: vi.fn(async () => dossier.preparation),
  modifierDossierLocation: vi.fn(async () => { dossier.ordre.push('bloc3'); return { etat: 'ok', data: { changements: [{ bloc: 3, champ: 'Mode de règlement', avant: 'Virement', apres: 'Chèque' }] } }; }),
}));
vi.mock('./dossierLocationRepo', () => ({ preparerDossier: dossier.preparerDossier, modifierDossierLocation: dossier.modifierDossierLocation }));

const { lireFicheLocataireCartes, enregistrerFicheLocataireCartes, enregistrerFicheLocataire } = await import('./ficheLocataireCartesRepo');
const { avecTrace } = await import('../gestion/traceJournal');
const AUTEUR = { id: 4, libelle: 'arno@exemple.fr' };
const ecrits = () => appels.filter((a) => /^(INSERT|UPDATE|DELETE)\b/.test(a.sql));

beforeEach(() => {
  appels.length = 0; for (const g of Object.values(gestes)) g.mockClear();
  dossier.ordre = []; dossier.preparerDossier.mockClear(); dossier.modifierDossierLocation.mockClear();
  dossier.preparation = { etat: 'pret', changements: [{ bloc: 3, champ: 'Mode de règlement', avant: 'Virement', apres: 'Chèque' }] };
  gestes.modifierPersonne.mockImplementation(async () => { dossier.ordre.push('cartes'); return { etat: 'ok', data: undefined }; });
});

describe('🔴 la lecture et l’écriture', () => {
  it('PRÉREMPLISSAGE : le locataire (fiche de l’annuaire) et ses contacts, préremplis ; une version', async () => {
    const r = await lireFicheLocataireCartes(230, 70);
    expect(r.etat).toBe('ok');
    if (r.etat !== 'ok') return;
    expect(r.data.cartes.map((c) => [c.sorte, c.id, c.nom, c.contacts.map((k) => k.affichage)])).toEqual([
      ['client', 230, 'MARTIN', ['06 00 00 00 01']], ['contact', 5, 'DURAND', ['paul@exemple.test']]]);
    expect(r.data).toMatchObject({ bailId: 70, titre: 'Fiche locataire — Mme MARTIN Léa' });
    expect(r.data.version).toMatch(/\S/);
  });

  it('CONFLIT : une version dépassée est refusée, rien n’est écrit', async () => {
    const r = await enregistrerFicheLocataireCartes(230, 70, { version: 'ancienne', modifiees: [{ id: 230, sorte: 'client', champs: { commune: 'PUTEAUX' } }], nouvelles: [] }, AUTEUR);
    expect(r.etat).toBe('conflit');
    expect(gestes.modifierPersonne).not.toHaveBeenCalled();
    expect(ecrits()).toEqual([]);
  });

  it('MISE À JOUR SANS DOUBLON : la fiche par `modifierPersonne` (seuls les champs modifiés), le contact par `modifierCarte` (carte entière) ; rien de créé', async () => {
    const lu = await lireFicheLocataireCartes(230, 70);
    if (lu.etat !== 'ok') throw new Error('lecture');
    const r = await avecTrace({ sessionId: 'jti-abc', ecran: 'Fiche locataire (Suivi du mois)' }, () => enregistrerFicheLocataireCartes(230, 70, {
      version: lu.data.version,
      modifiees: [{ id: 230, sorte: 'client', champs: { commune: 'PUTEAUX' } }, { id: 5, sorte: 'contact', champs: { qualite: 'Conjoint' } }], nouvelles: [] }, AUTEUR));
    expect(r.etat).toBe('ok');
    expect(gestes.modifierPersonne).toHaveBeenCalledWith('locataire', 230, { commune: 'PUTEAUX' }, AUTEUR);
    expect(gestes.modifierCarte).toHaveBeenCalledWith(expect.objectContaining({ id: 5, nom: 'DURAND', fiche: expect.objectContaining({ qualite: 'Conjoint', commune: 'LYON',
      coordonnees: [{ sorte: 'email', valeur: 'paul@exemple.test', libelle: 'E-mail' }] }) }));
    expect(gestes.creerPersonne).not.toHaveBeenCalled();
    expect(gestes.creerContactsDuBien).not.toHaveBeenCalled();
    // JOURNAL : une ligne par champ du contact, au locataire de la fiche — le compte, la session, l'écran.
    const j = ecrits().filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));
    expect(j).toHaveLength(1);
    expect(j[0].sql).toContain('sujet, champ, session_id, ecran');
    expect(j[0].params).toEqual([230, 'Garant', 'Conjoint', 'Contact M. DURAND Paul — Qualité : Garant → Conjoint', 4, 'arno@exemple.fr', 'locataire', 'Qualité', 'jti-abc', 'Fiche locataire (Suivi du mois)']);
  });

  it('un COLOCATAIRE ajouté rejoint LE bail (chacun de ses lots, sa date d’entrée) ; un CONTACT ajouté est rangé et rattaché (garant → garantit)', async () => {
    const lu = await lireFicheLocataireCartes(230, 70);
    if (lu.etat !== 'ok') throw new Error('lecture');
    const r = await enregistrerFicheLocataireCartes(230, 70, { version: lu.data.version, modifiees: [], nouvelles: [
      { sorte: 'client', champs: { nom: 'PETIT', prenom: 'Marc', coordonnees: [{ sorte: 'telephone', valeur: '06 11 11 11 11' }, { sorte: 'email', valeur: 'marc@exemple.test' }] } },
      { sorte: 'contact', champs: { nom: 'BERNARD', qualite: 'Garant', coordonnees: [{ sorte: 'email', valeur: 'b@exemple.test' }] } }] }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(gestes.creerPersonne).toHaveBeenCalledTimes(1);
    expect((gestes.ajouterOccupantDans.mock.calls as unknown as unknown[][]).map((c) => [c[1], c[2], c[3], c[5]])).toEqual([[51, 999, '2026-09-12', 70], [52, 999, '2026-09-12', 70]]);
    expect(gestes.creerContactsDuBien).toHaveBeenCalledWith(51, 'locataire', [expect.objectContaining({ nom: 'BERNARD' })], AUTEUR);
    expect((gestes.ecrireRattachementsDans.mock.calls as unknown as unknown[][])[0].slice(1, 3)).toEqual([70, [{ carteId: 77, r: { garant: true, garantit: [0], locataire: null } }]]);
  });

  it('un contrôle refusé (nom vidé) : rien n’est écrit', async () => {
    const lu = await lireFicheLocataireCartes(230, 70);
    if (lu.etat !== 'ok') throw new Error('lecture');
    expect(await enregistrerFicheLocataireCartes(230, 70, { version: lu.data.version, modifiees: [{ id: 230, sorte: 'client', champs: { nom: '' } }], nouvelles: [] }, AUTEUR))
      .toEqual({ etat: 'refus', motif: 'Mme MARTIN Léa : le nom ne peut pas être vide.' });
    expect(gestes.modifierPersonne).not.toHaveBeenCalled();
  });
});

describe('🔴 Arno (25/10/2026) — les cartes (bloc 1) ET les conditions d’entrée (bloc 3) : un seul enregistrement', () => {
  const SAISIE3 = { version: 'd1', conditions: { reglement: 'cheque' }, entretien: null };
  const cartes = async () => {
    const lu = await lireFicheLocataireCartes(230, 70);
    if (lu.etat !== 'ok') throw new Error('lecture');
    return { version: lu.data.version, modifiees: [{ id: 230, sorte: 'client' as const, champs: { commune: 'PUTEAUX' } }], nouvelles: [] };
  };

  it('ÉCRITURE DANS LE BAIL, sans doublon : le bloc 3 par le chemin du Dossier (bloc 3 seul), PUIS les cartes ; rien n’est créé', async () => {
    const r = await enregistrerFicheLocataire(230, 70, await cartes(), { activiteId: 100, saisie: SAISIE3 }, AUTEUR);
    expect(r.etat).toBe('ok');
    expect(dossier.preparerDossier).toHaveBeenCalledWith(100, SAISIE3, { ficheLocataire: true });
    expect(dossier.modifierDossierLocation).toHaveBeenCalledTimes(1);
    expect(dossier.modifierDossierLocation).toHaveBeenCalledWith(100, SAISIE3, AUTEUR, { ficheLocataire: true });
    expect(dossier.ordre).toEqual(['bloc3', 'cartes']);
    expect(r.etat === 'ok' && r.data.dossier.map((c) => c.champ)).toEqual(['Mode de règlement']);
    for (const g of [gestes.creerPersonne, gestes.ajouterOccupantDans, gestes.creerContactsDuBien]) expect(g).not.toHaveBeenCalled();
    expect(ecrits().some((a) => /INSERT INTO gestion_bail\b/.test(a.sql))).toBe(false);
  });

  it('CHAMP OBLIGATOIRE vide (bloc 3 refusé) : RIEN n’est écrit, ni le bloc 3 ni les cartes', async () => {
    dossier.preparation = { etat: 'refus', motif: 'Sommes dues à l’entrée : le dépôt de garantie (0 si aucun).' };
    const r = await enregistrerFicheLocataire(230, 70, await cartes(), { activiteId: 100, saisie: SAISIE3 }, AUTEUR);
    expect(r).toEqual({ etat: 'refus', motif: 'Sommes dues à l’entrée : le dépôt de garantie (0 si aucun).' });
    expect(dossier.modifierDossierLocation).not.toHaveBeenCalled();
    expect(gestes.modifierPersonne).not.toHaveBeenCalled();
  });

  it('CONFLIT sur le bail : refusé sans rien écraser ; une carte en conflit : le bloc 3 non plus n’est pas écrit', async () => {
    dossier.preparation = { etat: 'conflit', motif: 'Cette fiche a été modifiée par X : rechargez-la.' };
    expect((await enregistrerFicheLocataire(230, 70, await cartes(), { activiteId: 100, saisie: SAISIE3 }, AUTEUR)).etat).toBe('conflit');
    dossier.preparation = { etat: 'pret', changements: [{ bloc: 3, champ: 'Mode de règlement', avant: 'Virement', apres: 'Chèque' }] };
    expect((await enregistrerFicheLocataire(230, 70, { ...(await cartes()), version: 'ancienne' }, { activiteId: 100, saisie: SAISIE3 }, AUTEUR)).etat).toBe('conflit');
    expect(dossier.modifierDossierLocation).not.toHaveBeenCalled();
    expect(gestes.modifierPersonne).not.toHaveBeenCalled();
  });

  it('LIGNE SANS BAIL : « Dossier non rattaché — à rattacher d’abord », rien n’est créé ; sans bloc 3 envoyé, les cartes seules', async () => {
    dossier.preparation = { etat: 'non_rattache' };
    const r = await enregistrerFicheLocataire(230, 70, await cartes(), { activiteId: 100, saisie: SAISIE3 }, AUTEUR);
    expect(r.etat === 'refus' && r.motif).toMatch(/^Dossier non rattaché — à rattacher d’abord/);
    expect(gestes.modifierPersonne).not.toHaveBeenCalled();
    expect((await enregistrerFicheLocataire(230, 70, await cartes(), null, AUTEUR)).etat).toBe('ok');
    expect(dossier.preparerDossier).toHaveBeenCalledTimes(1);
  });

  it('AUCUN ENVOI DE MAIL NI GESTE DRIVE : le dépôt n’importe ni l’envoi ADHOC & MONGA, ni le Drive', () => {
    const imports = readFileSync('app/lib/location/ficheLocataireCartesRepo.ts', 'utf8').split('\n').filter((l) => l.startsWith('import ')).join('\n');
    expect(imports).not.toMatch(/mail|envoi|adhoc|monga|drive/i);
  });

  it('la copie du loyer sur la ligne de suivi suit le bail, dans la transaction des conditions d’entrée', () => {
    const src = readFileSync('app/lib/location/conditionsEntreeRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(src).toContain('await q(`UPDATE gestion_location_activite SET loyer_hc = $2, charges = $3 WHERE bail_id = $1 AND annule_le IS NULL`');
  });
});
