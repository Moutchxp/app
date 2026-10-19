import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  biensAMontrer, boutonDossierBien, dossierDuBien, dossierRetenuDuBien, ETIQUETTE_RACINE, LIBELLE_DOSSIER_DU_LOT,
  LIBELLE_DOSSIER_PROPRIETAIRE_DU_BIEN, motifExclusionCorbeille, nomRacineProprietaire, planRacineDuProprietaire, rapprocherBien,
  refusRequeteRacines, sqlRepointageFichesEtBiens, verifierCopieRattrapage, verifierDeplacementSousRacine, verifierGesteBien,
  verifierRacineTrouvee, type ContexteRequetesRacines, type DossierARapprocher, type LigneBien, type LotARapprocher,
} from './racinesProprietaires';
import { LIBELLE_SANS_DOSSIER_ATTITRE, type ContexteRangement, type ElementLu } from './rangementDossiersCopies';

/**
 * RACINE PROPRIÉTAIRE, BOUTON DRIVE DES BIENS, RATTRAPAGE (Arno, 19/10/2026) — règles et verrous des étapes E, F, R et D
 * révisée. Noms et identifiants FICTIFS (aucun nom de client).
 */
const id = (s: string) => `${s}${'x'.repeat(Math.max(0, 12 - s.length))}`;
const RACINE = id('racine'); const SCANNES = id('scannes'); const ARRIVEE = id('arrivee'); const IMPORT = id('import');
const ACTIFS = id('actifs'); const INACTIFS = id('inactifs'); const DRIVE = id('0drive');
const RP = id('racinepropA');
const ctx: ContexteRangement = { racineId: RACINE, scannesId: SCANNES, arriveeId: ARRIVEE, racineCopieId: IMPORT, destinations: { Actifs: ACTIFS, Inactifs: INACTIFS } };
const DOSSIER = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3';
const sousActifs = [{ id: ACTIFS, nom: 'Actifs' }, { id: RACINE, nom: 'Base de données locative' }, { id: DRIVE, nom: 'Drive' }];

describe('point 2 — le nom de la racine propriétaire', () => {
  it('la partie commune, sans la parenthèse', () => {
    expect(nomRacineProprietaire(['Martin-Durand (Ville A)', 'Martin-Durand (Ville B)', 'Martin-Durand (Ville C)'], 'Martin-Durand (Ville B)', 'MARTIN Paul')).toBe('Martin-Durand');
    expect(nomRacineProprietaire(['Leroy', 'LEROY MANDAT N°12'], 'Leroy', 'LEROY Anne')).toBe('Leroy');
    expect(nomRacineProprietaire(['Petit Anne', 'Petit Louis ( rue X)'], 'Petit Anne', 'PETIT Anne')).toBe('Petit');
  });
  it('les mêmes mots dans un autre ordre ou une autre graphie : le nom du principal, tel qu’il est écrit', () => {
    expect(nomRacineProprietaire(['Roux - Blanc', 'BlancRoux'], 'Roux - Blanc', 'ROUX Jeanne')).toBe('Roux - Blanc');
    expect(nomRacineProprietaire(['Éloi (A)', 'ELOI (B)'], 'Éloi (A)', 'X')).toBe('Éloi');
  });
  it('rien de commun → le nom de la fiche ; jamais un nom protégé ni celui d’un conteneur', () => {
    expect(nomRacineProprietaire(['Alpha', 'Beta'], 'Alpha', 'ALPHA Jean')).toBe('ALPHA Jean');
    expect(nomRacineProprietaire(['Actifs (1)', 'Actifs (2)'], 'Actifs (1)', 'FICHE')).toBe('FICHE');
    expect(nomRacineProprietaire(['Documents clients scannés (1)', 'Documents clients scannés (2)'], 'Documents clients scannés (1)', 'FICHE')).toBe('FICHE');
  });
});

