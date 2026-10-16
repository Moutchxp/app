import { describe, it, expect } from 'vitest';
import { accoladesDuBienDansLeFil, LIBELLE_AJOUT, LIBELLE_RETRAIT, type RattachesParMail } from './accoladesBien';
import { changementsDuFil, motBiensRattaches, type PeriodeAncienne } from './changementsSuivi';
import { projeter, type Classement, type ExceptionMail, type Periode } from './periodesConversation';
import { biensDuMail } from './ficheRattachement';

/**
 * ══ 🔴🔴 LOT ACCOLADE-TOUJOURS-VRAIE — GARDE-FOU PERMANENT ═════════════════════════════════════════════════════════════
 *
 * RÈGLE ABSOLUE D'ARNO (12/10/2026) : « le texte d'une accolade dit TOUJOURS la réalité actuelle de ce qu'il annonce.
 * Jamais un chiffre figé au moment de la pose, jamais une période annulée ou remplacée présentée comme en vigueur. »
 *
 * UNE CONVERSATION DE BANC qui rejoue le scénario du fil 16502 (rattacher, détacher, rattacher, annuler, remplacer).
 * À CHAQUE ÉTAPE : chiffre de l'accolade = compteur de la ligne = fenêtre « Bien(s) rattaché(s) à ce mail ».
 *
 * 🔴 COMMENT LE BANC TIENT LES TROIS CHIFFRES. En base, les liens d'un mail sont la PROJECTION des fenêtres vivantes et
 * des exceptions ; le compteur et la fenêtre les lisent (le compteur par `clesBiensParMail`, la fenêtre par
 * `biensDuMail`). Le banc projette donc avec `projeter`, en tire les liens confirmés, et fait lire les trois chiffres
 * à leurs propres fonctions. 🔒 Rien n'est lu ni écrit en base.
 */

const MAILS = [26188, 26116, 26111];
const B = (...cles: string[]): Classement => ({ sorte: 'biens', biens: cles.map((cle) => ({ cle, libelle: `lot ${cle}` })) });

/** Une conversation de banc : fenêtres vivantes, fenêtres refermées, exceptions. Les gestes la font évoluer. */
class Banc {
  vivantes: Periode[] = [];
  refermees: PeriodeAncienne[] = [];
  exceptions: ExceptionMail[] = [];
  private id = 1;
  private t = 0;
  private quand(): string { this.t += 1; return new Date(Date.UTC(2026, 9, 12, 0, this.t)).toISOString(); }
  /** « Ce mail + futurs échanges » : la fenêtre de ce mail est remplacée (refermée au même instant). */
  suite(depuis: number, c: Classement): Periode {
    const le = this.quand();
    for (const p of this.vivantes.filter((x) => x.depuisMessageId === depuis)) this.refermees.push({ ...p, remplaceeLe: le });
    this.vivantes = this.vivantes.filter((x) => x.depuisMessageId !== depuis);
    const p: Periode = { id: this.id++, depuisMessageId: depuis, classement: c, parLibelle: 'a.jorel@sansvisavis.com', le };
    this.vivantes.push(p);
    return p;
  }
  /** « Annuler » : la fenêtre posée est refermée, SANS remplaçante ; la précédente du même mail n'est PAS rouverte
      ici (le banc suit la base : `annulerClassement` ne referme que ce que le geste a créé). */
  annuler(p: Periode, retablir?: Periode): void {
    const le = this.quand();
    this.vivantes = this.vivantes.filter((x) => x.id !== p.id);
    this.refermees.push({ ...p, remplaceeLe: le });
    if (retablir !== undefined) {
      this.refermees = this.refermees.filter((x) => x.id !== retablir.id);
      this.vivantes.push(retablir);
    }
  }
  /** Les liens confirmés d'aujourd'hui, tels que la projection les écrit. */
  liens(): { id: number; messageId: number; statut: 'confirme'; cle: string }[] {
    const proj = projeter(MAILS, this.vivantes, this.exceptions);
    let n = 1;
    return MAILS.flatMap((m) => (proj.get(m)?.biens ?? []).map((b) => ({ id: n++, messageId: m, statut: 'confirme' as const, cle: b.cle })));
  }
  rattachesParMail(): RattachesParMail {
    const l = this.liens();
    return new Map(MAILS.map((m) => [m, new Set(l.filter((x) => x.messageId === m).map((x) => x.cle))]));
  }
  /** La fenêtre « Bien(s) rattaché(s) à ce mail » : `biensDuMail` sur les liens. */
  fenetre(messageId: number): number {
    const l = this.liens();
    const cles = [...new Set(l.map((x) => x.cle))];
    const biens = cles.map((cle) => ({ cle, lienIds: l.filter((x) => x.cle === cle).map((x) => x.id), nbMails: 1, statut: 'classe' as const }));
    return biensDuMail(biens, l.map((x) => ({ id: x.id, messageId: x.messageId, statut: x.statut, motif: null })), messageId).length;
  }
  /** Le compteur sous la date. */
  compteur(messageId: number): number { return this.rattachesParMail().get(messageId)?.size ?? 0; }
  accolades(cle: string) {
    return accoladesDuBienDansLeFil({
      filId: 16502, mails: MAILS, periodes: this.vivantes, anciennes: this.refermees, cle,
      rattachesParMail: this.rattachesParMail(),
    });
  }
}

