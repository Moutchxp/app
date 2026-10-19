import { describe, expect, it } from 'vitest';
import {
  bailDansLAnnee, bauxDuBien, choisirAdresseBan, CLASSEMENT_ORIGINE, construirePlanArbo, decouperAdresse, designationLot, ETIQUETTE_ARBO,
  inseeParis, deplacementsDuProprietaire, nomAdresse, nomBail, nomBienArbo, partagerEnBiens, refusRequeteArbo, sqlEnregistrementArbo, noeudClassementOrigine,
  type CandidatBan, type ContexteRequetesArbo, type LotArbo, type ProprietaireArbo,
} from './arborescenceDrive';

const lot = (id: number, o: Partial<LotArbo> = {}): LotArbo => ({
  id, wippimmo: String(100 + id), proprietaireId: 1, adresse: '12 rue de la Paix', codePostal: '75002', commune: 'Paris',
  nature: 'Appartement', typeBien: 'Type 2', categorie: null, porte: null, inactif: false, annexeDetachee: false, ...o,
});
const prop = (id: number, o: Partial<ProprietaireArbo> = {}): ProprietaireArbo => ({ id, wippimmo: String(id), nom: `NOM${id} Prénom`, actif: true, n3Existants: {}, ...o });
const ID = (s: string) => `${s}${'x'.repeat(Math.max(0, 20 - s.length))}`;
const BAN: CandidatBan = { cle: '75102_1234_00012', numero: 12, suffixe: null, nomVoie: 'Rue de la Paix', nomCommune: 'Paris 2e Arrondissement', insee: '75102' };

describe('nommage N4 : adresse BAN normalisée, sinon telle qu’en base', () => {
  it('découpe numéro, suffixe et voie, abréviations développées', () => {
    expect(decouperAdresse('12 bis av. de la Paix')).toEqual({ numero: 12, suffixe: 'bis', voie: ['avenue', 'de', 'la', 'paix'] });
    expect(decouperAdresse('3B r Saint-Jean')).toEqual({ numero: 3, suffixe: 'b', voie: ['rue', 'saint', 'jean'] });
    expect(decouperAdresse('Résidence les Pins')).toBeNull();
  });
  it('Paris : l’arrondissement vient du code postal, la commune s’écrit « Paris »', () => {
    expect(inseeParis('75002')).toBe('75102'); expect(inseeParis('75116')).toBe('75116'); expect(inseeParis('92800')).toBeNull();
    expect(choisirAdresseBan(lot(1), [BAN])).toEqual({ cle: BAN.cle, libelle: '12 Rue de la Paix, 75002 Paris' });
    expect(choisirAdresseBan(lot(1, { codePostal: '75003' }), [BAN])).toBeNull();
  });
  it('hors Paris : même commune exigée ; ambigu ou absent = non normalisable', () => {
    const p: CandidatBan = { cle: '92062_1', numero: 5, suffixe: null, nomVoie: 'Rue Charcot', nomCommune: 'Puteaux', insee: '92062' };
    const l = lot(1, { adresse: '5 r Charcot', codePostal: '92800', commune: 'PUTEAUX' });
    expect(choisirAdresseBan(l, [p])?.libelle).toBe('5 Rue Charcot, 92800 Puteaux');
    expect(choisirAdresseBan(l, [p, { ...p, cle: '92062_2' }])).toBeNull();
    expect(choisirAdresseBan({ ...l, commune: 'Suresnes' }, [p])).toBeNull();
  });
  it('le nom N4 : le libellé BAN, sinon l’adresse telle qu’en base, sinon « Adresse non renseignée »', () => {
    expect(nomAdresse(lot(1), { cle: 'k', libelle: '12 Rue de la Paix, 75002 Paris' })).toBe('12 Rue de la Paix, 75002 Paris');
    expect(nomAdresse(lot(1, { adresse: '12  rue X' }), null)).toBe('12 rue X, 75002 Paris');
    expect(nomAdresse(lot(1, { adresse: null, codePostal: null, commune: null }), null)).toBe('Adresse non renseignée');
  });
});