describe('point 2 — le plan de la racine d’un propriétaire', () => {
  const d = (n: string, place: 'Actifs' | 'Inactifs' | 'en_place', principal = false) => ({ id: id(n), nom: `Nom (${n})`, place, principal });
  it('une racine dans « Actifs » s’il a un dossier actif, une dans « Inactifs » s’il a un dossier inactif ; la fiche → Actifs', () => {
    const p = planRacineDuProprietaire({ id: 7, nom: 'FICHE' }, [d('a1', 'Actifs', true), d('i1', 'Inactifs'), d('a2', 'Actifs')])!;
    expect(p.nom).toBe('Nom');
    expect(p.racines.map((r) => [r.conteneur, r.dossiers.map((x) => x.id)])).toEqual([['Actifs', [id('a1'), id('a2')]], ['Inactifs', [id('i1')]]]);
    expect(p.ficheVers).toBe('Actifs');
  });
  it('seulement des inactifs → la fiche vise la racine « Inactifs » ; les laissés en place ne bougent pas', () => {
    const p = planRacineDuProprietaire({ id: 7, nom: 'FICHE' }, [d('i1', 'Inactifs', true), d('e1', 'en_place')])!;
    expect(p.racines.map((r) => r.conteneur)).toEqual(['Inactifs']);
    expect(p.laissesEnPlace.map((x) => x.id)).toEqual([id('e1')]);
    expect(p.ficheVers).toBe('Inactifs');
  });
  it('un seul dossier copié : pas de racine (le dossier sert de racine du propriétaire ET de ses biens)', () => {
    expect(planRacineDuProprietaire({ id: 7, nom: 'FICHE' }, [d('a1', 'Actifs', true)])).toBeNull();
  });
});

