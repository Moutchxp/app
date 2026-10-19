import { describe, expect, it } from 'vitest';
import {
  boutonDossierProprietaire, conteneurDeLaBranche, LIBELLE_SANS_DOSSIER_ATTITRE, motifRefusDossierAttitre, preciserRaisonLocataire,
  refusRequeteRangement, sqlRepointage, verifierCorbeilleDossier, verifierDeplacementCopie, type ContexteRangement, type ElementLu,
} from './rangementDossiersCopies';

/**
 * RANGEMENT DES DOSSIERS COPIÉS (Arno, 19/10/2026) — les verrous des scripts A (déplacement), B (repointage), D (corbeille),
 * le repli « racine » du bouton de la fiche et la raison « ancien / actuel locataire ». Identifiants fictifs.
 */
const id = (s: string) => `${s}${'x'.repeat(Math.max(0, 12 - s.length))}`;
const RACINE = id('racine'); const SCANNES = id('scannes'); const ARRIVEE = id('arrivee'); const IMPORT = id('import');
const ACTIFS = id('actifs'); const INACTIFS = id('inactifs'); const BRANCHE = id('branche1'); const DRIVE = id('0drive');
const ctx: ContexteRangement = { racineId: RACINE, scannesId: SCANNES, arriveeId: ARRIVEE, racineCopieId: IMPORT, destinations: { Actifs: ACTIFS, Inactifs: INACTIFS } };
const DOSSIER = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3';
const chaineCopie = [{ id: BRANCHE, nom: '1 actifs' }, { id: IMPORT, nom: 'Import Documents clients scannés – copie du 18-10-2026' }, { id: RACINE, nom: 'Base de données locative' }, { id: DRIVE, nom: 'Drive' }];

describe('point 4 — le bouton « dossier » de la fiche propriétaire', () => {
  it('dossier attitré → il s’ouvre, libellé inchangé', () => {
    expect(boutonDossierProprietaire(id('copie1'), RACINE)).toEqual({ href: `https://drive.google.com/drive/folders/${id('copie1')}`, libelle: 'Dossier Drive ↗', attitre: true });
  });
  it('aucun dossier attitré → la RACINE, et le libellé le dit en clair', () => {
    expect(boutonDossierProprietaire(null, RACINE)).toEqual({ href: `https://drive.google.com/drive/folders/${RACINE}`, libelle: 'Base de données locative (aucun dossier attitré)', attitre: false });
    expect(LIBELLE_SANS_DOSSIER_ATTITRE).toBe('Base de données locative (aucun dossier attitré)');
  });
  it('une fiche qui citerait la racine ou un conteneur n’a PAS de dossier attitré : repli, jamais « Dossier Drive »', () => {
    expect(boutonDossierProprietaire(RACINE, RACINE)?.attitre).toBe(false);
    expect(boutonDossierProprietaire(ACTIFS, RACINE, new Set([ACTIFS]))?.libelle).toBe(LIBELLE_SANS_DOSSIER_ATTITRE);
  });
  it('ni dossier ni racine connue → pas de bouton (rien d’inventé)', () => {
    expect(boutonDossierProprietaire(null, null)).toBeNull();
  });
});

describe('la racine, « Actifs », « Inactifs » ne sont JAMAIS le dossier attitré d’une fiche', () => {
  const interdits = new Set([RACINE, ACTIFS, INACTIFS, IMPORT, BRANCHE]);
  it('refus de la racine, des conteneurs, du dossier d’import, d’une branche ; un identifiant invalide est refusé', () => {
    for (const x of interdits) expect(motifRefusDossierAttitre(x, interdits)).toMatch(/jamais le dossier d’une fiche/);
    expect(motifRefusDossierAttitre("1'; DROP TABLE x;--", interdits)).toMatch(/invalide/);
    expect(motifRefusDossierAttitre(null, interdits)).toMatch(/invalide/);
    expect(motifRefusDossierAttitre(id('copie1'), interdits)).toBeNull();
  });
  it('le script de repointage refuse de s’écrire s’il viserait la racine (ou un conteneur), un doublon ou une valeur suspecte', () => {
    const l = { id: 7, wippimmo: '107', ancien: id('ancien7'), nouveau: id('copie7') };
    expect(() => sqlRepointage([{ ...l, nouveau: RACINE }], interdits, true)).toThrow(/jamais le dossier d’une fiche/);
    expect(() => sqlRepointage([{ ...l, nouveau: ACTIFS }], interdits, false)).toThrow(/jamais le dossier d’une fiche/);
    expect(() => sqlRepointage([l, l], interdits, true)).toThrow(/en double/);
    expect(() => sqlRepointage([l, { ...l, id: 8 }], interdits, true)).toThrow(/deux fiches/);
    expect(() => sqlRepointage([{ ...l, wippimmo: "1'; DELETE" }], interdits, true)).toThrow(/WIPPIMMO invalide/);
    expect(() => sqlRepointage([], interdits, true)).toThrow(/aucune fiche/);
  });
});