describe('nommage N5 et bail', () => {
  it('N5 = le logement puis ses annexes liées, chaque lot avec son numéro', () => {
    expect(designationLot(lot(1, { nature: 'A renseigner', typeBien: null }))).toBe('Bien (lot 101)');
    expect(designationLot(lot(1, { nature: 'Garage', typeBien: 'Garage' }))).toBe('Garage (lot 101)');
    expect(designationLot(lot(1, { wippimmo: 'app-9' }))).toBe('Appartement Type 2');
    expect(nomBienArbo(lot(1), [lot(3, { nature: 'Parking', typeBien: null }), lot(2, { nature: 'Cave', typeBien: null, porte: '3' })]))
      .toBe('Appartement Type 2 (lot 101) + Cave n°3 (lot 102) + Parking (lot 103)');
  });
  it('« Bail JJ/MM/AAAA – NOMS » ; date inconnue dite, jamais inventée', () => {
    expect(nomBail('2022-09-01', ['DUPONT Jean', 'MARTIN Léa', 'DUPONT Jean'])).toBe('Bail 01/09/2022 – DUPONT Jean, MARTIN Léa');
    expect(nomBail(null, [])).toBe('Bail date inconnue – locataire inconnu');
  });
  it('un bail = les occupations des lots du bien à la même entrée ; en cours si l’une n’a pas de sortie', () => {
    const b = bauxDuBien({ teteId: 1, lotIds: [1, 2] }, [
      { id: 1, lotId: 1, entree: '2020-01-01', sortie: '2023-06-30', locataire: 'A' },
      { id: 2, lotId: 2, entree: '2020-01-01', sortie: '2023-06-30', locataire: 'A' },
      { id: 3, lotId: 1, entree: '2023-07-01', sortie: null, locataire: 'B' },
      { id: 4, lotId: 9, entree: '2023-07-01', sortie: null, locataire: 'Z' },
    ]);
    expect(b.map((x) => [x.cle, x.sortie, x.nom])).toEqual([
      ['l:1:2020-01-01', '2023-06-30', 'Bail 01/01/2020 – A'], ['l:1:2023-07-01', null, 'Bail 01/07/2023 – B']]);
    expect([bailDansLAnnee(b[0], 2026), bailDansLAnnee(b[1], 2026), bailDansLAnnee({ sortie: '2026-03-31' }, 2026)]).toEqual([false, true, true]);
  });
});

describe('les biens : logement + annexes liées ; lot orphelin autonome', () => {
  it('une annexe liée n’a pas de dossier propre ; une annexe détachée devient un bien orphelin', () => {
    const lots = [lot(1), lot(2, { nature: 'Cave' }), lot(3, { nature: 'Parking', annexeDetachee: true }), lot(4)];
    const b = partagerEnBiens(lots, [{ annexeId: 2, parentId: 1 }, { annexeId: 3, parentId: 1 }], []);
    expect(b.map((x) => [x.teteId, x.lotIds, x.origineTeteId])).toEqual([[3, [3], 1], [1, [1, 2], null], [4, [4], null]]);
  });
  it('une fiche autonome ouverte est un bien ; sans son logement d’origine, elle est orpheline', () => {
    const lots = [lot(1), lot(2), lot(3)];
    const b = partagerEnBiens(lots, [{ annexeId: 2, parentId: 1 }, { annexeId: 3, parentId: 1 }], [{ origineId: 1, teteId: 2, lotIds: [2, 3] }]);
    expect(b.map((x) => [x.teteId, x.lotIds, x.origineTeteId])).toEqual([[2, [2, 3], 1], [1, [1], null]]);
  });
  it('un bien est inactif quand TOUS ses lots le sont', () => {
    const b = partagerEnBiens([lot(1, { inactif: true }), lot(2)], [{ annexeId: 2, parentId: 1 }], []);
    expect(b[0].inactif).toBe(false);
  });
});