describe('point 3 — le rapprochement des biens', () => {
  const lot = (p: Partial<LotARapprocher>): LotARapprocher => ({ id: 1, wippimmo: '10', adresse: '5 rue des Lilas', commune: 'VILLE-SUR-EAU', codePostal: '92000', locataires: [], ...p });
  const dos = (p: Partial<DossierARapprocher>): DossierARapprocher => ({ id: id('d'), nom: 'Nom', locataires: [], sousDossiers: [], ...p });
  it('SÛR : la commune dans la parenthèse d’un seul dossier', () => {
    const r = rapprocherBien(lot({}), [dos({ id: id('d1'), nom: 'Nom (Ville)' }), dos({ id: id('d2'), nom: 'Nom (Autre)' })]);
    expect([r.niveau, r.dossierId, r.raison]).toEqual(['SUR', id('d1'), 'commune Ville']);
  });
  it('SÛR : le locataire du bien dans le dossier « Locataire(s) » d’un seul dossier (actuel / ancien)', () => {
    const r = rapprocherBien(lot({ locataires: [{ nom: 'DUPONT Jean', enPlace: true }, { nom: 'ANCIEN Paul', enPlace: false }] }),
      [dos({ id: id('d1'), nom: 'Nom (3e étage)', locataires: ['Dupont', 'Ancien'] }), dos({ id: id('d2'), nom: 'Nom (5e étage)' })]);
    expect(r.niveau).toBe('SUR');
    expect(r.raison).toBe('locataire actuel DUPONT + ancien locataire ANCIEN');
  });
  it('un dossier qui réunit plusieurs biens rangés par adresse : le SOUS-DOSSIER de l’adresse est proposé (la racine de CE bien)', () => {
    const r = rapprocherBien(lot({}), [dos({ id: id('d1'), nom: 'Nom (Ville)', sousDossiers: [{ id: id('s1'), nom: '5 rue des Lilas' }, { id: id('s2'), nom: '9 rue des Roses' }] }), dos({ id: id('d2'), nom: 'Nom (Autre)' })]);
    expect([r.niveau, r.dossierId, r.dossierNom]).toEqual(['SUR', id('s1'), 'Nom (Ville) › 5 rue des Lilas']);
    expect(r.candidats.map((c) => c.id)).toEqual([id('d1'), id('s1'), id('s2'), id('d2')]);
  });
  it('« Paris 16 » exige l’arrondissement du code postal', () => {
    const l = lot({ commune: 'PARIS', codePostal: '75016' });
    expect(rapprocherBien(l, [dos({ id: id('d1'), nom: 'Nom (Paris 16)' }), dos({ id: id('d2'), nom: 'Nom (Paris 13)' })]).dossierId).toBe(id('d1'));
  });
  it('PROBABLE : un indice fort d’un côté, un indice faible (un mot de la voie) de l’autre', () => {
    const r = rapprocherBien(lot({ adresse: '54 avenue des Peupliers', locataires: [{ nom: 'DUPONT', enPlace: true }] }),
      [dos({ id: id('d1'), nom: 'Nom A', locataires: ['Dupont'] }), dos({ id: id('d2'), nom: 'Nom B ( Peupliers)' })]);
    expect([r.niveau, r.dossierId]).toEqual(['PROBABLE', id('d1')]);
    expect(r.raison).toMatch(/autre piste : « Nom B \( Peupliers\) » \(voie « peupliers »\)/);
  });
  it('AMBIGU : égalité ou aucun indice — aucun dossier proposé', () => {
    expect(rapprocherBien(lot({}), [dos({ id: id('d1'), nom: 'Nom A' }), dos({ id: id('d2'), nom: 'Nom B' })])).toMatchObject({ niveau: 'AMBIGU', dossierId: null });
    expect(rapprocherBien(lot({}), [dos({ id: id('d1'), nom: 'Nom (Ville)' }), dos({ id: id('d2'), nom: 'Autre (Ville)' })])).toMatchObject({ niveau: 'AMBIGU', dossierId: null });
  });
  it('le dossier retenu : SÛR sans décision = proposé ; sans réponse sur un PROBABLE = aucun ; Corriger hors candidats = aucun', () => {
    const p = { niveau: 'PROBABLE' as const, dossierId: id('d1'), candidats: [{ id: id('d1') }, { id: id('d2') }] };
    expect(dossierRetenuDuBien({ ...p, niveau: 'SUR' }, null)).toBe(id('d1'));
    expect(dossierRetenuDuBien(p, null)).toBeNull();
    expect(dossierRetenuDuBien(p, { geste: 'valider', dossierId: id('d1') })).toBe(id('d1'));
    expect(dossierRetenuDuBien(p, { geste: 'corriger', dossierId: id('d2') })).toBe(id('d2'));
    expect(dossierRetenuDuBien(p, { geste: 'corriger', dossierId: id('zz') })).toBeNull();
    expect(dossierRetenuDuBien({ ...p, niveau: 'SUR' }, { geste: 'aucun', dossierId: null })).toBeNull();
  });
  it('l’écran ne montre que les PROBABLES et les AMBIGUS ; un geste hors candidats est refusé', () => {
    const b = (niveau: LigneBien['niveau']): LigneBien => ({ id: 1, lotId: 1, wippimmo: '1', adresse: 'a', proprietaire: { id: 1, nom: 'F' }, niveau,
      dossierId: niveau === 'AMBIGU' ? null : id('d1'), dossierNom: null, raison: '', candidats: [{ id: id('d1'), nom: 'A' }], decision: null, nbDecisions: 0 });
    expect(biensAMontrer([b('SUR'), b('PROBABLE'), b('AMBIGU')]).map((x) => x.niveau)).toEqual(['PROBABLE', 'AMBIGU']);
    expect(verifierGesteBien(b('AMBIGU'), 'valider', null)).toMatch(/Aucun dossier n’est proposé/);
    expect(verifierGesteBien(b('PROBABLE'), 'corriger', id('zz'))).toMatch(/parmi ceux du propriétaire/);
    expect(verifierGesteBien(b('PROBABLE'), 'corriger', id('d1'))).toBeNull();
    expect(verifierGesteBien(b('PROBABLE'), 'aucun', null)).toBeNull();
  });
});