describe('le script psql du repointage (étape B)', () => {
  const lignes = [{ id: 7, wippimmo: '107', ancien: id('ancien7'), nouveau: id('copie7') }, { id: 9, wippimmo: 'app-9', ancien: null, nouveau: id('copie9') }];
  const n = (s: string) => s.replace(/\s+/g, ' ');
  it('essai : transaction READ ONLY, aucun UPDATE, ROLLBACK', () => {
    const s = n(sqlRepointage(lignes, new Set([RACINE]), false));
    expect(s).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(s).not.toMatch(/UPDATE gestion_annuaire_proprietaire/);
    expect(s).not.toContain('COMMIT');
    expect(s).toContain('ROLLBACK;');
  });
  it('réel : verrou des fiches, contrôles (déclencheur, identifiant, n° WIPPIMMO, dossier vu au calcul), une seule colonne écrite, relecture, COMMIT', () => {
    const s = n(sqlRepointage(lignes, new Set([RACINE]), true));
    expect(s).toContain('FOR UPDATE');
    expect(s).toContain("tgrelid = 'gestion_annuaire_proprietaire'::regclass");
    expect(s).toContain('wippimmo_id IS DISTINCT FROM wippimmo');
    expect(s).toContain('drive_dossier_id IS NOT DISTINCT FROM ancien');
    expect(s).toContain("RAISE EXCEPTION 'REPOINTAGE ANNULÉ : discordance'");
    expect(s).toMatch(/UPDATE gestion_annuaire_proprietaire p SET drive_dossier_id = rp\.nouveau FROM rp WHERE p\.id = rp\.id AND p\.wippimmo_id = rp\.wippimmo AND p\.drive_dossier_id IS NOT DISTINCT FROM rp\.ancien/);
    expect(s.match(/UPDATE /g)).toHaveLength(1);
    expect(s).not.toMatch(/DELETE|INSERT|TRUNCATE|ALTER|DROP/);
    expect(s).toContain("(9::bigint, 'app-9'::text, NULL::text,");
    expect(s.indexOf('COMMIT;')).toBeGreaterThan(s.indexOf('ecart_apres'));
  });
});

describe('point 7 — « ancien locataire X » / « locataire actuel X »', () => {
  it('en place l’emporte ; sinon ancien ; inconnu → la raison reste telle quelle', () => {
    const r = 'même nom + locataire DUPONT connu';
    expect(preciserRaisonLocataire(r, [{ nom: 'Dupont Jean', enPlace: true }])).toBe('même nom + locataire actuel DUPONT');
    expect(preciserRaisonLocataire(r, [{ nom: 'dupont', enPlace: false }])).toBe('même nom + ancien locataire DUPONT');
    expect(preciserRaisonLocataire(r, [{ nom: 'DUPONT A', enPlace: false }, { nom: 'Dupont B', enPlace: true }])).toBe('même nom + locataire actuel DUPONT');
    expect(preciserRaisonLocataire(r, [{ nom: 'MARTIN', enPlace: true }])).toBe(r);
    expect(preciserRaisonLocataire('même nom + adresse 1 rue X connue', [])).toBe('même nom + adresse 1 rue X connue');
  });
});

