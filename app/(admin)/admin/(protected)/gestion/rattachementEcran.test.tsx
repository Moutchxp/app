import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleChoix, ciblesDeLaLigne } from './ChoisirCible';
import { motSorte } from './EncartRattachement';
import type { LigneResultat } from '../../../../lib/gestion/annuaireRepo';
import { lireCible, lireIssue, lireMessages, MESSAGES_MAX } from '../../../api/admin/gestion/rattachements/route';

/**
 * LOT RATTACHEMENT-1 — LES PARTIES PURES DE L'ÉCRAN ET DE SA ROUTE.
 *
 * 🔴 CE QUE CE FICHIER PROUVE AUSSI, SANS RIEN RENDRE : que les trois composants client de ce lot S'IMPORTENT. Le
 * dépôt n'a pas d'outillage de rendu React (environnement `node`, pas de testing-library) et ce lot n'en introduit
 * pas — mais un import qui casse se voit ici, et la preuve `curl` sur une page reste le contrôle de dernier recours,
 * parce que seule elle exerce le vrai bundler.
 *
 * 🔒 Aucune donnée réelle : clés et adresses inventées.
 */

const ligne = (p: Partial<LigneResultat>): LigneResultat => ({
  lotId: null, lotNumero: null, adresse: null, commune: null, nature: null, typeBien: null,
  proprietaireId: null, proprietaireCle: null, proprietaireNom: '', locataireId: null, locataireNom: null,
  locataireDepuis: null, absent: false, ...p,
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT FICHE-RATTACHEMENT — TROIS TESTS DE CE BLOC ONT ÉTÉ RÉÉCRITS, ET IL FAUT DIRE POURQUOI.
 *
 * Ils figeaient l'ancienne règle : « un logement avec son propriétaire propose DEUX cibles », « un bailleur sans
 * lot en propose une (lui-même) », « la route accepte une cible de propriétaire ». C'était vrai, et ce ne l'est
 * plus : depuis le 28/09/2026, la cible d'un classement est TOUJOURS un bien, et le 28/09 au soir cette règle est
 * devenue un verrou — plus aucune voie ne peut écrire un lien « personne ».
 *
 * ⚠️ ON NE LES A PAS SUPPRIMÉS. Un test qui disparaît ne prouve plus rien, et c'est précisément sur ces points
 * qu'on veut une garantie : ils disent désormais la propriété INVERSE, qui est celle qu'on tient.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('les cibles qu’une ligne de recherche propose', () => {
  it('🔴 un logement avec son propriétaire n’en propose QU’UNE : le logement', () => {
    const c = ciblesDeLaLigne(ligne({
      lotNumero: '100', adresse: '4 rue Fictive', commune: 'PUTEAUX',
      proprietaireCle: '12', proprietaireNom: 'DUPONT Jean (12)',
    }));
    expect(c).toHaveLength(1);
    expect(c[0].cible).toEqual({ sorte: 'lot', cle: '100', id: null });
    expect(c[0].libelle).toBe('4 rue Fictive, PUTEAUX — lot 100');
    // Le nom du bailleur reste dans la recherche (on cherche souvent par lui) ; il n'est plus une destination.
    expect(c.some((x) => x.cible.sorte !== 'lot')).toBe(false);
  });

  /**
   * 🔴 UN BAILLEUR DONT ON NE GÈRE AUCUN BIEN NE PROPOSE PLUS RIEN, et sa ligne ne s'affiche pas. Cocher son nom
   * ne rangerait le mail nulle part : c'est exactement le défaut que la règle « bien » corrige.
   */
  it('🔴 un bailleur SANS lot n’en propose AUCUNE', () => {
    expect(ciblesDeLaLigne(ligne({ proprietaireCle: '12', proprietaireNom: 'DUPONT Jean (12)' }))).toHaveLength(0);
  });

  it('un locataire hors gestion n’en propose AUCUNE — on ne montre pas une ligne inerte', () => {
    expect(ciblesDeLaLigne(ligne({ locataireId: 7, locataireNom: 'BERNARD Alice' }))).toHaveLength(0);
  });

  it('une adresse absente est DITE, pas laissée vide', () => {
    const c = ciblesDeLaLigne(ligne({ lotNumero: '100' }));
    expect(c[0].libelle).toBe('Adresse non renseignée — lot 100');
  });

  it('🔴 un LOT et un PROPRIÉTAIRE de même clé ont des clés de choix DIFFÉRENTES', () => {
    expect(cleChoix({ sorte: 'lot', cle: '7', id: null }))
      .not.toBe(cleChoix({ sorte: 'proprietaire', cle: '7', id: null }));
    // Et un événement ne heurte ni l'un ni l'autre.
    expect(cleChoix({ sorte: 'evenement', cle: null, id: 7 }))
      .not.toBe(cleChoix({ sorte: 'lot', cle: '7', id: null }));
  });

  it('chaque sorte a son mot, jamais une couleur seule', () => {
    expect(motSorte('lot')).toBe('Logement');
    expect(motSorte('proprietaire')).toBe('Propriétaire');
    expect(motSorte('evenement')).toBe('Événement');
  });
});

describe('ce que la route accepte de lire', () => {
  it('une liste de mails, bornée', () => {
    expect(lireMessages('3,1,2')).toEqual([3, 1, 2]);
    expect(lireMessages(null)).toEqual([]);
    expect(lireMessages('')).toEqual([]);
    // Les valeurs absurdes sont ÉCARTÉES, pas transformées en zéro.
    expect(lireMessages('1,abc,0,-2,3')).toEqual([1, 3]);
    expect(lireMessages(Array.from({ length: 500 }, (_, i) => i + 1).join(','))).toHaveLength(MESSAGES_MAX);
  });

  it('une cible de LOT, par sa CLÉ', () => {
    expect(lireCible({ sorte: 'lot', cle: '100' })).toEqual({ sorte: 'lot', cle: '100', id: null });
    expect(lireCible({ sorte: 'lot', cle: ' 12 ' })).toEqual({ sorte: 'lot', cle: '12', id: null });
  });

  /**
   * 🔴🔴 LA PORTE EST FERMÉE À LA LECTURE MÊME DE LA REQUÊTE. Ce n'est pas un refus poli plus loin dans la route :
   * la cible n'est même pas construite, donc rien en aval ne peut la recevoir par erreur. Un vieil onglet, une
   * requête forgée ou un script rejoué arriveront encore avec `proprietaire` — ils repartiront avec un refus.
   */
  it('🔴🔴 une cible de PROPRIÉTAIRE ou de LOCATAIRE est refusée à la lecture', () => {
    expect(lireCible({ sorte: 'proprietaire', cle: '12' })).toBeNull();
    expect(lireCible({ sorte: 'locataire', cle: '12' })).toBeNull();
  });

  it('une cible d’événement, par son IDENTIFIANT', () => {
    expect(lireCible({ sorte: 'evenement', id: 42 })).toEqual({ sorte: 'evenement', cle: null, id: 42 });
  });

  it('🔴 elle REFUSE plutôt que de deviner : une cible mal formée n’atteint jamais la base', () => {
    for (const non of [
      null, undefined, 'lot', 42,
      { sorte: 'lot' },                       // pas de clé
      { sorte: 'lot', cle: '' },              // clé vide
      { sorte: 'lot', cle: '   ' },           // clé blanche
      { sorte: 'lot', cle: 'x'.repeat(61) },  // clé absurde
      { sorte: 'evenement' },                 // pas d'identifiant
      { sorte: 'evenement', id: 0 },          // identifiant refusé
      { sorte: 'evenement', cle: '12' },      // désigné par une clé
      { sorte: 'inventee', cle: '1' },        // sorte inconnue
    ]) {
      expect(lireCible(non), JSON.stringify(non)).toBeNull();
    }
  });

  it('l’issue demandée par la file retombe sur « toutes » plutôt que d’échouer', () => {
    expect(lireIssue('a_trier')).toBe('a_trier');
    expect(lireIssue('sans_candidat')).toBe('sans_candidat');
    expect(lireIssue('automatique')).toBe('automatique');
    for (const non of [null, '', 'A_TRIER', 'inventee']) expect(lireIssue(non), String(non)).toBe('toutes');
  });
});

/** 🔴 CE QUE LES ÉCRANS DE CE LOT NE DOIVENT JAMAIS FAIRE. */
describe('les garanties des trois composants', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  const dossier = 'app/(admin)/admin/(protected)/gestion';
  const encart = sansCommentaires(readFileSync(`${dossier}/EncartRattachement.tsx`, 'utf8'));
  const file = sansCommentaires(readFileSync(`${dossier}/FileATrier.tsx`, 'utf8'));
  const choisir = sansCommentaires(readFileSync(`${dossier}/ChoisirCible.tsx`, 'utf8'));

  it('🔴 aucun n’émet de DELETE : retirer est un changement d’état, pas une suppression', () => {
    for (const [nom, src] of [['encart', encart], ['file', file], ['choisir', choisir]] as const) {
      expect(src, nom).not.toMatch(/method:\s*'DELETE'/);
    }
  });

  it('🔴 aucun n’importe un dépôt autrement que par « import type » — le garde du bundler en dépend', () => {
    for (const [nom, src] of [['encart', encart], ['file', file], ['choisir', choisir]] as const) {
      const imports = [...src.matchAll(/^import\s+(?!type\b)[^;]*from\s*'([^']*)'/gm)].map((m) => m[1]);
      const depots = imports.filter((i) => /Repo|db\/client/.test(i));
      expect(depots, nom).toHaveLength(0);
    }
  });

  it('les trois sont des composants CLIENT déclarés', () => {
    for (const [nom, src] of [['encart', encart], ['file', file], ['choisir', choisir]] as const) {
      expect(src.trimStart().startsWith("'use client'"), nom).toBe(true);
    }
  });

  it('la file DIT ce qui n’a pas encore été examiné, et la commande qui le répare', () => {
    expect(file).toContain('nonExamines');
    expect(file).toContain('gestion:rattachement:proposer');
  });

  it('🔴 le tri par lot n’applique jamais une cible COMMUNE devinée à plusieurs mails', () => {
    // Le geste groupé ne passe que des `lienId` (les propositions propres à chaque mail), jamais une `cible`.
    const bloc = file.slice(file.indexOf('const changerLiens'), file.indexOf('const cochees'));
    expect(bloc).toContain('lienId');
    expect(bloc).not.toContain('cible:');
  });
});