describe('point 3 — le bouton Drive d’un bien : dossier du bien → dossier du propriétaire → racine (repli d’affichage)', () => {
  it('le dossier attitré du bien d’abord', () => {
    const r = dossierDuBien(id('bien'), id('proprio'));
    expect(r).toEqual({ id: id('bien'), source: 'bien' });
    expect(boutonDossierBien(r, RACINE)).toEqual({ href: `https://drive.google.com/drive/folders/${id('bien')}`, libelle: LIBELLE_DOSSIER_DU_LOT, source: 'bien' });
  });
  it('sans dossier attitré : le dossier du propriétaire, et le libellé le dit', () => {
    const b = boutonDossierBien(dossierDuBien(null, id('proprio')), RACINE);
    expect(b).toEqual({ href: `https://drive.google.com/drive/folders/${id('proprio')}`, libelle: LIBELLE_DOSSIER_PROPRIETAIRE_DU_BIEN, source: 'proprietaire' });
  });
  it('ni l’un ni l’autre : la racine « Base de données locative (aucun dossier attitré) » ; sans racine connue, pas de bouton', () => {
    expect(boutonDossierBien(dossierDuBien(null, null), RACINE)).toEqual({ href: `https://drive.google.com/drive/folders/${RACINE}`, libelle: LIBELLE_SANS_DOSSIER_ATTITRE, source: 'racine' });
    expect(boutonDossierBien(null, null)).toBeNull();
  });
  it('la racine, « Actifs » ou « Inactifs » cités par un bien ou un propriétaire comptent comme absents : jamais ouverts comme leur dossier', () => {
    const interdits = new Set([RACINE, ACTIFS, INACTIFS]);
    expect(dossierDuBien(ACTIFS, INACTIFS, interdits)).toBeNull();
    expect(dossierDuBien(RACINE, id('proprio'), interdits)).toEqual({ id: id('proprio'), source: 'proprietaire' });
    expect(boutonDossierBien({ id: RACINE, source: 'bien' }, RACINE)?.source).toBe('racine');
  });
  it('GARDE DE SOURCE : les trois boutons de bien de l’annuaire passent par le repli, et la lecture ne prend plus l’ancienne arborescence', () => {
    const repo = readFileSync(path.join(process.cwd(), 'app/lib/gestion/annuaireRepo.ts'), 'utf8');
    expect(repo).not.toMatch(/dr\.sorte = 'bien'/);
    expect(repo).not.toMatch(/dossierDriveDe\('bien'/);
    expect(repo.match(/\$\{await sqlDossiersDuBien\('lo'\)\}/g)).toHaveLength(3);
    expect(repo).toMatch(/NOT EXISTS \(SELECT 1 FROM gestion_drive_arbre arb WHERE arb\.drive_id = \$\{x\}\)/);
    const ecran = readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)/gestion/Annuaire.tsx'), 'utf8');
    expect(ecran.match(/boutonDossierBien\(/g)).toHaveLength(3);
    expect(ecran).not.toMatch(/href=\{`\$\{DRIVE_DOSSIER\}/);
  });
});

describe('verrou des requêtes Drive — étape E (« racines ») et R (« rattrapage »)', () => {
  const c: ContexteRequetesRacines = {
    conteneurs: new Set([ACTIFS, INACTIFS]), racines: new Set([RP]),
    destinationsCopie: new Set([id('copieparent')]), fichiersACopier: new Map([[id('srcfichier'), 'scan.png']]), dossiersARecreer: new Map([[id('srcdossier'), 'Nouveau']]),
  };
  const creer = (o: unknown) => ({ method: 'POST', body: JSON.stringify(o) });
  it('E : créer une racine étiquetée dans « Actifs » / « Inactifs », et nulle part ailleurs', () => {
    const ok = { name: 'Nom', mimeType: DOSSIER, parents: [ACTIFS], appProperties: { [ETIQUETTE_RACINE]: '146' } };
    expect(refusRequeteRacines(`${API}/files?supportsAllDrives=true`, creer(ok), 'racines', c)).toBeNull();
    expect(refusRequeteRacines(`${API}/files`, creer({ ...ok, parents: [RACINE] }), 'racines', c)).toMatch(/Actifs.*Inactifs/);
    expect(refusRequeteRacines(`${API}/files`, creer({ ...ok, parents: [SCANNES] }), 'racines', c)).toMatch(/nulle part ailleurs/);
    expect(refusRequeteRacines(`${API}/files`, creer({ ...ok, appProperties: {} }), 'racines', c)).toMatch(/étiquette/);
    expect(refusRequeteRacines(`${API}/files`, creer({ ...ok, name: 'Documents clients scannés' }), 'racines', c)).toMatch(/interdit/);
    expect(refusRequeteRacines(`${API}/files`, creer({ ...ok, name: 'Inactifs' }), 'racines', c)).toMatch(/interdit/);
  });
  it('E : déplacer d’un conteneur vers une racine du plan ; rien d’autre', () => {
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}?addParents=${RP}&removeParents=${ACTIFS}`, { method: 'PATCH', body: '{}' }, 'racines', c)).toBeNull();
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}?addParents=${SCANNES}&removeParents=${ACTIFS}`, { method: 'PATCH', body: '{}' }, 'racines', c)).toMatch(/pas une racine propriétaire/);
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}?addParents=${RP}&removeParents=${SCANNES}`, { method: 'PATCH', body: '{}' }, 'racines', c)).toMatch(/Actifs/);
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}?addParents=${RP}&removeParents=${ACTIFS}`, { method: 'PATCH', body: '{"name":"x"}' }, 'racines', c)).toMatch(/aucun autre changement/);
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}`, { method: 'PATCH', body: '{"trashed":true}' }, 'racines', c)).toMatch(/corbeille est refusée/);
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}`, { method: 'DELETE' }, 'racines', c)).toMatch(/refusé/);
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}/permissions`, { method: 'POST', body: '{}' }, 'racines', c)).toMatch(/refusé/);
    expect(refusRequeteRacines(`${API}/files/${id('copie1')}?alt=media`, { method: 'GET' }, 'racines', c)).toMatch(/alt=media/);
  });
  it('R : copier un ajout tardif relevé, nom exact, étiquette svav_source_id = l’original et elle seule, vers le dossier copié attendu', () => {
    const ok = { name: 'scan.png', parents: [id('copieparent')], appProperties: { svav_source_id: id('srcfichier') } };
    const u = `${API}/files/${id('srcfichier')}/copy?supportsAllDrives=true`;
    expect(refusRequeteRacines(u, creer(ok), 'rattrapage', c)).toBeNull();
    expect(refusRequeteRacines(`${API}/files/${id('autre')}/copy`, creer(ok), 'rattrapage', c)).toMatch(/pas un ajout tardif/);
    expect(refusRequeteRacines(u, creer({ ...ok, name: 'Copie de scan.png' }), 'rattrapage', c)).toMatch(/EXACTEMENT/);
    expect(refusRequeteRacines(u, creer({ ...ok, parents: [SCANNES] }), 'rattrapage', c)).toMatch(/destination/);
    expect(refusRequeteRacines(u, creer({ ...ok, appProperties: { svav_source_id: id('srcfichier'), autre: '1' } }), 'rattrapage', c)).toMatch(/elle seule/);
    // rien ne s'écrit DANS « Documents clients scannés » : ni création, ni déplacement, ni étiquette sur l'original
    expect(refusRequeteRacines(`${API}/files/${id('srcfichier')}`, { method: 'PATCH', body: '{"appProperties":{"x":"1"}}' }, 'rattrapage', c)).toMatch(/refusé en mode rattrapage/);
    expect(refusRequeteRacines(`${API}/files`, creer({ name: 'Nouveau', mimeType: DOSSIER, parents: [SCANNES], appProperties: { svav_source_id: id('srcdossier') } }), 'rattrapage', c)).toMatch(/destination/);
    expect(refusRequeteRacines(`${API}/files`, creer({ name: 'Nouveau', mimeType: DOSSIER, parents: [id('copieparent')], appProperties: { svav_source_id: id('srcdossier') } }), 'rattrapage', c)).toBeNull();
  });
  it('lecture : seul le GET de métadonnées passe', () => {
    expect(refusRequeteRacines(`${API}/files/${id('a')}?fields=id`, undefined, 'lecture', c)).toBeNull();
    expect(refusRequeteRacines(`${API}/files`, creer({}), 'lecture', c)).toMatch(/ne fait que lire/);
  });
});