describe('le plan N3 → N10', () => {
  const occ = [{ id: 1, lotId: 1, entree: '2023-07-01', sortie: null, locataire: 'B' }, { id: 2, lotId: 1, entree: '2019-01-01', sortie: '2023-06-30', locataire: 'A' }];
  const base = { annee: 2026, annexes: [], regroupements: [], occupations: occ, adresses: new Map(), exclus: new Set<number>() };

  it('un bien actif : N6 complet, PNO/Taxe foncière › 2026, un N7 par bail, 2026 seulement pour le bail en cours', () => {
    const p = construirePlanArbo({ ...base, proprietaires: [prop(1, { n3Existants: { Actifs: { id: ID('copie'), nom: 'Nom1 copie' } } })], lots: [lot(1)] });
    const noms = (parent: string) => p.noeuds.filter((n) => n.parent === parent).map((n) => n.nom);
    expect(noms('b:1')).toEqual(['0 En attente', '1 Propriétaire', '2 Diagnostics', '3 Photos', '4 Syndic', '5 Travaux', '6 Locataires']);
    expect(noms('r:1:1')).toEqual(['PNO', 'Taxe foncière']);
    expect(noms('pr:1:0')).toEqual(['2026']);
    expect(noms('r:1:6')).toEqual(['Bail 01/01/2019 – A', 'Bail 01/07/2023 – B']);
    expect(noms('l:1:2023-07-01')).toEqual(['1 Papiers d’identité', '2 Profil financier', '3 Garants', '4 GLI', '5 Assurances', '6 Entretien']);
    expect(noms('l:1:2023-07-01:5')).toEqual(['Assurance habitation']); expect(noms('l:1:2023-07-01:6')).toEqual(['Chaudière']);
    expect(noms('l:1:2023-07-01:5:s')).toEqual(['2026']); expect(noms('l:1:2019-01-01:5:s')).toEqual([]);
    const n3 = p.noeuds.find((n) => n.cle === 'p:1:A')!;
    expect(n3.existant).toBe(ID('copie'));
    expect(p.fiches).toEqual([{ id: 1, wippimmo: '1', n3: 'p:1:A' }]);
    expect(p.lots).toEqual([{ id: 1, wippimmo: '101', n5: 'b:1' }]);
    expect(p.noeuds.every((n) => n.annee === undefined || n.annee === 2026)).toBe(true);
  });
  it('bien vendu d’un propriétaire qui garde des biens actifs : seul ce N5 va dans Inactifs (N3/N4 recréés), sans dossier annuel', () => {
    const p = construirePlanArbo({ ...base, occupations: [], proprietaires: [prop(1, { n3Existants: { Actifs: { id: ID('copie'), nom: 'Nom1' } } })],
      lots: [lot(1), lot(2, { inactif: true })] });
    const n5 = p.noeuds.find((n) => n.cle === 'b:2')!;
    expect(n5.branche).toBe('Inactifs');
    const n3i = p.noeuds.find((n) => n.cle === 'p:1:I')!;
    expect([n3i.existant, n3i.nom]).toEqual([null, 'Nom1']);
    expect(p.noeuds.filter((n) => n.sorte === 'annee' && n.lotId === 2)).toEqual([]);
    expect(p.noeuds.filter((n) => n.sorte === 'annee' && n.lotId === 1)).toHaveLength(2);
  });
  it('propriétaire inactif : tout dans Inactifs, aucun dossier annuel ; propriétaire sans bien : son N3 seul', () => {
    const p = construirePlanArbo({ ...base, proprietaires: [prop(1, { actif: false }), prop(2)], lots: [lot(1)] });
    expect(p.noeuds.filter((n) => n.sorte === 'annee')).toEqual([]);
    expect(p.noeuds.find((n) => n.cle === 'b:1')!.branche).toBe('Inactifs');
    expect(p.fiches.map((f) => f.n3)).toEqual(['p:1:I', 'p:2:A']);
  });
  it('lot orphelin : N5 propre, « 1 Propriétaire » à « 4 Syndic » en raccourcis vers le bien d’origine ; 0, 5, 6 propres avec les baux', () => {
    const p = construirePlanArbo({ ...base, occupations: [{ id: 9, lotId: 3, entree: '2025-01-01', sortie: null, locataire: 'C' }],
      proprietaires: [prop(1)], lots: [lot(1), lot(3, { annexeDetachee: true, nature: 'Parking' })], annexes: [{ annexeId: 3, parentId: 1 }] });
    const r = p.noeuds.filter((n) => n.parent === 'b:3');
    expect(r.map((n) => [n.nom, n.sorte, n.cible ?? null])).toEqual([
      ['0 En attente', 'rubrique', null], ['1 Propriétaire', 'raccourci', 'r:1:1'], ['2 Diagnostics', 'raccourci', 'r:1:2'],
      ['3 Photos', 'raccourci', 'r:1:3'], ['4 Syndic', 'raccourci', 'r:1:4'], ['5 Travaux', 'rubrique', null], ['6 Locataires', 'rubrique', null]]);
    expect(p.noeuds.filter((n) => n.parent === 'r:3:6').map((n) => n.nom)).toEqual(['Bail 01/01/2025 – C']);
    expect(p.noeuds.some((n) => n.parent === 'r:3:1')).toBe(false);
  });
  it('N4 : deux biens de la même adresse BAN partagent leur N4 ; adresse non normalisable signalée', () => {
    const ban = { cle: 'k1', libelle: '12 Rue de la Paix, 75002 Paris' };
    const p = construirePlanArbo({ ...base, occupations: [], proprietaires: [prop(1)], lots: [lot(1), lot(2, { adresse: '12 r. de la Paix' }), lot(3, { adresse: 'Bât. B' })],
      adresses: new Map([[1, ban], [2, ban], [3, null]]) });
    const n4 = p.noeuds.filter((n) => n.sorte === 'adresse');
    expect(n4.map((n) => n.nom)).toEqual(['12 Rue de la Paix, 75002 Paris', 'Bât. B, 75002 Paris']);
    expect(p.signalements.some((s) => s.includes('lot 3') && s.includes('non normalisable'))).toBe(true);
  });
  it('les propriétaires exclus (décision 4) ne reçoivent rien ; « Classement d’origine » est directement sous le N3', () => {
    const p = construirePlanArbo({ ...base, proprietaires: [prop(1), prop(2)], lots: [lot(1), lot(2, { proprietaireId: 2 })], exclus: new Set([2]) });
    expect(p.noeuds.some((n) => n.proprietaireId === 2)).toBe(false);
    expect(p.fiches.map((f) => f.id)).toEqual([1]);
    const co = noeudClassementOrigine(p.noeuds.find((n) => n.cle === 'p:1:A')!);
    expect([co.cle, co.parent, co.nom]).toEqual(['co:p:1:A', 'p:1:A', CLASSEMENT_ORIGINE]);
  });
});

