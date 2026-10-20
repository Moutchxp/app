import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dansInactifs, refusActifsInactifs } from './regleActifsInactifs';
import { construirePlanArbo, type LotArbo, type ProprietaireArbo } from './arborescenceDrive';

/** 🔴🔴 Arno (20/10/2026) — LA RÈGLE ACTIFS / INACTIFS, permanente. */
describe('refusActifsInactifs — le verdict pour un dossier de l’arborescence', () => {
  it('un BAIL, ses pièces et sous-pièces ne se déplacent jamais, où que ce soit', () => {
    for (const sorte of ['bail', 'piece_bail', 'sous_piece_bail']) {
      for (const cibleDansInactifs of [true, false]) expect(refusActifsInactifs({ sorte, cibleDansInactifs })).toMatch(/6 Locataires/);
    }
  });
  it('seuls un BIEN ou un PROPRIÉTAIRE passent dans « Inactifs »', () => {
    expect(refusActifsInactifs({ sorte: 'bien', cibleDansInactifs: true })).toBeNull();
    expect(refusActifsInactifs({ sorte: 'proprietaire', cibleDansInactifs: true })).toBeNull();
    for (const sorte of ['adresse', 'rubrique', 'sous_rubrique', 'annee', 'classement_origine', 'raccourci']) {
      expect(refusActifsInactifs({ sorte, cibleDansInactifs: true })).toMatch(/Seuls un bien ou un propriétaire/);
      expect(refusActifsInactifs({ sorte, cibleDansInactifs: false })).toBeNull();
    }
  });
  it('hors registre (fichier, dossier que l’application n’a pas posé) : la règle ne s’applique pas', () => {
    expect(refusActifsInactifs({ sorte: null, cibleDansInactifs: true })).toBeNull();
  });
  it('« Inactifs » = le N2 sous « Base de données locative » (à toute profondeur), pas un dossier qui porte ce nom ailleurs', () => {
    const m = (id: string, nom: string, parentId: string | null) => ({ id, nom, parentId });
    expect(dansInactifs([m('a', '1 rue X', 'p'), m('p', 'DUPONT', 'i'), m('i', 'Inactifs', 'b'), m('b', 'Base de données locative', null)])).toBe(true);
    expect(dansInactifs([m('a', '1 rue X', 'p'), m('p', 'DUPONT', 'i'), m('i', 'Actifs', 'b'), m('b', 'Base de données locative', null)])).toBe(false);
    expect(dansInactifs([m('i', 'Inactifs', 'x'), m('x', 'Archives perso', null)])).toBe(false);
  });
});

const LOT = (id: number, inactif = false): LotArbo => ({ id, wippimmo: String(id), proprietaireId: 5, adresse: '1 rue X', codePostal: '75001', commune: 'PARIS',
  nature: 'Appartement', typeBien: 'T2', categorie: 'logement', porte: null, inactif, annexeDetachee: false });
const PROP = (actif: boolean): ProprietaireArbo => ({ id: 5, wippimmo: 'P5', nom: 'DUPONT Jean', actif, n3Existants: {} });
const plan = (o: { actif?: boolean; lotInactif?: boolean }) => construirePlanArbo({
  annee: 2026, proprietaires: [PROP(o.actif ?? true)], lots: [LOT(70, o.lotInactif ?? false), LOT(71)], annexes: [], regroupements: [],
  occupations: [
    { id: 1, lotId: 70, entree: '2019-09-01', sortie: '2024-06-30', locataire: 'ANCIEN Paul' },   // sorti : son bail reste
    { id: 2, lotId: 70, entree: '2024-09-01', sortie: null, locataire: 'MARTIN Léa' },
  ],
  adresses: new Map(), exclus: new Set(),
});

describe('l’arborescence (construirePlanArbo) : la branche suit le BIEN ou le PROPRIÉTAIRE, jamais le locataire', () => {
  it('un locataire SORTI : son bail reste dans « 6 Locataires » de son bien, dans la branche du bien (Actifs) — les baux se cumulent', () => {
    const p = plan({});
    const baux = p.noeuds.filter((n) => n.sorte === 'bail' && n.lotId === 70);
    expect(baux.map((b) => [b.parent, b.branche])).toEqual([['r:70:6', 'Actifs'], ['r:70:6', 'Actifs']]);
  });
  it('un BIEN inactif passe ENTIER dans « Inactifs » : son N5 et tout ce qu’il contient, baux compris ; l’autre bien reste actif', () => {
    const p = plan({ lotInactif: true });
    const du70 = p.noeuds.filter((n) => n.lotId === 70);
    expect(du70.length).toBeGreaterThan(20);
    expect(new Set(du70.map((n) => n.branche))).toEqual(new Set(['Inactifs']));
    expect(new Set(p.noeuds.filter((n) => n.lotId === 71).map((n) => n.branche))).toEqual(new Set(['Actifs']));
  });
  it('un PROPRIÉTAIRE inactif passe ENTIER dans « Inactifs » : N3, adresses, tous ses biens et tout leur contenu', () => {
    const p = plan({ actif: false });
    expect(new Set(p.noeuds.map((n) => n.branche))).toEqual(new Set(['Inactifs']));
  });
});

describe('🔴 aucune sortie de locataire, fin de bail, préavis, archivage ni sortie du portefeuille ne touche au Drive', () => {
  const sans = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  const fichiers = [
    ...readdirSync('app/lib/location').filter((f) => /^(sortie|archiv|preavis|origine|portefeuille|bail(?!Drive)|etatDesLieux)/i.test(f) && f.endsWith('.ts') && !/test/.test(f))
      .map((f) => path.join('app/lib/location', f)),
  ];
  it('les modules concernés existent (garde contre une liste vide)', () => {
    expect(fichiers).toEqual(expect.arrayContaining(['app/lib/location/sortieLocatairesRepo.ts', 'app/lib/location/archivage.ts', 'app/lib/location/portefeuilleRepo.ts']));
  });
  it.each(fichiers)('%s : ni déplacement Drive, ni appel aux modules qui déplacent', (f) => {
    const src = sans(readFileSync(f, 'utf8'));
    expect(src).not.toMatch(/addParents|removeParents|deplacerVers|deplacerDansDossier|deplacerFichier|driveMouvement|classementDrive/);
  });
});
