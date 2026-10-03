import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motConversations, motMailsRecus } from './uniteListe';

/**
 * ══ 🔴🔴 LOT OPTION-C — CHAQUE TITRE DIT CE QU'IL COMPTE ═════════════════════════════════════════════════════════
 *
 * DÉCISION D'ARNO (03/10/2026) : « Les deux unités restent (écran partagé = mails reçus, décision STATUT-PAR-MAIL ;
 * plein écran = conversations) et chaque titre dit ce qu'il compte : “N mails reçus” et “N conversations”. »
 *
 * CE QUE CE FICHIER TIENT :
 *   ① les deux mots, au singulier comme au pluriel ;
 *   ② 🔴 LES DEUX ÉCRANS LES LISENT D'ICI — un libellé recopié dans un composant finirait par dire autre chose,
 *      et l'on comparerait de nouveau deux nombres sans savoir s'ils comptent la même chose.
 */

describe('🔴🔴 le mot de l’écran partagé : des MAILS', () => {
  it('le pluriel', () => { expect(motMailsRecus(16980)).toBe('16980 mails reçus'); });
  /** ⚠️ « 1 mails reçus » dans un en-tête de colonne fait douter du reste de l'écran. */
  it('⚠️ le singulier s’accorde, « reçu » compris', () => { expect(motMailsRecus(1)).toBe('1 mail reçu'); });
  /** Zéro est un pluriel en français : « 0 mail » serait aussi correct, mais la liste dit déjà « Aucun mail reçu ». */
  it('zéro reste au pluriel', () => { expect(motMailsRecus(0)).toBe('0 mails reçus'); });
});

describe('🔴🔴 le mot du plein écran : des CONVERSATIONS', () => {
  it('le pluriel', () => { expect(motConversations(10232)).toBe('10232 conversations'); });
  it('⚠️ le singulier', () => { expect(motConversations(1)).toBe('1 conversation'); });
  /**
   * 🔴 LE MOT EST CELUI D'ARNO, PAS CELUI DU CODE. Le domaine dit « échange » ; l'écran dit « conversation »,
   * comme Gmail. Changer l'un sans l'autre ferait croire à deux listes différentes.
   */
  it('🔴 jamais « échange » à l’écran', () => {
    expect(motConversations(3)).not.toContain('échange');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES DEUX ÉCRANS LISENT CE MODULE — ET AUCUN NE RÉÉCRIT SON LIBELLÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const BOITE_RECEPTION = 'app/(admin)/admin/(protected)/gestion/BoiteReception.tsx';
const BOITE_MAIL = 'app/(admin)/admin/(protected)/gestion/BoiteMail.tsx';

describe('🔴🔴 une seule écriture, deux emplois', () => {
  it('🔴 l’écran partagé appelle `motMailsRecus` dans son titre', () => {
    const src = readFileSync(BOITE_RECEPTION, 'utf8');
    expect(src).toContain("from '../../../../lib/gestion/uniteListe'");
    expect(src).toContain('motMailsRecus(etat.total)');
    // ⚠️ ET IL N'ÉCRIT PAS LE MOT LUI-MÊME : deux libellés finiraient par diverger.
    expect(src).not.toContain('mails reçus<');
  });

  it('🔴 le plein écran appelle `motConversations` dans son titre', () => {
    const src = readFileSync(BOITE_MAIL, 'utf8');
    expect(src).toContain("from '../../../../lib/gestion/uniteListe'");
    expect(src).toContain('motConversations(nombreDeLaListe)');
  });

  /**
   * 🔴 LE NOMBRE RESTE CELUI QUI ÉTAIT DÉJÀ AFFICHÉ. Ce lot change le MOT, pas la mesure : le titre du plein
   * écran lit toujours `nombreDeLaListe` (lot LISTE-PAGINATION), celui de la colonne toujours `etat.total`.
   */
  it('🔴 aucun second calcul n’est introduit', () => {
    expect(readFileSync(BOITE_MAIL, 'utf8')).toContain('const nombreDeLaListe = etat.total ?? total ?? null;');
  });
});