describe('🔴 le verrou des requêtes Drive : créer le plan, déplacer le plan, rien d’autre', () => {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const ctx: ContexteRequetesArbo = {
    parentsPermis: new Set([ID('actifs'), ID('n5')]),
    creations: new Map([['b:1', { parent: ID('actifs'), nom: 'Appartement (lot 1)', mime: 'dossier' as const }],
      ['r:3:1', { parent: ID('n5'), nom: '1 Propriétaire', mime: 'raccourci' as const, cible: ID('cible') }]]),
    deplacements: new Map([[ID('fichier'), { de: ID('copie'), vers: ID('attente') }]]),
    interdits: new Set([ID('racine'), ID('scannes'), ID('arrivee')]),
  };
  const creer = (o: Record<string, unknown>) => refusRequeteArbo(API, { method: 'POST', body: JSON.stringify(o) }, 'creation', ctx);
  const dossier = { name: 'Appartement (lot 1)', mimeType: 'application/vnd.google-apps.folder', parents: [ID('actifs')], appProperties: { [ETIQUETTE_ARBO]: 'b:1' } };
  it('création : le dossier exact du plan passe ; tout écart est refusé', () => {
    expect(creer(dossier)).toBeNull();
    expect(creer({ ...dossier, name: 'Autre' })).toMatch(/nom/);
    expect(creer({ ...dossier, parents: [ID('n5')] })).toMatch(/parent/);
    expect(creer({ ...dossier, appProperties: { [ETIQUETTE_ARBO]: 'b:2' } })).toMatch(/pas un nœud du plan/);
    expect(creer({ ...dossier, appProperties: { [ETIQUETTE_ARBO]: 'b:1', autre: 'x' } })).toMatch(/étiquette/);
    expect(creer({ ...dossier, description: 'x' })).toMatch(/un dossier, et rien d’autre/);
    expect(creer({ ...dossier, name: 'Documents clients scannés' })).toMatch(/nom/);
  });
  it('création d’un raccourci : seulement vers la rubrique du bien d’origine prévue', () => {
    const r = { name: '1 Propriétaire', mimeType: 'application/vnd.google-apps.shortcut', parents: [ID('n5')], appProperties: { [ETIQUETTE_ARBO]: 'r:3:1' }, shortcutDetails: { targetId: ID('cible') } };
    expect(creer(r)).toBeNull();
    expect(creer({ ...r, shortcutDetails: { targetId: ID('scannes') } })).toMatch(/cible/);
  });
  it('déplacement : exactement le couple du plan, corps vide', () => {
    const u = (a: string, r: string) => `${API}/${ID('fichier')}?supportsAllDrives=true&addParents=${a}&removeParents=${r}`;
    expect(refusRequeteArbo(u(ID('attente'), ID('copie')), { method: 'PATCH', body: '' }, 'deplacement', ctx)).toBeNull();
    expect(refusRequeteArbo(u(ID('autre'), ID('copie')), { method: 'PATCH', body: '' }, 'deplacement', ctx)).toMatch(/différente/);
    expect(refusRequeteArbo(u(ID('attente'), ID('copie')), { method: 'PATCH', body: '{"name":"x"}' }, 'deplacement', ctx)).toMatch(/aucun autre changement/);
    expect(refusRequeteArbo(`${API}/${ID('autre')}?addParents=${ID('attente')}&removeParents=${ID('copie')}`, { method: 'PATCH', body: '' }, 'deplacement', ctx)).toMatch(/pas au plan/);
  });
  it('🔴 interdictions : corbeille, suppression, copie, partage, contenu, renommage', () => {
    expect(refusRequeteArbo(`${API}/${ID('fichier')}`, { method: 'PATCH', body: '{"trashed":true}' }, 'deplacement', ctx)).toMatch(/corbeille/);
    expect(refusRequeteArbo(`${API}/${ID('fichier')}`, { method: 'DELETE' }, 'deplacement', ctx)).toMatch(/DELETE/);
    expect(refusRequeteArbo(`${API}/${ID('fichier')}/copy`, { method: 'POST', body: '{}' }, 'creation', ctx)).toMatch(/copy refusé/);
    expect(refusRequeteArbo(`${API}/${ID('fichier')}/permissions`, { method: 'POST', body: '{}' }, 'creation', ctx)).toMatch(/permissions/);
    expect(refusRequeteArbo(`${API}/trash`, { method: 'DELETE' }, 'creation', ctx)).toMatch(/DELETE/);
    expect(refusRequeteArbo(`${API}/${ID('fichier')}?alt=media`, { method: 'GET' }, 'lecture', ctx)).toMatch(/alt=media/);
    expect(refusRequeteArbo(`${API}/${ID('fichier')}`, { method: 'PATCH', body: '{"name":"x"}' }, 'creation', ctx)).toMatch(/refusé en mode création/);
    expect(refusRequeteArbo(API, { method: 'POST', body: JSON.stringify(dossier) }, 'lecture', ctx)).toMatch(/ne fait que lire/);
  });
});

