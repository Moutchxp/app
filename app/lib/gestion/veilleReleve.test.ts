import { describe, it, expect } from 'vitest';
import {
  anciennete, cadence, etatVeille, toleranceVeilleValide,
  VEILLE_INTERVALLES_DEFAUT, VEILLE_INTERVALLES_MAX, VEILLE_INTERVALLES_MIN,
  type VeilleReleve,
} from './ecran';
import { declencheurDe } from './releveReelle';

/**
 * LOT 5-VEILLE — RENDRE VISIBLE UN ARRÊT DE LA RELÈVE AUTOMATIQUE.
 *
 * 🔴 L'INCIDENT QUE CES TESTS EMPÊCHENT DE REVIVRE — 25/09/2026. Le rapatriement s'est terminé à 06:32, rien n'a pris
 * le relais, et pendant DIX HEURES aucun courrier n'est entré dans l'application. Le bandeau affichait pourtant, en
 * gris : « Dernière relève : 25 septembre 2026, 06:32 (il y a 9 h) ». Exact, et parfaitement inutile.
 *
 * QUATRE CHOSES SONT ÉPROUVÉES ICI, ET CHACUNE CORRESPOND À UNE FAÇON DE RATER L'ALERTE :
 *   ① ne pas crier quand tout va bien — une alerte qui se trompe est une alerte qu'on apprend à ignorer ;
 *   ② crier quand l'ordonnanceur s'est tu, en MOTS et avec le geste à faire ;
 *   ③ crier AUSSI quand il tourne mais échoue — ne regarder que les réussites masque exactement ce cas-là ;
 *   ④ ne RIEN dire d'une boîte calme : le repère est la dernière PASSE, jamais le dernier message capturé. Un
 *      dimanche sans courrier n'est pas une panne, et confondre les deux détruirait la confiance dans l'alerte.
 */

const T0 = new Date('2026-09-25T16:00:00Z');
const il_y_a = (secondes: number): string => new Date(T0.getTime() - secondes * 1000).toISOString();

const veille = (o: Partial<VeilleReleve> = {}): VeilleReleve => ({
  derniereLe: il_y_a(40), resultat: 'ok', erreur: null, intervalleS: 60, toleranceIntervalles: 10, ...o,
});

describe('🔴 ① tout va bien : on le dit, avec la CADENCE comme étalon', () => {
  it('annonce la dernière passe ET la cadence attendue — sans elle, « il y a 9 h » n’a aucun repère', () => {
    const e = etatVeille(veille(), T0);
    expect(e.niveau).toBe('ok');
    expect(e.texte).toBe('Relève automatique : dernière passe il y a 40 s (une par minute)');
    expect(e.aide).toBeNull(); // rien à faire : ne pas encombrer
  });

  it('sous la minute, on compte en SECONDES : « à l’instant » n’apprendrait rien', () => {
    expect(anciennete(il_y_a(40), T0)).toBe('il y a 40 s');
    expect(anciennete(il_y_a(300), T0)).toBe('il y a 5 min');
    expect(anciennete(il_y_a(32_400), T0)).toBe('il y a 9 h');
    expect(anciennete(null, T0)).toBe('—');
  });

  it('la cadence se dit comme on la dirait à voix haute', () => {
    expect(cadence(60)).toBe('une par minute');
    expect(cadence(30)).toBe('une toutes les 30 s');
    expect(cadence(300)).toBe('une toutes les 5 min');
  });

  /** Un retard d'un tour ou deux n'est pas une panne : le serveur a pu être lent. */
  it('un léger retard ne déclenche RIEN — sinon l’alerte crierait tous les jours', () => {
    expect(etatVeille(veille({ derniereLe: il_y_a(200) }), T0).niveau).toBe('ok');
    expect(etatVeille(veille({ derniereLe: il_y_a(599) }), T0).niveau).toBe('ok');
  });
});

describe('🔴 ② l’ordonnanceur s’est tu : on le DIT, et on dit quoi faire', () => {
  it('au-delà du seuil, l’alerte est en toutes lettres — jamais une simple couleur', () => {
    const e = etatVeille(veille({ derniereLe: il_y_a(32_400) }), T0); // 9 h, le cas réel du 25/09
    expect(e.niveau).toBe('arretee');
    expect(e.texte).toContain('La relève automatique est arrêtée depuis il y a 9 h');
    expect(e.texte).toContain('le courrier arrivé depuis n’est pas dans l’application');
  });

  it('…et elle porte le GESTE : le bouton existant, puis où lire pour la relancer', () => {
    const e = etatVeille(veille({ derniereLe: il_y_a(32_400) }), T0);
    expect(e.aide).toContain('Relever maintenant');
    expect(e.aide).toContain('ops/README.md');
  });

  /** 🔴 LE SEUIL NAÎT DU RÉGLAGE, jamais d'un nombre écrit dans le code : changer la cadence le déplace tout seul. */
  it('le seuil suit la CADENCE : à 30 s d’intervalle, il tombe deux fois plus tôt', () => {
    const tard = { derniereLe: il_y_a(400) };
    expect(etatVeille(veille({ ...tard, intervalleS: 60 }), T0).niveau).toBe('ok');      // 400 s < 10 × 60
    expect(etatVeille(veille({ ...tard, intervalleS: 30 }), T0).niveau).toBe('arretee'); // 400 s > 10 × 30
  });

  it('le seuil suit aussi la TOLÉRANCE réglée', () => {
    const tard = { derniereLe: il_y_a(400) };
    expect(etatVeille(veille({ ...tard, toleranceIntervalles: 10 }), T0).niveau).toBe('ok');
    expect(etatVeille(veille({ ...tard, toleranceIntervalles: 5 }), T0).niveau).toBe('arretee');
  });

  it('aucune passe automatique JAMAIS vue : on le dit autrement, sans inventer une durée', () => {
    const e = etatVeille(veille({ derniereLe: null, resultat: null }), T0);
    expect(e.niveau).toBe('jamais');
    expect(e.texte).toContain('n’a encore jamais tourné');
    expect(e.texte).not.toContain('arrêtée depuis');
    expect(e.aide).toContain('ops/README.md');
  });
});

