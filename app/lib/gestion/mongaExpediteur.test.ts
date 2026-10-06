import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { proposerBiens, type BienConnu } from './propositionsBien';

/**
 * ══ 🔴🔴 LOT ATTENTION-ET-MODIFIER — UN MAIL MONGA SE RECONNAÎT À SON EXPÉDITEUR ═════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (06/10/2026) :
 *   ① « Seuls les mails dont l'EXPÉDITEUR est Monga (domaine monga.io) créent des étapes ou des repères dans la
 *      frise. Resserre le prédicat de gestion_monga_mail sur l'expéditeur. »
 *   ② « Un mail d'un autre expéditeur dont l'objet cite une référence Monga (Fwd:, Re:, échanges internes) ne
 *      crée JAMAIS d'étape. Si cette référence est reliée à un événement, son rattachement à cet événement est
 *      PROPOSÉ (aucune case cochée d'office, même porte que les autres propositions). »
 *
 * ═══ 🔴 CE QUI A ÉTÉ MESURÉ AVANT D'APPLIQUER (06/10/2026) ══════════════════════════════════════════════════════
 *
 * `gestion_monga_mail` portait **157 lignes, dont 37 d'un autre expéditeur**. Sur ces 37 : **6** portaient du
 * gabarit Monga (des transferts), **1 seule** un vrai signal d'étape (MNG-24062), et — le chiffre qui compte —
 * **0 étape de la frise ne venait d'un mail non-Monga**. Le resserrement n'a donc retiré aucune étape : 127
 * vives avant, 127 après.
 *
 * Le cas d'école : le fil 3109. Un transfert d'Anaïs à Amélie à propos d'un acompte, et ses deux réponses,
 * rangés comme du courrier Monga parce que l'objet transféré disait « Le ticket MONGA 20922 requiert votre
 * attention ». Un `Fwd:` HÉRITE DE L'OBJET — c'est tout le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const REPO = readFileSync('app/lib/gestion/mongaRepo.ts', 'utf8');
const REPRISE = readFileSync('app/scripts/monga-etapes-reprise.ts', 'utf8');
const RATT = readFileSync('app/lib/gestion/rattachementRepo.ts', 'utf8');

describe('① le prédicat ne regarde plus que l’expéditeur', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE. Le prédicat valait
   * `de_adresse ILIKE '%monga.io' OR objet ~* 'MNG-…' OR objet ILIKE '%MONGA%'`. Les deux clauses d'OBJET sont
   * exactement ce qui faisait entrer nos propres transferts.
   */
  it('🔴🔴 plus aucune clause sur l’OBJET dans SQL_EST_MAIL_MONGA', () => {
    const i = REPO.indexOf('export const SQL_EST_MAIL_MONGA');
    const bloc = REPO.slice(i, REPO.indexOf(';', i) + 1);
    expect(bloc).toContain('m.de_adresse');
    expect(bloc).not.toContain('m.objet');
    expect(bloc).not.toContain('MNG-');
  });

  /** ⚠️ ET LE DOMAINE EST ANCRÉ : `%monga.io` acceptait aussi « fauxmonga.io » ou « monga.io.attaquant.fr ». */
  it('⚠️ le domaine est ancré en fin d’adresse, sous-domaines compris', () => {
    const i = REPO.indexOf('export const SQL_EST_MAIL_MONGA');
    const bloc = REPO.slice(i, REPO.indexOf(';', i) + 1);
    expect(bloc).toContain('monga[.]io$');
  });

  /**
   * 🔴 LE MÉNAGE NE TOUCHE QUE LA LECTURE, JAMAIS LE COURRIER. Arno : « statut ou suppression de la ligne de
   * gestion_monga_mail uniquement, jamais du mail lui-même ». Vérifié en base après application : les trois
   * mails internes du fil 3109 sont toujours là.
   */
  it('🔴🔴 le ménage ne supprime QUE des lignes de gestion_monga_mail', () => {
    expect(REPRISE).toContain('DELETE FROM gestion_monga_mail mm');
    expect(REPRISE).not.toMatch(/DELETE FROM gestion_message/i);
    expect(REPRISE).not.toMatch(/UPDATE gestion_message\b/i);
  });

  /**
   * 🔴 ET IL SE VÉRIFIE LUI-MÊME : aucune étape de la frise ne doit venir d'un mail non-Monga. Le script le
   * recompte à chaque passage, parce que c'est ce qui garantit qu'il ne retire pas d'historique.
   */
  it('🔴 le script recompte les étapes issues d’un non-Monga, et annonce la perte', () => {
    expect(REPRISE).toContain('étapes de frise issues d’un non-Monga');
    expect(REPRISE).toContain('la perte réelle');
  });

  /** ⚠️ LA SIMULATION RESTE LE DÉFAUT : le ménage n'écrit que sur `--appliquer`. */
  it('⚠️ rien n’est retiré sans `--appliquer`', () => {
    const i = REPRISE.indexOf('DELETE FROM gestion_monga_mail mm');
    expect(REPRISE.slice(Math.max(0, i - 300), i)).toContain('if (APPLIQUER');
  });
});