describe('étape E — les verdicts', () => {
  const copie = (p: Partial<ElementLu> = {}): ElementLu => ({ id: id('copie1'), name: 'Nom (Ville)', mimeType: DOSSIER, parents: [ACTIFS], appProperties: { svav_source_id: id('src1') }, ...p });
  const attendu = { copieDossierId: id('copie1'), conteneurId: ACTIFS, racineId: RP };
  it('à déplacer depuis « Actifs » ; déjà sous la racine = reprise', () => {
    expect(verifierDeplacementSousRacine(copie(), sousActifs, attendu, ctx)).toEqual({ ok: true, deja: false });
    expect(verifierDeplacementSousRacine(copie({ parents: [RP] }), [{ id: RP, nom: 'Nom' }, ...sousActifs], attendu, ctx)).toEqual({ ok: true, deja: true });
  });
  it('refus : pas une copie, à la corbeille, ailleurs, sous « Documents clients scannés », racine hors de son conteneur', () => {
    expect(verifierDeplacementSousRacine(copie({ appProperties: {} }), sousActifs, attendu, ctx)).toMatchObject({ ok: false });
    expect(verifierDeplacementSousRacine(copie({ trashed: true }), sousActifs, attendu, ctx)).toMatchObject({ ok: false });
    expect(verifierDeplacementSousRacine(copie({ parents: [INACTIFS] }), [{ id: INACTIFS, nom: 'Inactifs' }, ...sousActifs.slice(1)], attendu, ctx)).toMatchObject({ ok: false, motif: expect.stringMatching(/quelqu’un l’a déplacé/) });
    expect(verifierDeplacementSousRacine(copie({ parents: [id('dcs1')] }), [{ id: id('dcs1'), nom: '1 actifs' }, { id: SCANNES, nom: 'Documents clients scannés' }], attendu, ctx)).toMatchObject({ ok: false });
    expect(verifierDeplacementSousRacine(copie({ parents: [RP] }), [{ id: RP, nom: 'Nom' }, { id: INACTIFS, nom: 'Inactifs' }, ...sousActifs.slice(1)], attendu, ctx)).toMatchObject({ ok: false });
  });
  it('une racine retrouvée doit porter l’étiquette de SA fiche, son nom et son conteneur', () => {
    const r: ElementLu = { id: RP, name: 'Nom', mimeType: DOSSIER, parents: [ACTIFS], appProperties: { [ETIQUETTE_RACINE]: '146' } };
    expect(verifierRacineTrouvee(r, { ficheId: 146, nom: 'Nom', conteneurId: ACTIFS })).toEqual({ ok: true, deja: true });
    expect(verifierRacineTrouvee(r, { ficheId: 147, nom: 'Nom', conteneurId: ACTIFS })).toMatchObject({ ok: false });
    expect(verifierRacineTrouvee({ ...r, name: 'Autre' }, { ficheId: 146, nom: 'Nom', conteneurId: ACTIFS })).toMatchObject({ ok: false });
  });
});