describe('🔴 ③ elle tourne mais échoue : ne regarder que les réussites masquerait ce cas', () => {
  it('l’échec est annoncé avec son heure et son motif EN CLAIR', () => {
    const e = etatVeille(veille({ resultat: 'erreur', erreur: 'Socket timeout après 30 s' }), T0);
    expect(e.niveau).toBe('echec');
    expect(e.texte).toContain('La dernière relève automatique a échoué');
    expect(e.texte).toContain('Socket timeout après 30 s');
    expect(e.aide).toContain('Relever maintenant');
  });

  it('un échec RÉCENT alerte quand même : l’heure ne le dédouane pas', () => {
    expect(etatVeille(veille({ derniereLe: il_y_a(5), resultat: 'erreur', erreur: 'refus' }), T0).niveau).toBe('echec');
  });

  /** Une trace de pile entière dans un bandeau ne se lit pas — et un bandeau illisible ne sert à rien. */
  it('un motif à rallonge est ramené à sa première ligne, et tronqué', () => {
    const e = etatVeille(veille({ resultat: 'erreur', erreur: `${'x'.repeat(500)}\nau fichier machin.ts` }), T0);
    expect(e.texte).toContain('…');
    expect(e.texte).not.toContain('machin.ts');
    expect(e.texte.length).toBeLessThan(300);
  });

  it('un échec sans motif enregistré le DIT, plutôt que de laisser un blanc', () => {
    expect(etatVeille(veille({ resultat: 'erreur', erreur: null }), T0).texte).toContain('motif non enregistré');
  });
});

describe('🔴 ④ une boîte calme ne déclenche RIEN', () => {
  /**
   * Le repère est la dernière PASSE, jamais le dernier message capturé. Un dimanche sans courrier, la relève tourne
   * et ne trouve rien — c'est son état NORMAL. Confondre « personne n'écrit » et « on ne regarde plus » ferait crier
   * l'alerte un week-end sur deux, et plus personne ne la lirait le jour où elle aurait raison.
   */
  it('des passes régulières sans aucune capture restent l’état « tout va bien »', () => {
    const e = etatVeille(veille({ derniereLe: il_y_a(30) }), T0);
    expect(e.niveau).toBe('ok');
    expect(e.texte).not.toContain('⚠');
  });

  it('l’état ne dépend d’AUCUN compteur de messages : la structure ne les porte même pas', () => {
    expect(Object.keys(veille()).sort())
      .toEqual(['derniereLe', 'erreur', 'intervalleS', 'resultat', 'toleranceIntervalles']);
  });
});

describe('le réglage de tolérance, et son repli sûr', () => {
  it('absent, nul ou aberrant ⇒ le défaut de dix intervalles', () => {
    for (const v of [undefined, null, 0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(toleranceVeilleValide(v as number)).toBe(VEILLE_INTERVALLES_DEFAUT);
    }
  });

  it('les bornes mordent des DEUX côtés', () => {
    expect(toleranceVeilleValide(1)).toBe(VEILLE_INTERVALLES_MIN);
    expect(toleranceVeilleValide(9_999)).toBe(VEILLE_INTERVALLES_MAX);
    expect(toleranceVeilleValide(5)).toBe(5);
  });

  /** Migration 249 non appliquée : la tolérance vaut son défaut et le bandeau marche quand même. */
  it('sans le réglage en base, le bandeau fonctionne avec le défaut', () => {
    const e = etatVeille(veille({ derniereLe: il_y_a(32_400), toleranceIntervalles: VEILLE_INTERVALLES_DEFAUT }), T0);
    expect(e.niveau).toBe('arretee');
  });

  /** Un intervalle absent ou nul ne doit pas rendre le seuil infini — ce serait une alerte qui ne sonne jamais. */
  it('un intervalle aberrant retombe sur une minute, et l’alerte reste possible', () => {
    expect(etatVeille(veille({ derniereLe: il_y_a(32_400), intervalleS: 0 }), T0).niveau).toBe('arretee');
  });
});

describe('l’étiquette des passes — c’est elle qui rend la question posable', () => {
  /**
   * 🔴 SANS CE MOT, L'ÉCRAN NE PEUT RIEN DIRE. Avant ce lot, les passes de l'ordonnanceur s'enregistraient « manuel »,
   * exactement comme un clic : « la relève automatique tourne-t-elle encore ? » n'avait pas de réponse en base.
   */
  it('l’ordonnanceur pose « planifie », le clic « manuel », le rattrapage « rattrapage »', () => {
    expect(declencheurDe({ automatique: true })).toBe('planifie');
    expect(declencheurDe({})).toBe('manuel');
    expect(declencheurDe({ depuisOrigine: true })).toBe('rattrapage');
  });

  /** Ce qu'une passe a FAIT la qualifie, pas qui l'a lancée : un rattrapage reste un rattrapage. */
  it('un rattrapage lancé par l’ordonnanceur reste un « rattrapage »', () => {
    expect(declencheurDe({ depuisOrigine: true, automatique: true })).toBe('rattrapage');
  });
});