describe('② le cas (g) : une référence Monga reliée, citée par un autre expéditeur', () => {
  /* ⚠️ LA FORME EXACTE DE `BienConnu`, sans `as` : un cast aurait caché le jour où le type change. */
  const bien = (cle: string): BienConnu => ({
    cle, numero: cle, adresse: `${cle} rue d’Essai`, commune: 'Courbevoie',
    proprietaireCle: null, proprietaireNom: null,
  });

  /**
   * 🔴🔴 PROPOSÉ, JAMAIS COCHÉ (Arno : « aucune case cochée d'office »). Un transfert cite la référence d'une
   * intervention ; cela rend le lien PLAUSIBLE, jamais certain — le mail peut parler d'un tout autre sujet et
   * n'avoir gardé que l'objet d'origine. C'est précisément le cas du fil 3109, où les trois mails parlent d'un
   * acompte en banque.
   */
  it('🔴🔴 le bien de l’événement est proposé, décoché, avec son motif', () => {
    const r = proposerBiens({
      adresses: [], biens: [bien('315')],
      mongaRelie: { reference: 'MNG-20922', biens: ['315'] },
    });
    expect(r.issue).toBe('a_trancher');
    expect(r.propositions).toHaveLength(1);
    const p = r.propositions[0];
    expect(p.cas).toBe('g');
    expect(p.preCoche).toBe(false);
    expect(p.certitude).toBe('a_trancher');
    expect(p.motif).toContain('MNG-20922');
  });

  /**
   * 🔴🔴 IL NE PEUT JAMAIS RENDRE UN CLASSEMENT AUTOMATIQUE. Sans cette garde, un `Re: Re: Fwd:` dont l'objet
   * seul parlait de Monga aurait pu ranger tout seul — exactement le défaut que le resserrement corrige.
   */
  it('🔴🔴 jamais « automatique », même seul', () => {
    const r = proposerBiens({
      adresses: [], biens: [bien('315')],
      mongaRelie: { reference: 'MNG-20922', biens: ['315'] },
    });
    expect(r.issue).not.toBe('automatique');
  });

  /** ⚠️ ABSENT ⇒ LE CAS NE JOUE PAS, et le moteur se comporte exactement comme avant ce lot. */
  it('⚠️ sans référence reliée, rien ne change', () => {
    const r = proposerBiens({ adresses: [], biens: [bien('315')] });
    expect(r.propositions.some((p) => p.cas === 'g')).toBe(false);
  });

  /** 🔴 PLUSIEURS BIENS SUR L'ÉVÉNEMENT : tous proposés, aucun coché. */
  it('🔴 un événement à deux biens en propose deux, décochés', () => {
    const r = proposerBiens({
      adresses: [], biens: [bien('315'), bien('316')],
      mongaRelie: { reference: 'MNG-20922', biens: ['315', '316'] },
    });
    expect(r.propositions.filter((p) => p.cas === 'g')).toHaveLength(2);
    expect(r.propositions.every((p) => !p.preCoche)).toBe(true);
  });
});

describe('③ la lecture qui alimente le cas (g)', () => {
  /**
   * 🔴🔴 ELLE NE REGARDE QUE LES MAILS **NON-MONGA** : un mail de Monga est déjà classé par sa propre porte
   * (`classerUnMailMonga`), et deux chemins pour le même mail finiraient par se contredire.
   */
  it('🔴🔴 seuls les mails d’un AUTRE expéditeur sont examinés', () => {
    const i = RATT.indexOf('async function referencesMongaCitees');
    const f = RATT.slice(i, RATT.indexOf('\n}\n\n/** LE CORPS COMMUN', i));
    expect(f).toContain("de_adresse !~* '@([a-z0-9-]+[.])*monga[.]io$'");
    expect(f).toContain('l.retire_le IS NULL');
  });

  /**
   * 🔴 ON REND LES BIENS, PAS L'ÉVÉNEMENT. L'historique d'un bien est fait de rattachements à des LOTS — « la
   * cible d'un classement est toujours un bien » (règle d'Arno du 28/09). S'arrêter à l'événement ne ferait
   * apparaître le mail nulle part.
   */
  it('🔴 la lecture passe par les biens de l’événement', () => {
    /* ⚠️ LA FONCTION SE BORNE À SON DERNIER `return out;` : elle en a DEUX, et le premier est le repli
       immédiat (`if (filIds.length === 0)`). Un découpage sur le premier ne lisait que trois lignes. */
    const i = RATT.indexOf('async function referencesMongaCitees');
    const f = RATT.slice(i, RATT.indexOf('\n}', RATT.lastIndexOf('return out;', RATT.indexOf('\n}\n\n/** LE CORPS COMMUN', i))));
    expect(f).toContain('biensDeLEvenement(');
    /* ⚠️ UNE LECTURE PAR ÉVÉNEMENT, PAS PAR MAIL : trois mails du même fil citent la même référence. */
    expect(f).toContain('if (parEvenement.has(r.evenement_id)) continue;');
  });

  /** ⚠️ UN ÉVÉNEMENT SANS BIEN NE PROPOSE RIEN : une proposition vide est un bruit, pas une aide. */
  it('⚠️ un événement sans bien ne produit aucune proposition', () => {
    const i = RATT.indexOf('async function referencesMongaCitees');
    const f = RATT.slice(i, RATT.indexOf('\n}\n\n/** LE CORPS COMMUN', i));
    expect(f).toContain('if (biens.length === 0) continue;');
  });
});