describe('le verrou des requêtes Drive des scripts', () => {
  const c = { racineId: RACINE, destinations: new Set([ACTIFS, INACTIFS]) };
  const f = `${API}/files/${id('copie1')}?supportsAllDrives=true`;
  it('lecture : GET de métadonnées seulement', () => {
    expect(refusRequeteRangement(f, undefined, 'lecture', c)).toBeNull();
    expect(refusRequeteRangement(`${f}&alt=media`, undefined, 'lecture', c)).toMatch(/alt=media/);
    expect(refusRequeteRangement(f, { method: 'PATCH', body: '{}' }, 'lecture', c)).toMatch(/ne fait que lire/);
    expect(refusRequeteRangement('https://example.com/x', undefined, 'lecture', c)).toMatch(/hors de l’API/);
  });
  it('déplacement : un addParents vers Actifs/Inactifs, un removeParents, corps vide ; rien d’autre', () => {
    expect(refusRequeteRangement(`${f}&addParents=${ACTIFS}&removeParents=${BRANCHE}`, { method: 'PATCH', body: '{}' }, 'deplacer', c)).toBeNull();
    expect(refusRequeteRangement(`${f}&addParents=${SCANNES}&removeParents=${BRANCHE}`, { method: 'PATCH', body: '{}' }, 'deplacer', c)).toMatch(/ni « Actifs » ni « Inactifs »/);
    expect(refusRequeteRangement(`${f}&addParents=${ACTIFS}&removeParents=${BRANCHE},${IMPORT}`, { method: 'PATCH', body: '{}' }, 'deplacer', c)).toMatch(/un seul parent/);
    expect(refusRequeteRangement(`${f}&addParents=${ACTIFS}&removeParents=${BRANCHE}`, { method: 'PATCH', body: '{"name":"x"}' }, 'deplacer', c)).toMatch(/aucun autre changement/);
    expect(refusRequeteRangement(f, { method: 'PATCH', body: '{"trashed":true}' }, 'deplacer', c)).toMatch(/destination/);
  });
  it('création : seulement « Actifs » ou « Inactifs », un dossier, sous la racine', () => {
    const cree = (o: object) => refusRequeteRangement(`${API}/files?supportsAllDrives=true`, { method: 'POST', body: JSON.stringify(o) }, 'deplacer', c);
    expect(cree({ name: 'Actifs', mimeType: DOSSIER, parents: [RACINE] })).toBeNull();
    expect(cree({ name: 'Inactifs', mimeType: DOSSIER, parents: [RACINE] })).toBeNull();
    expect(cree({ name: 'Autre', mimeType: DOSSIER, parents: [RACINE] })).toMatch(/seul « Actifs »/);
    expect(cree({ name: 'Actifs', mimeType: DOSSIER, parents: [SCANNES] })).toMatch(/parent doit être la racine/);
    expect(cree({ name: 'Actifs', mimeType: 'text/plain', parents: [RACINE] })).toMatch(/seul un dossier/);
    expect(cree({ name: 'Actifs', mimeType: DOSSIER, parents: [RACINE], appProperties: {} })).toMatch(/champs inattendus/);
  });
  it('corbeille : PATCH au corps EXACTEMENT {"trashed":true} ; jamais DELETE, emptyTrash, copie, permissions, restauration', () => {
    expect(refusRequeteRangement(f, { method: 'PATCH', body: '{"trashed": true}' }, 'corbeille', c)).toBeNull();
    expect(refusRequeteRangement(f, { method: 'PATCH', body: '{"trashed":false}' }, 'corbeille', c)).toMatch(/exactement/);
    expect(refusRequeteRangement(f, { method: 'PATCH', body: '{"trashed":true,"name":"x"}' }, 'corbeille', c)).toMatch(/exactement/);
    expect(refusRequeteRangement(`${f}&addParents=${ACTIFS}`, { method: 'PATCH', body: '{"trashed":true}' }, 'corbeille', c)).toMatch(/aucun déplacement/);
    for (const m of ['deplacer', 'corbeille'] as const) {
      expect(refusRequeteRangement(f, { method: 'DELETE' }, m, c)).not.toBeNull();
      expect(refusRequeteRangement(`${API}/files/trash?driveId=x`, { method: 'DELETE' }, m, c)).not.toBeNull();
      expect(refusRequeteRangement(`${API}/files/emptyTrash`, { method: 'DELETE' }, m, c)).not.toBeNull();
      expect(refusRequeteRangement(`${API}/files/${id('copie1')}/copy`, { method: 'POST', body: '{}' }, m, c)).not.toBeNull();
      expect(refusRequeteRangement(`${API}/files/${id('copie1')}/permissions`, { method: 'POST', body: '{}' }, m, c)).not.toBeNull();
    }
  });
});