describe('K : les identifiants enregistrés, en une transaction', () => {
  const noeud = { cle: 'b:1', sorte: 'bien' as const, niveau: 5, driveId: ID('n5'), parentDriveId: ID('n4'), branche: 'Actifs' as const, proprietaireId: 1, lotId: 1, nom: 'Appartement (lot 1)', cibleDriveId: null, annee: null, bailEntree: null };
  const n3 = { ...noeud, cle: 'p:1:A', sorte: 'proprietaire' as const, niveau: 3, driveId: ID('n3'), lotId: null };
  it('essai : READ ONLY, aucun INSERT ni UPDATE ; réel : insère, repointe, relit, COMMIT', () => {
    const essai = sqlEnregistrementArbo([noeud, n3], [{ id: 1, wippimmo: '1', ancien: null, nouveau: ID('n3') }], [{ id: 1, wippimmo: '101', ancien: null, nouveau: ID('n5') }], new Set(), 'Arno', false);
    expect(essai).toContain('BEGIN TRANSACTION READ ONLY');
    expect(essai).not.toMatch(/INSERT INTO|UPDATE gestion/);
    expect(essai).toContain('migration 389 absente');
    const reel = sqlEnregistrementArbo([noeud, n3], [{ id: 1, wippimmo: '1', ancien: null, nouveau: ID('n3') }], [{ id: 1, wippimmo: '101', ancien: null, nouveau: ID('n5') }], new Set(), 'Arno', true);
    expect(reel).toContain('INSERT INTO gestion_drive_noeud');
    expect(reel).toContain('ENREGISTREMENT ANNULÉ : discordance');
    expect(reel.trimEnd()).toMatch(/COMMIT;\n\\echo 'ENREGISTREMENT FAIT/);
  });
  it('refuse de s’écrire : identifiant interdit, doublon, fiche vers un dossier hors du plan', () => {
    expect(() => sqlEnregistrementArbo([noeud], [], [], new Set([ID('n5')]), 'Arno', false)).toThrow(/interdit/);
    expect(() => sqlEnregistrementArbo([noeud, { ...noeud, cle: 'b:2' }], [], [], new Set(), 'Arno', false)).toThrow(/double/);
    expect(() => sqlEnregistrementArbo([noeud], [{ id: 1, wippimmo: '1', ancien: null, nouveau: ID('ailleurs') }], [], new Set(), 'Arno', false)).toThrow(/pas un nœud/);
    expect(() => sqlEnregistrementArbo([{ ...noeud, cle: "b:1'; DROP" }], [], [], new Set(), 'Arno', false)).toThrow(/clé invalide/);
  });
});

describe('J : le contenu d’origine, déplacé entier — « 0 En attente » du bien, sinon « Classement d’origine »', () => {
  const f = (id: string, o: Partial<{ dossier: boolean; raccourci: boolean; vide: boolean }> = {}) => ({ id: ID(id), nom: id, dossier: false, raccourci: false, ...o });
  it('dossier copié d’un propriétaire à UN bien : tout son contenu va dans « 0 En attente » de ce bien', () => {
    const d = deplacementsDuProprietaire({ sorte: 'copie', sourceId: ID('n3'), n3Cle: 'p:1:A', enfants: [f('bail.pdf'), f('Locataires', { dossier: true })], biens: [{ teteId: 7, dossiers: [] }] });
    expect(d.map((x) => [x.nom, x.de, x.versCle])).toEqual([['bail.pdf', ID('n3'), 'r:7:0'], ['Locataires', ID('n3'), 'r:7:0']]);
  });
  it('un dossier rangé dans « Inactifs » ne rejoint pas le bien actif unique sans y être rattaché', () => {
    const d = deplacementsDuProprietaire({ sorte: 'racine', sourceId: ID('racineI'), n3Cle: 'p:1:I', brancheSource: 'Inactifs',
      enfants: [f('Nom (vendu)', { dossier: true })], biens: [{ teteId: 7, dossiers: [], branche: 'Actifs' }] });
    expect(d.map((x) => [x.versCle, x.motif])).toEqual([['co:p:1:I', 'dossier rangé dans l’autre branche que le bien : rattachement non établi']]);
  });
  it('plusieurs biens sans rattachement : « Classement d’origine » sous le N3 ; aucun tri', () => {
    const d = deplacementsDuProprietaire({ sorte: 'copie', sourceId: ID('n3'), n3Cle: 'p:1:A', enfants: [f('a.pdf')], biens: [{ teteId: 7, dossiers: [] }, { teteId: 8, dossiers: [] }] });
    expect(d.map((x) => x.versCle)).toEqual(['co:p:1:A']);
  });
  it('racine : chaque dossier copié va entier chez le bien qui le cite ; un sous-dossier d’adresse d’abord ; le reste en « Classement d’origine »', () => {
    const d = deplacementsDuProprietaire({ sorte: 'racine', sourceId: ID('racine'), n3Cle: 'p:1:A',
      enfants: [f('Nom (ville 1)', { dossier: true }), f('Nom (ville 2)', { dossier: true })],
      petitsEnfants: new Map([[ID('Nom (ville 2)'), [f('5 rue A', { dossier: true }), f('9 rue B', { dossier: true }), f('x.pdf')]]]),
      biens: [{ teteId: 7, dossiers: [ID('Nom (ville 1)')] }, { teteId: 8, dossiers: [ID('5 rue A')] }, { teteId: 9, dossiers: [ID('9 rue B')] }] });
    expect(d.map((x) => [x.nom, x.versCle])).toEqual([['Nom (ville 1)', 'r:7:0'], ['5 rue A', 'r:8:0'], ['9 rue B', 'r:9:0'], ['Nom (ville 2)', 'co:p:1:A']]);
    expect(d.findIndex((x) => x.nom === '5 rue A')).toBeLessThan(d.findIndex((x) => x.nom === 'Nom (ville 2)'));
  });
  it('ancien squelette : ni les raccourcis ni un « En attente » vide ne bougent ; le contenu d’un « En attente » non vide, oui', () => {
    const d = deplacementsDuProprietaire({ sorte: 'ancien', sourceId: ID('ancien'), n3Cle: 'p:1:A',
      enfants: [f('→ bien', { raccourci: true }), f('En attente', { dossier: true }), f('note.pdf')],
      contenuEnAttente: new Map([[ID('En attente'), [f('scan.pdf')]]]), biens: [{ teteId: 7, dossiers: [] }] });
    expect(d.map((x) => [x.nom, x.de, x.versCle])).toEqual([['scan.pdf', ID('En attente'), 'r:7:0'], ['note.pdf', ID('ancien'), 'r:7:0']]);
  });
});
