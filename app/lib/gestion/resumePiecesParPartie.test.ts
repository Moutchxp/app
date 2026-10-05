import { describe, it, expect } from 'vitest';
import {
  motPiecesEcartees, partagerPourLeResume, partiesCochees, porteurRetenuAuResume,
  type PorteurAdresse,
} from './historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 1 — UNE PIÈCE N'EST PAS CELLE DE QUI LA REÇOIT ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026, lot-146, SEUL le groupe Propriétaire coché) : « au milieu des pièces de Blandine
 * Piriou, le résumé montre "RIB - Boursorama Thomas Derrien.pdf", reçu de DERRIEN Thomas (ancien locataire). »
 *
 * 🔴 MESURÉ EN BASE — message 52187, « Re: Bilan des charges Ternes », 12/02/2025 15:33 :
 *     De  thomas.derrien@hec.edu       (ancien locataire, bail clos le 31/01/2025)
 *     À   blandine.piriou@gmail.com    (LA PROPRIÉTAIRE COCHÉE — destinataire DIRECT, pas une copie)
 *     Cc  alizee.acket@hec.edu, gestion@criterimmo.fr, jb.pons@sansvisavis.com
 *
 * Le jeu d'essai de ce fichier EST ce message-là. Sa place dans le listing est juste — le courrier concerne la
 * propriétaire. Sa place dans le RÉSUMÉ DES PIÈCES ne l'est pas : le RIB est le document d'un locataire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const PROPRIO = 'blandine.piriou@gmail.com';
const DERRIEN = 'thomas.derrien@hec.edu';
const ACKET = 'alizee.acket@hec.edu';
const NOUS = 'gestion@criterimmo.fr';

const qui = (adresse: string) => ({ nom: null, adresse });

/** Le message 52187, à la lettre. */
const RIB: PorteurAdresse = {
  sens: 'recu', de: DERRIEN,
  a: [qui(PROPRIO)],
  cc: [qui(ACKET), qui(NOUS), qui('jb.pons@sansvisavis.com')],
};
/** Un mail de la propriétaire elle-même. */
const DE_LA_PROPRIO: PorteurAdresse = { sens: 'recu', de: PROPRIO, a: [qui(NOUS)], cc: [] };
/** Un mail que NOUS avons envoyé à la propriétaire. */
const NOTRE_ENVOI: PorteurAdresse = { sens: 'envoye', de: NOUS, a: [qui(PROPRIO)], cc: [] };
/** Un mail que NOUS avons envoyé au locataire, la propriétaire en copie. */
const NOTRE_ENVOI_CC: PorteurAdresse = { sens: 'envoye', de: NOUS, a: [qui(DERRIEN)], cc: [qui(PROPRIO)] };

describe('🔴🔴 ① le défaut d’Arno, fermé', () => {
  const cochees = partiesCochees([PROPRIO]);

  /**
   * 🔴🔴 LE CAS SIGNALÉ. « Une pièce envoyée par une partie NON cochée n'y figure JAMAIS, même si une partie
   * cochée était en copie » (Arno) — et ici elle n'était même pas en copie : elle était le destinataire direct.
   * C'est le cas le plus difficile à écarter, et c'est celui qu'il a vu.
   */
  it('🔴🔴 le RIB de DERRIEN n’entre pas dans les pièces de la propriétaire', () => {
    expect(porteurRetenuAuResume(RIB, cochees)).toBe(false);
  });

  it('🔴 ce que la propriétaire a elle-même envoyé entre', () => {
    expect(porteurRetenuAuResume(DE_LA_PROPRIO, cochees)).toBe(true);
  });

  it('🔴 ce que NOUS lui avons envoyé entre, en « À » comme en « Cc »', () => {
    expect(porteurRetenuAuResume(NOTRE_ENVOI, cochees)).toBe(true);
    expect(porteurRetenuAuResume(NOTRE_ENVOI_CC, cochees)).toBe(true);
  });

  /**
   * ⚠️ L'ASYMÉTRIE EST VOULUE, ET C'EST LA DEMANDE D'ARNO À LA LETTRE : « envoyé par nous À une partie cochée
   * (À ou Cc) ». Quand NOUS écrivons, mettre quelqu'un en copie c'est lui adresser le document ; quand un tiers
   * écrit, la copie ne fait pas de lui l'auteur de la pièce. Le RIB en est la preuve.
   */
  it('🔴🔴 la copie compte pour NOS envois, jamais pour une réception', () => {
    const recuAvecElleEnCopie: PorteurAdresse = { sens: 'recu', de: DERRIEN, a: [qui(NOUS)], cc: [qui(PROPRIO)] };
    expect(porteurRetenuAuResume(recuAvecElleEnCopie, cochees)).toBe(false);
    expect(porteurRetenuAuResume({ ...recuAvecElleEnCopie, sens: 'envoye' }, cochees)).toBe(true);
  });
});