describe('étape A — le déplacement d’un dossier copié', () => {
  const d = (p: Partial<ElementLu> = {}): ElementLu => ({ id: id('copie1'), name: 'NOM', mimeType: DOSSIER, parents: [BRANCHE], appProperties: { svav_source_id: id('orig1') }, ...p });
  const att = { copieDossierId: id('copie1'), sourceId: id('orig1'), brancheCopieId: BRANCHE, vers: 'Actifs' as const };
  it('une copie dans sa branche → à déplacer ; déjà dans « Actifs » → reprise', () => {
    expect(verifierDeplacementCopie(d(), chaineCopie, att, ctx)).toEqual({ ok: true, deja: false });
    expect(verifierDeplacementCopie(d({ parents: [ACTIFS] }), [{ id: ACTIFS, nom: 'Actifs' }, { id: RACINE, nom: 'Base de données locative' }], att, ctx)).toEqual({ ok: true, deja: true });
  });
  it('refus : pas une copie, la copie d’un autre original, à la corbeille, pas un dossier, protégé', () => {
    expect(verifierDeplacementCopie(d({ appProperties: {} }), chaineCopie, att, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/pas une copie/) });
    expect(verifierDeplacementCopie(d({ appProperties: { svav_source_id: id('autre') } }), chaineCopie, att, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/le plan attendait/) });
    expect(verifierDeplacementCopie(d({ trashed: true }), chaineCopie, att, ctx).ok).toBe(false);
    expect(verifierDeplacementCopie(d({ mimeType: 'application/pdf' }), chaineCopie, att, ctx).ok).toBe(false);
    expect(verifierDeplacementCopie(d({ id: IMPORT }), chaineCopie, { ...att, copieDossierId: IMPORT }, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/protégé/) });
  });
  it('refus : sous « Documents clients scannés » (identifiant OU nom), sous « 00 Arrivée des mails », hors racine, déplacé ailleurs', () => {
    expect(verifierDeplacementCopie(d(), [...chaineCopie.slice(0, 1), { id: SCANNES, nom: 'X' }, ...chaineCopie.slice(1)], att, ctx).ok).toBe(false);
    expect(verifierDeplacementCopie(d(), [...chaineCopie.slice(0, 1), { id: id('z'), nom: 'Documents clients scannés' }, ...chaineCopie.slice(1)], att, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/ne perd ni ne reçoit/) });
    expect(verifierDeplacementCopie(d(), [chaineCopie[0], { id: ARRIVEE, nom: '00 Arrivée des mails' }, ...chaineCopie.slice(1)], att, ctx).ok).toBe(false);
    expect(verifierDeplacementCopie(d(), [chaineCopie[0], { id: DRIVE, nom: 'Drive' }], att, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/pas sous « Base de données locative »/) });
    expect(verifierDeplacementCopie(d({ parents: [id('ailleurs')] }), [{ id: id('ailleurs'), nom: 'Y' }, ...chaineCopie.slice(1)], att, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/quelqu’un l’a déplacé/) });
    expect(verifierDeplacementCopie(d(), [], att, ctx)).toEqual({ ok: false, motif: expect.stringMatching(/ne pas savoir vaut refus/) });
  });
  it('« 1 actifs » → Actifs ; « 2 vendus », « 3 perdus » → Inactifs', () => {
    expect([conteneurDeLaBranche('1 actifs'), conteneurDeLaBranche('2 vendus'), conteneurDeLaBranche('3 perdus')]).toEqual(['Actifs', 'Inactifs', 'Inactifs']);
  });
});

