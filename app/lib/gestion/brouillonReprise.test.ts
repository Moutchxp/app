import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cleFenetreBrouillon, ordonnerBrouillons, reprendreBrouillon, type BrouillonEnregistre,
} from './brouillonReprise';

/**
 * LOT APERCU-PAGE1 + BROUILLONS — « AUJOURD'HUI LES BROUILLONS NE S'OUVRENT PAS » (Arno).
 *
 * 🔴 LA CAUSE, ÉTABLIE AVANT D'ÉCRIRE UNE LIGNE DE CORRECTIF : rien dans l'application ne relisait un brouillon
 * enregistré. La liste ne proposait que de rouvrir la CONVERSATION — donc rien du tout pour un message neuf, qui
 * n'en a pas. La route savait pourtant le rendre depuis le lot 5e : personne ne l'appelait.
 *
 * Ce fichier éprouve la TRADUCTION (base → éditeur) et l'ORDRE de la liste. Aucun écran, aucune base.
 */

const EN_BASE: BrouillonEnregistre = {
  id: 45, filId: null, repondAMessageId: null, voie: 'nouveau',
  a: ['locataire@exemple.test'], cc: ['compta@exemple.test'], cci: [],
  objet: 'Quittance de septembre',
  corps: 'Bonjour,\n\nVoici la quittance.\n\nService Gestion',
  corpsHtml: '<p>Bonjour,</p><p><strong>Voici la quittance.</strong></p>',
  citation: null,
  majLe: '2026-09-28T21:55:00Z',
};

describe('rouvrir un brouillon : la traduction base → éditeur', () => {
  it('🔴 destinataires, copies, objet et corps reviennent TOUS', () => {
    const b = reprendreBrouillon(EN_BASE);
    expect(b.a).toEqual(['locataire@exemple.test']);
    expect(b.cc).toEqual(['compta@exemple.test']);
    expect(b.cci).toEqual([]);
    expect(b.objet).toBe('Quittance de septembre');
    expect(b.corps).toContain('Voici la quittance.');
    expect(b.id).toBe(45);
  });

  /** 🔴 LA MISE EN FORME EST CE QU'ON MONTRE quand on l'a. Sans elle, un brouillon rouvert revient en texte brut. */
  it('🔴 la mise en forme enregistrée est rendue telle quelle', () => {
    expect(reprendreBrouillon(EN_BASE).corpsHtml).toBe('<p>Bonjour,</p><p><strong>Voici la quittance.</strong></p>');
  });

  it('un brouillon d’avant la colonne `corps_html` revient sans HTML — l’éditeur convertira son texte', () => {
    expect(reprendreBrouillon({ ...EN_BASE, corpsHtml: null }).corpsHtml).toBeNull();
    // Une colonne présente mais VIDE vaut absente : on ne montre pas un corps blanc à la place du texte.
    expect(reprendreBrouillon({ ...EN_BASE, corpsHtml: '   ' }).corpsHtml).toBeNull();
  });

  /**
   * 🔴 LE NOM DU CHAMP CHANGE ENTRE LA BASE ET L'ÉCRAN (`repondAMessageId` / `repondALeMessageId`). C'est
   * exactement le genre d'écart qui ne « plante » pas : la réponse partirait hors de son fil, sans In-Reply-To.
   */
  it('🔴 le message auquel on répond survit au changement de nom', () => {
    const b = reprendreBrouillon({ ...EN_BASE, voie: 'repondre', filId: 36505, repondAMessageId: 991 });
    expect(b.repondALeMessageId).toBe(991);
    expect(b.filId).toBe(36505);
    expect(b.voie).toBe('repondre');
  });

  /**
   * 🔴 LA CITATION REPART DANS LES DEUX VERSIONS. La base ne garde que sa version texte ; sans reconversion, le
   * message partirait avec le message d'origine pour qui lit en texte et SANS lui pour qui lit en HTML.
   */
  it('🔴 la citation revient aussi en HTML', () => {
    const b = reprendreBrouillon({ ...EN_BASE, citation: 'Le 12/09, Paul a écrit :\n> bonjour' });
    expect(b.citation).toContain('Paul a écrit');
    expect(b.citationHtml ?? '').toContain('Paul a');
    // Et rien à citer reste rien : une citation vide ne doit pas fabriquer un bloc HTML vide.
    expect(reprendreBrouillon({ ...EN_BASE, citation: '' }).citationHtml).toBeNull();
  });

  /**
   * 🔴 `repris: true` N'EST PAS DÉCORATIF : c'est lui qui empêche l'éditeur d'abandonner, à la fermeture, un
   * brouillon qu'on a seulement OUVERT POUR LE RELIRE.
   */
  it('🔴🔴 un brouillon rouvert est marqué « repris »', () => {
    expect(reprendreBrouillon(EN_BASE).repris).toBe(true);
  });

  /**
   * ⚠️ LA MENTION « DESTINATAIRES APPROXIMATIFS » AVERTIT QU'ON A DEVINÉ. Ceux d'un brouillon ont été enregistrés
   * tels quels : les dire approximatifs serait un avertissement mensonger, et un avertissement mensonger fait
   * ignorer les vrais.
   */
  it('les destinataires d’un brouillon ne sont jamais dits approximatifs', () => {
    expect(reprendreBrouillon(EN_BASE).destinatairesApproximatifs).toBe(false);
  });

  /** La fenêtre tient à l'IDENTIFIANT : recliquer RÉTABLIT, n'ouvre pas une seconde fenêtre sur le même travail. */
  it('🔴 deux clics sur le même brouillon visent la même fenêtre', () => {
    expect(cleFenetreBrouillon(45)).toBe(cleFenetreBrouillon(45));
    expect(cleFenetreBrouillon(45)).not.toBe(cleFenetreBrouillon(46));
  });
});