describe('étape R — la copie d’un ajout tardif', () => {
  const src: ElementLu = { id: id('srcfichier'), name: 'scan.png', mimeType: 'image/png', parents: [id('srcparent')] };
  const dest: ElementLu = { id: id('copieparent'), name: 'Locataire X', mimeType: DOSSIER, parents: [id('copiedossier')], appProperties: { svav_source_id: id('srcparent') } };
  const destChaine = [{ id: id('copiedossier'), nom: 'Nom' }, ...sousActifs];
  it('accepte : un fichier de « Documents clients scannés » vers la copie de son dossier parent', () => {
    expect(verifierCopieRattrapage(src, [id('srcparent'), SCANNES], dest, destChaine, ctx)).toEqual({ ok: true, deja: false });
  });
  it('refuse : un dossier, un original hors de « Documents clients scannés », une destination qui n’est pas la copie du parent ou qui est sous lui', () => {
    expect(verifierCopieRattrapage({ ...src, mimeType: DOSSIER }, [SCANNES], dest, destChaine, ctx)).toMatchObject({ ok: false });
    expect(verifierCopieRattrapage(src, [id('ailleurs')], dest, destChaine, ctx)).toMatchObject({ ok: false });
    expect(verifierCopieRattrapage(src, [SCANNES], { ...dest, appProperties: { svav_source_id: id('autre') } }, destChaine, ctx)).toMatchObject({ ok: false });
    expect(verifierCopieRattrapage(src, [SCANNES], dest, [{ id: id('x'), nom: '1 actifs' }, { id: SCANNES, nom: 'Documents clients scannés' }], ctx)).toMatchObject({ ok: false });
    expect(verifierCopieRattrapage(src, [SCANNES], dest, [{ id: ARRIVEE, nom: '00 Arrivée des mails' }, { id: RACINE, nom: 'Base de données locative' }], ctx)).toMatchObject({ ok: false });
  });
});

describe('étape D révisée — les exclusions', () => {
  const cites = new Set([id('cite1'), id('cite2')]);
  const ancetres = new Set([id('parent1')]);
  it('exclu : cité par une fiche ou un bien, parent d’un dossier cité, ou qui en contient un', () => {
    expect(motifExclusionCorbeille(id('cite1'), cites, ancetres, [])).toMatch(/encore cité/);
    expect(motifExclusionCorbeille(id('parent1'), cites, ancetres, [])).toMatch(/parent d’un dossier encore cité/);
    expect(motifExclusionCorbeille(id('autre'), cites, ancetres, [id('x'), id('cite2')])).toMatch(/contient le dossier/);
  });
  it('gardé dans la liste sinon', () => {
    expect(motifExclusionCorbeille(id('ancien'), cites, ancetres, [id('x')])).toBeNull();
  });
});