describe('étape D — la corbeille', () => {
  const ANCIEN = id('ancien1'); const ESSAI = id('essai1');
  const base = { ...ctx, liste: new Map<string, 'ancien' | 'essai'>([[ANCIEN, 'ancien'], [ESSAI, 'essai']]), citesParUneFiche: new Set<string>(), sortesMemorisees: new Map([[ANCIEN, 'proprietaire']]) };
  const chaineAncien = [{ id: id('props'), nom: '1 Propriétaires' }, { id: RACINE, nom: 'Base de données locative' }, { id: DRIVE, nom: 'Drive' }];
  const ancien = (p: Partial<ElementLu> = {}): ElementLu => ({ id: ANCIEN, name: 'NOM', mimeType: DOSSIER, parents: [id('props')], ...p });
  const essai = (p: Partial<ElementLu> = {}): ElementLu => ({ id: ESSAI, name: '_TEST CLAUDE arbre à supprimer par Arno', mimeType: DOSSIER, parents: [RACINE], ...p });
  const vide = { fichiers: 0, copies: 0, copiesOfficielles: 0 };
  it('un ancien dossier propriétaire, sans fichier, plus cité par aucune fiche → accepté ; déjà à la corbeille → reprise', () => {
    expect(verifierCorbeilleDossier(ancien(), chaineAncien, vide, base)).toEqual({ ok: true, deja: false });
    expect(verifierCorbeilleDossier(ancien({ trashed: true }), chaineAncien, vide, base)).toEqual({ ok: true, deja: true });
  });
  it('refus : encore cité par une fiche, un fichier dedans, une copie dedans, pas un dossier propriétaire mémorisé, hors liste', () => {
    expect(verifierCorbeilleDossier(ancien(), chaineAncien, vide, { ...base, citesParUneFiche: new Set([ANCIEN]) })).toEqual({ ok: false, motif: expect.stringMatching(/encore le dossier d’une fiche/) });
    expect(verifierCorbeilleDossier(ancien(), chaineAncien, { ...vide, fichiers: 1 }, base)).toEqual({ ok: false, motif: expect.stringMatching(/1 fichier/) });
    expect(verifierCorbeilleDossier(ancien(), chaineAncien, { ...vide, copies: 1 }, base)).toEqual({ ok: false, motif: expect.stringMatching(/copié/) });
    expect(verifierCorbeilleDossier(ancien(), chaineAncien, vide, { ...base, sortesMemorisees: new Map([[ANCIEN, 'bien']]) }).ok).toBe(false);
    expect(verifierCorbeilleDossier(ancien({ id: id('inconnu') }), chaineAncien, vide, base)).toEqual({ ok: false, motif: expect.stringMatching(/liste nominative/) });
  });
  it('jamais un dossier copié, jamais sous « Documents clients scannés », l’arrivée, le dossier d’import, Actifs ou Inactifs', () => {
    expect(verifierCorbeilleDossier(ancien({ appProperties: { svav_source_id: id('o') } }), chaineAncien, vide, base)).toEqual({ ok: false, motif: expect.stringMatching(/COPIÉ/) });
    for (const [x, nom] of [[SCANNES, 'X'], [id('n'), 'Documents clients scannés'], [ARRIVEE, '00 Arrivée des mails'], [IMPORT, 'Import'], [ACTIFS, 'Actifs'], [INACTIFS, 'Inactifs']]) {
      expect(verifierCorbeilleDossier(ancien({ parents: [x] }), [{ id: x, nom }, ...chaineAncien.slice(1)], vide, base).ok).toBe(false);
    }
    expect(verifierCorbeilleDossier(ancien({ id: RACINE }), chaineAncien, vide, { ...base, liste: new Map([[RACINE, 'ancien']]) }).ok).toBe(false);
  });
  it('dossier d’essai : à même la racine, nom « _TEST CLAUDE … » ou « _TEST COPIE » ; ses fichiers et copies d’essai partent, jamais une copie officielle', () => {
    expect(verifierCorbeilleDossier(essai(), [{ id: RACINE, nom: 'Base de données locative' }], { fichiers: 12, copies: 8, copiesOfficielles: 0 }, base)).toEqual({ ok: true, deja: false });
    expect(verifierCorbeilleDossier(essai({ name: '_TEST COPIE' }), [{ id: RACINE, nom: 'Base de données locative' }], vide, base).ok).toBe(true);
    expect(verifierCorbeilleDossier(essai(), [{ id: RACINE, nom: 'Base de données locative' }], { fichiers: 1, copies: 1, copiesOfficielles: 1 }, base)).toEqual({ ok: false, motif: expect.stringMatching(/officielle/) });
    expect(verifierCorbeilleDossier(essai({ name: 'Vrai dossier' }), [{ id: RACINE, nom: 'Base de données locative' }], vide, base)).toEqual({ ok: false, motif: expect.stringMatching(/pas un dossier d’essai/) });
    expect(verifierCorbeilleDossier(essai({ parents: [id('props')] }), chaineAncien, vide, base)).toEqual({ ok: false, motif: expect.stringMatching(/pas à même la racine/) });
  });
});

describe('la fiche propriétaire lit son dossier ATTITRÉ, et se replie sur la racine', () => {
  it('annuaireRepo rend `drive_dossier_id` (plus l’ancienne arborescence) et la racine ; l’en-tête passe par le repli', async () => {
    const { readFileSync } = await import('node:fs');
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('driveDossierId: p.drive_dossier_id ?? null');
    expect(repo).not.toContain("driveDossierId: await dossierDriveDe('proprietaire'");
    expect(repo).toContain('racineDriveId: await racineDrive()');
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(ecran).toContain('boutonDossierProprietaire(f.driveDossierId, f.racineDriveId ?? null)');
  });
});