describe('🔴🔴 ② locataire seul, les deux, et le cas ordinaire', () => {
  it('🔴 locataire seul : le RIB entre, et le mail de la propriétaire sort', () => {
    const c = partiesCochees([DERRIEN, ACKET]);
    expect(porteurRetenuAuResume(RIB, c)).toBe(true);
    expect(porteurRetenuAuResume(DE_LA_PROPRIO, c)).toBe(false);
    /* ⚠️ NOTRE envoi au locataire entre aussi : c'est bien un document que nous lui avons adressé. */
    expect(porteurRetenuAuResume(NOTRE_ENVOI_CC, c)).toBe(true);
    expect(porteurRetenuAuResume(NOTRE_ENVOI, c)).toBe(false);
  });

  it('🔴 les deux cochés : les deux familles entrent', () => {
    const c = partiesCochees([PROPRIO, DERRIEN]);
    for (const m of [RIB, DE_LA_PROPRIO, NOTRE_ENVOI, NOTRE_ENVOI_CC]) {
      expect(porteurRetenuAuResume(m, c)).toBe(true);
    }
  });

  /**
   * ══ 🔴🔴 LE PIÈGE QUI AURAIT VIDÉ LE CAS ORDINAIRE ═══════════════════════════════════════════════════════════
   *
   * Prise à la lettre, la règle écarte TOUT quand personne n'est coché — rien n'est « envoyé par une partie
   * cochée » quand il n'y en a pas. Le résumé de l'ARRIVÉE sur une fiche serait alors vide. C'est le piège du
   * lot 71 (un ensemble vide n'est jamais « tout satisfait ») sous un autre visage, et il est fermé ici.
   */
  it('🔴🔴 aucune partie cochée ⇒ AUCUN filtre, et surtout pas un résumé vide', () => {
    const c = partiesCochees([]);
    for (const m of [RIB, DE_LA_PROPRIO, NOTRE_ENVOI, NOTRE_ENVOI_CC]) {
      expect(porteurRetenuAuResume(m, c)).toBe(true);
    }
  });

  it('⚠️ les chaînes vides et les blancs ne cochent personne', () => {
    expect(partiesCochees(['  ', '']).size).toBe(0);
    expect(partiesCochees([`  ${PROPRIO.toUpperCase()} `]).has(PROPRIO)).toBe(true);
  });

  it('⚠️ la casse et les espaces des en-têtes sont ignorés', () => {
    const c = partiesCochees([PROPRIO]);
    expect(porteurRetenuAuResume({ sens: 'recu', de: ` ${PROPRIO.toUpperCase()} `, a: [], cc: [] }, c)).toBe(true);
    expect(porteurRetenuAuResume(
      { sens: 'envoye', de: NOUS, a: [qui(` ${PROPRIO.toUpperCase()} `)], cc: [] }, c)).toBe(true);
  });
});

describe('🔴 ③ le partage rend les deux moitiés, pour que la phrase soit vraie', () => {
  it('🔴 gardés et écartés, sans perte ni doublon', () => {
    const tous = [RIB, DE_LA_PROPRIO, NOTRE_ENVOI, NOTRE_ENVOI_CC];
    const t = partagerPourLeResume(tous, partiesCochees([PROPRIO]));
    expect(t.ecartes).toEqual([RIB]);
    expect(t.gardes).toHaveLength(3);
    expect(t.gardes.length + t.ecartes.length).toBe(tous.length);
  });

  it('🔴 sans partie cochée, rien n’est écarté', () => {
    const t = partagerPourLeResume([RIB, DE_LA_PROPRIO], partiesCochees([]));
    expect(t.ecartes).toEqual([]);
    expect(t.gardes).toHaveLength(2);
  });
});

describe('🔴 ④ la phrase discrète', () => {
  /** 🔴 LE MOT D'ARNO, MOT POUR MOT au pluriel. */
  it('🔴🔴 la phrase, mot pour mot', () => {
    expect(motPiecesEcartees(3))
      .toBe('3 pièces envoyées par des parties non cochées ne sont pas reprises dans le résumé.');
  });

  /** ⚠️ LE SINGULIER EST ÉCRIT : « 1 pièces » fait douter du nombre lui-même. */
  it('⚠️ au singulier, la phrase reste française', () => {
    expect(motPiecesEcartees(1))
      .toBe('1 pièce envoyée par une partie non cochée n’est pas reprise dans le résumé.');
  });

  /**
   * 🔴 RIEN À DIRE ⇒ RIEN D'ÉCRIT. Une phrase permanente « 0 pièce écartée » apprend à l'œil à ne plus la lire,
   * et le jour où elle dit quelque chose on ne la voit plus.
   */
  it('🔴 zéro, et tout ce qui n’est pas un nombre, ne disent rien', () => {
    for (const n of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(motPiecesEcartees(n), String(n)).toBeNull();
    }
  });
});