describe('🔴 la liste va du plus récemment modifié au plus ancien', () => {
  const l = (id: number, majLe: string) => ({ id, majLe });

  it('🔴 le plus récent d’abord', () => {
    const range = ordonnerBrouillons([
      l(12, '2026-09-25T22:13:00Z'), l(48, '2026-09-29T00:06:00Z'), l(45, '2026-09-28T21:55:00Z'),
    ]);
    expect(range.map((x) => x.id)).toEqual([48, 45, 12]);
  });

  /** ⚠️ À DATE ÉGALE, L'IDENTIFIANT DÉPARTAGE : un tri instable ferait « sauter » des lignes sous le doigt. */
  it('⚠️ à date égale, l’ordre est stable et prévisible', () => {
    const range = ordonnerBrouillons([l(7, '2026-09-28T21:55:00Z'), l(9, '2026-09-28T21:55:00Z')]);
    expect(range.map((x) => x.id)).toEqual([9, 7]);
  });

  it('⚠️ la liste reçue n’est pas modifiée sur place', () => {
    const source = [l(1, '2026-09-01T00:00:00Z'), l(2, '2026-09-02T00:00:00Z')];
    ordonnerBrouillons(source);
    expect(source.map((x) => x.id)).toEqual([1, 2]);
  });

  /** La base rend déjà cet ordre. On le dit ici aussi, pour que les deux ne divergent pas en silence. */
  it('🔴 la base trie par date de dernière modification décroissante', () => {
    const sql = readFileSync('app/lib/gestion/redactionRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(sql).toContain('WHERE abandonne_le IS NULL AND envoye_le IS NULL ORDER BY maj_le DESC, id DESC');
  });
});

/**
 * ══ 🔴🔴 CE QUE LA LISTE FAIT D'UN CLIC ════════════════════════════════════════════════════════════════════════
 * Le défaut se voyait là, et nulle part ailleurs : l'objet n'était cliquable QUE pour un brouillon rattaché à une
 * conversation, et son clic rouvrait la conversation — jamais le brouillon.
 */
describe('🔴🔴 un clic sur un brouillon l’OUVRE dans l’éditeur', () => {
  const liste = readFileSync('app/(admin)/admin/(protected)/gestion/Brouillons.tsx', 'utf8');
  const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
  const sansCommentaires = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

  it('🔴 TOUS les brouillons sont cliquables, y compris hors conversation', () => {
    const code = sansCommentaires(liste);
    expect(code).toContain('onClick={() => onReprendre(b)}');
    // L'ancienne condition — cliquable seulement avec un fil — n'existe plus.
    expect(code).not.toContain('b.filId !== null\n                ? <button');
  });

  it('⚠️ le retour vers la conversation n’est pas perdu pour autant', () => {
    expect(sansCommentaires(liste)).toContain('Voir la conversation');
  });

  it('🔴 l’écran ouvre la fenêtre de rédaction ORDINAIRE sur ce brouillon', () => {
    expect(sansCommentaires(ecran))
      .toContain('onReprendre={(b) => ouvrirRedaction(cleFenetreBrouillon(b.id), reprendreBrouillon(b))}');
  });
});