describe('étape F — le repointage des fiches ET des biens, en une transaction', () => {
  const interdits = new Set([RACINE, ACTIFS, INACTIFS, IMPORT]);
  const f = [{ id: 146, wippimmo: '79', ancien: id('principal'), nouveau: RP }];
  const b = [{ id: 7, wippimmo: '373', ancien: null, nouveau: id('sous1') }, { id: 49, wippimmo: '58', ancien: null, nouveau: id('copie2') }];
  it('refuse d’écrire la racine, « Actifs » ou « Inactifs » comme dossier d’une fiche OU d’un bien', () => {
    expect(() => sqlRepointageFichesEtBiens([{ ...f[0], nouveau: ACTIFS }], b, interdits, true)).toThrow(/jamais le dossier d’une fiche/);
    expect(() => sqlRepointageFichesEtBiens(f, [{ ...b[0], nouveau: RACINE }], interdits, true)).toThrow(/bien 7 .*jamais/);
    expect(() => sqlRepointageFichesEtBiens(f, [{ ...b[0], nouveau: INACTIFS }], interdits, false)).toThrow();
    expect(() => sqlRepointageFichesEtBiens([], [], interdits, false)).toThrow(/rien à repointer/);
    expect(() => sqlRepointageFichesEtBiens(f, [b[0], b[0]], interdits, false)).toThrow(/en double/);
  });
  it('essai : READ ONLY puis ROLLBACK, aucune écriture ; réel : verrou, UPDATE de drive_dossier_id SEUL sur les deux tables, relecture, COMMIT', () => {
    const essai = sqlRepointageFichesEtBiens(f, b, interdits, false);
    expect(essai).toMatch(/BEGIN TRANSACTION READ ONLY;/);
    expect(essai).toMatch(/ROLLBACK;/);
    expect(essai).not.toMatch(/UPDATE gestion_annuaire/);
    const reel = sqlRepointageFichesEtBiens(f, b, interdits, true);
    expect(reel).toMatch(/FOR UPDATE;\nSELECT id FROM gestion_annuaire_lot WHERE id IN \(7,49\) ORDER BY id FOR UPDATE;/);
    expect(reel.match(/UPDATE gestion_annuaire_(proprietaire|lot) [pl] SET ([a-z_]+) =/g)).toEqual([
      'UPDATE gestion_annuaire_proprietaire p SET drive_dossier_id =', 'UPDATE gestion_annuaire_lot l SET drive_dossier_id =']);
    expect(reel.indexOf('COMMIT;')).toBeGreaterThan(reel.indexOf('ecart_apres'));
  });
  it('arrêt si la migration 388 manque ou si une table porte un déclencheur ; une discordance annule TOUT (fiches et biens)', () => {
    const s = sqlRepointageFichesEtBiens(f, b, interdits, true);
    expect(s).toMatch(/publier d’abord \(migration 388\)/);
    expect(s).toMatch(/tgrelid IN \('gestion_annuaire_proprietaire'::regclass, 'gestion_annuaire_lot'::regclass\)/);
    expect(s).toMatch(/:f_absentes \+ :f_wippimmo \+ :f_change \+ :f_pris_ailleurs \+ :b_absents \+ :b_wippimmo \+ :b_change > 0/);
    expect(s).toMatch(/REPOINTAGE ANNULÉ : discordance/);
  });
  it('une liste de biens vide reste du SQL valide (aucun bien), une liste de fiches vide aussi', () => {
    expect(sqlRepointageFichesEtBiens(f, [], interdits, true)).toMatch(/\(NULL::bigint, NULL::text, NULL::text, NULL::text\)\) v\(id, wippimmo, ancien, nouveau\) WHERE id IS NOT NULL/);
    expect(sqlRepointageFichesEtBiens([], b, interdits, true)).toMatch(/WHERE id IN \(0\) ORDER BY id FOR UPDATE/);
  });
});