/** LE CONTRÔLE DES TROIS CHIFFRES, pour chaque accolade affichée sur chaque bien en jeu. */
function verifier(b: Banc, cles: readonly string[]): void {
  for (const cle of cles) {
    for (const a of b.accolades(cle)) {
      const n = b.compteur(a.depuisMessageId);
      expect(b.fenetre(a.depuisMessageId), `fenêtre ≠ compteur au mail ${a.depuisMessageId}`).toBe(n);
      if (a.sens === 'modif') expect(a.libelle).toBe(`suivi de fond modifié — ${motBiensRattaches(n)}`);
      if (a.sens === 'ajout') expect(b.rattachesParMail().get(a.depuisMessageId)?.has(cle)).toBe(true);
      if (a.sens === 'retrait') expect(b.rattachesParMail().get(a.depuisMessageId)?.has(cle)).toBe(false);
      /* 🔴 JAMAIS UNE FENÊTRE REFERMÉE PRÉSENTÉE COMME EN VIGUEUR. */
      expect(b.vivantes.some((p) => p.depuisMessageId === a.depuisMessageId)).toBe(true);
    }
  }
}

describe('🔴🔴 le scénario d’Arno (fil 16502), étape par étape', () => {
  it('rattacher, détacher, rattacher, annuler, remplacer : accolade = compteur = fenêtre à chaque étape', () => {
    const b = new Banc();
    const tous = ['219', '224', '373'];
    b.vivantes.push({ id: 900, depuisMessageId: 26188, classement: B('219'), parLibelle: 'reprise des périodes', le: '2026-10-01T12:00:00Z' });
    verifier(b, tous);
    expect(b.accolades('219')).toEqual([]);

    /* ① rattacher 224 à partir du premier mail */
    b.suite(26188, B('219', '224'));
    verifier(b, tous);
    /* 🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — jamais de repère sur le PREMIER mail (26188) : rien ne le précède. */
    expect(b.accolades('224')).toEqual([]);
    expect(b.accolades('219')).toEqual([]);

    /* ② détacher 224 (le même mail : la fenêtre est remplacée) */
    b.suite(26188, B('219'));
    verifier(b, tous);
    expect(b.accolades('219')).toEqual([]);

    /* ③ rattacher 373 à partir du 2ᵉ mail, puis ANNULER : plus aucune accolade à ce mail, et pas de « 2 biens » figé */
    const posee = b.suite(26116, B('219', '373'));
    verifier(b, tous);
    expect(b.accolades('219').find((a) => a.depuisMessageId === 26116)?.libelle).toBe('suivi de fond modifié — 2 biens rattachés');
    b.annuler(posee);
    verifier(b, tous);
    expect(b.accolades('219').some((a) => a.depuisMessageId === 26116)).toBe(false);
    expect(b.accolades('373')).toEqual([]);
    expect(b.compteur(26116)).toBe(1);

    /* ④ remplacer deux fois sur le même mail : seule l'accolade du plus récent, l'ancien dans le « i » */
    b.suite(26116, B('219', '373'));
    b.suite(26116, B('219'));
    verifier(b, tous);
    const au26116 = b.accolades('219').filter((a) => a.depuisMessageId === 26116);
    expect(au26116).toHaveLength(1);
    expect(au26116[0].libelle).toBe('suivi de fond modifié — 1 bien rattaché');
    expect(au26116[0].autres?.length).toBeGreaterThan(0);
    /* Les changements, eux, ne comptent qu'une fenêtre vivante par mail. */
    expect(changementsDuFil({ mails: MAILS, periodes: b.vivantes, anciennes: b.refermees })
      .filter((c) => c.depuisMessageId === 26116)).toHaveLength(1);
  });

  it('🔴 un bien « sorti du suivi » à la main sur le mail déclencheur : l’entrée qui l’annonce disparaît, le chiffre suit', () => {
    const b = new Banc();
    b.vivantes.push({ id: 900, depuisMessageId: 26188, classement: B('219'), parLibelle: 'reprise des périodes', le: 'x' });
    b.suite(26116, B('219', '373'));
    /* La réalité d'aujourd'hui : 373 a été sorti du suivi au mail 26116 (lien « sorti », hors du compte). */
    const reels: RattachesParMail = new Map([[26188, new Set(['219'])], [26116, new Set(['219'])], [26111, new Set(['219', '373'])]]);
    const pour = (cle: string) => accoladesDuBienDansLeFil({
      filId: 16502, mails: MAILS, periodes: b.vivantes, anciennes: b.refermees, cle, rattachesParMail: reels,
    });
    expect(pour('373')).toEqual([]);
    expect(pour('219')[0].libelle).toBe('suivi de fond modifié — 1 bien rattaché');
  });
});
