import { describe, it, expect } from 'vitest';
import {
  evenementQuiProlonge, finDeLEvenement, finProlongee, motProlongation,
  motProlongationDeLaPeriode, periodeDuChoixLocataire,
  type CarteLocataireBien, type EvenementDuLocataire,
} from './historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — LA PÉRIODE D'UN LOCATAIRE PROLONGÉE PAR UN ÉVÉNEMENT ═════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), mot pour mot : « si un ÉVÉNEMENT le concerne et se poursuit APRÈS sa sortie
 * (litige, dépôt de garantie, n'importe quel type), la date de fin devient la date de CLÔTURE de cet événement,
 * ou AUJOURD'HUI s'il n'est pas clos. Avec plusieurs événements, on prend la fin la plus tardive. »
 *
 * ═══ 🔴🔴 LA DÉFINITION RETENUE DE « LE CONCERNE », ET OÙ CHAQUE MOITIÉ VIT ═════════════════════════════════════
 *
 * Un événement concerne une occupation si L'UNE des deux branches tient :
 *   ① SON OUVERTURE TOMBE DANS L'OCCUPATION — `ouvert_le::date` entre l'entrée et la sortie (ou aujourd'hui si
 *      le bail court) ;
 *   ② UN DE SES MAILS PORTE UNE ADRESSE DE SA CARTE OU DE SES CONTACTS ANNEXES — sans aucune condition de date,
 *      et les adresses internes exclues.
 *
 * Les deux branches sont calculées par le SQL de `evenementsParLocataire` (c'est lui qui connaît les mails) et
 * voyagent dans le champ `par` de `EvenementDuLocataire`. CE FICHIER-CI éprouve ce que la partie PURE en fait :
 * quelle fin elle retient, et quelle phrase elle écrit. Les deux branches y sont jouées (`par: 'occupation'` et
 * `par: 'adresse'`) parce que la prolongation ne doit PAS dépendre de celle qui a rattaché l'événement.
 *
 * ⚠️ POURQUOI LA BRANCHE ② N'A PAS DE CONDITION DE DATE — c'est la leçon du lot 16, vue du côté des dates
 * cette fois. Sur lot-146, les sept mails du dépôt de garantie de VAGLIO vont du 11/11/2025 au 30/09/2026 alors
 * que son bail s'est achevé le 22/10/2025 : une borne au bail n'en aurait montré AUCUN, c'est-à-dire exactement
 * le vide qu'Arno signalait.
 *
 * ⚠️ ET POURQUOI LA PROLONGATION NE RACCOURCIT JAMAIS : seule une fin PLUS TARDIVE que la sortie est retenue.
 * Un événement ouvert ET clos pendant le bail ne déplace donc rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le bien 104 (fiche lot-146), tel que la base le porte au 06/10/2026. */
const VAGLIO: CarteLocataireBien = {
  cle: 'occ-503', libelle: 'VAGLIO ARNAUD Aurélie et Louis',
  depuis: '2025-02-06', jusqua: '2025-10-22', enPlace: false,
  adresses: ['louis.vaglio@audencia.com', 'aurelie.arnaud1402@gmail.com'],
};
const EN_PLACE: CarteLocataireBien = {
  cle: 'occ-92', libelle: 'BRASSET Mathilde et BRUERE Thomas',
  depuis: '2025-10-22', jusqua: null, enPlace: true,
  adresses: ['mathilde.brasset@gmail.com'],
};
const CARTES = [EN_PLACE, VAGLIO];
const CHOIX_VAGLIO = { sorte: 'ancien', cle: 'occ-503' } as const;
const AUJOURDHUI = new Date('2026-10-06T12:00:00Z');

function evt(p: Partial<EvenementDuLocataire> = {}): EvenementDuLocataire {
  return {
    cle: 'occ-503', evenementId: 1, reference: 'GES-2026-000009',
    objet: 'Litige dépôt de garantie', ouvert: false,
    ouvertLe: '2025-11-11', closLe: '2026-03-15', par: 'occupation', ...p,
  };
}

describe('🔴🔴 la fin d’un événement : sa clôture, ou aujourd’hui', () => {
  it('UN ÉVÉNEMENT CLOS FINIT LE JOUR DE SA CLÔTURE', () => {
    expect(finDeLEvenement(evt({ closLe: '2026-03-15' }), AUJOURDHUI)).toBe('2026-03-15');
  });

  it('🔴 UN ÉVÉNEMENT EN COURS FINIT AUJOURD’HUI — la règle d’Arno, telle qu’il l’écrit', () => {
    expect(finDeLEvenement(evt({ ouvert: true, closLe: null }), AUJOURDHUI)).toBe('2026-10-06');
  });

  /**
   * ⚠️ `ouvert: false` AVEC UNE CLÔTURE ABSENTE EST UNE DONNÉE ABÎMÉE, et elle existe : l'état et la date sont
   * deux colonnes. On la traite comme « en cours » — supposer une clôture qu'on n'a pas aurait RACCOURCI la
   * période en silence, et fait disparaître des mails.
   */
  it('⚠️ CLOS SANS DATE DE CLÔTURE SE COMPORTE COMME EN COURS, jamais comme une sortie au bail', () => {
    expect(finDeLEvenement(evt({ ouvert: false, closLe: null }), AUJOURDHUI)).toBe('2026-10-06');
    expect(finDeLEvenement(evt({ ouvert: false, closLe: '' }), AUJOURDHUI)).toBe('2026-10-06');
  });

  it('⚠️ UNE CLÔTURE ILLISIBLE NE DEVIENT PAS UNE DATE INVENTÉE : aujourd’hui, comme un événement ouvert', () => {
    expect(finDeLEvenement(evt({ closLe: 'bientôt' }), AUJOURDHUI)).toBe('2026-10-06');
  });
});

describe('🔴🔴 LES QUATRE CAS DEMANDÉS PAR ARNO', () => {
  it('① SANS ÉVÉNEMENT : la période est celle du bail, du 06/02/2025 au 22/10/2025', () => {
    expect(periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO, [], AUJOURDHUI))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2025-10-22' });
    expect(evenementQuiProlonge(CARTES, CHOIX_VAGLIO, [], AUJOURDHUI)).toBeNull();
  });

  it('② ÉVÉNEMENT CLOS APRÈS LA SORTIE : la fin devient la date de CLÔTURE', () => {
    const p = periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO, [evt({ closLe: '2026-03-15' })], AUJOURDHUI);
    expect(p).toEqual({ sorte: 'dates', du: '2025-02-06', au: '2026-03-15' });
  });

  it('③ ÉVÉNEMENT EN COURS : la fin devient AUJOURD’HUI', () => {
    const p = periodeDuChoixLocataire(
      CARTES, CHOIX_VAGLIO, [evt({ ouvert: true, closLe: null })], AUJOURDHUI,
    );
    expect(p).toEqual({ sorte: 'dates', du: '2025-02-06', au: '2026-10-06' });
  });

  it('④ DEUX ÉVÉNEMENTS : la fin LA PLUS TARDIVE gagne, et c’est elle qu’on nomme', () => {
    const deux = [
      evt({ evenementId: 1, objet: 'État des lieux de sortie', closLe: '2025-12-01' }),
      evt({ evenementId: 2, objet: 'Litige dépôt de garantie', closLe: '2026-03-15' }),
    ];
    expect(periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO, deux, AUJOURDHUI))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2026-03-15' });
    expect(evenementQuiProlonge(CARTES, CHOIX_VAGLIO, deux, AUJOURDHUI)?.objet)
      .toBe('Litige dépôt de garantie');
  });

  /** L'ORDRE D'ARRIVÉE NE DOIT RIEN CHANGER : le SQL n'a pas de `ORDER BY` sur la clôture, et n'en aura pas. */
  it('④ bis L’ORDRE D’ARRIVÉE DES DEUX ÉVÉNEMENTS NE CHANGE RIEN', () => {
    const deux = [
      evt({ evenementId: 2, objet: 'Litige dépôt de garantie', closLe: '2026-03-15' }),
      evt({ evenementId: 1, objet: 'État des lieux de sortie', closLe: '2025-12-01' }),
    ];
    expect(evenementQuiProlonge(CARTES, CHOIX_VAGLIO, deux, AUJOURDHUI)?.evenementId).toBe(2);
  });
});

describe('🔴🔴 ce que la prolongation ne fait PAS', () => {
  it('🔴 UN ÉVÉNEMENT CLOS PENDANT LE BAIL NE RACCOURCIT RIEN : la sortie reste la sortie', () => {
    const pendant = evt({ ouvertLe: '2025-03-01', closLe: '2025-04-01' });
    expect(periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO, [pendant], AUJOURDHUI))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2025-10-22' });
    expect(evenementQuiProlonge(CARTES, CHOIX_VAGLIO, [pendant], AUJOURDHUI)).toBeNull();
  });

  it('🔴 L’ÉVÉNEMENT D’UN AUTRE LOCATAIRE NE PROLONGE PAS CELUI-CI — c’est le bug du lot 16, côté dates', () => {
    const duVoisin = evt({ cle: 'occ-92', closLe: '2027-01-01' });
    expect(periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO, [duVoisin], AUJOURDHUI))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2025-10-22' });
  });

  it('⚠️ LE LOCATAIRE EN PLACE N’EST JAMAIS PROLONGÉ : sa période n’a pas de borne haute à déplacer', () => {
    const r = finProlongee(EN_PLACE, [evt({ cle: 'occ-92', ouvert: true, closLe: null })], AUJOURDHUI);
    expect(r).toEqual({ au: null, parEvenement: null });
  });

  /**
   * ⚠️ CE CAS GARDE LA COMPATIBILITÉ : l'appel à deux arguments existe dans le dépôt (bascule des boutons de
   * période), et il doit rendre EXACTEMENT ce qu'il rendait avant ce lot.
   */
  it('⚠️ SANS HORLOGE NI ÉVÉNEMENT, la fonction rend la période du bail — comme avant ce lot', () => {
    expect(periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2025-10-22' });
  });

  it('🔴 LA BRANCHE QUI A RATTACHÉ L’ÉVÉNEMENT NE CHANGE PAS LA FIN : « adresse » prolonge comme « occupation »', () => {
    const parAdresse = evt({ par: 'adresse', ouvertLe: '2026-01-05', closLe: '2026-03-15' });
    expect(periodeDuChoixLocataire(CARTES, CHOIX_VAGLIO, [parAdresse], AUJOURDHUI))
      .toEqual({ sorte: 'dates', du: '2025-02-06', au: '2026-03-15' });
  });
});

describe('🔴🔴 la phrase qui l’explique', () => {
  it('ELLE EST CELLE D’ARNO, MOT POUR MOT', () => {
    expect(motProlongation(evt({ objet: 'Litige dépôt de garantie' })))
      .toBe('prolongée par l’événement « Litige dépôt de garantie »');
  });

  it('⚠️ SANS OBJET, LA RÉFÉRENCE PREND SA PLACE — jamais des guillemets vides', () => {
    expect(motProlongation(evt({ objet: '   ', reference: 'GES-2026-000009' })))
      .toBe('prolongée par l’événement « GES-2026-000009 »');
  });

  it('⚠️ RIEN À DIRE QUAND RIEN NE PROLONGE : une mention permanente apprend à ne plus être lue', () => {
    expect(motProlongation(null)).toBeNull();
  });
});

/**
 * ══ 🔴🔴 LE GARDE-FOU : LA PHRASE NE SURVIT PAS À UNE DATE CHANGÉE À LA MAIN ════════════════════════════════════
 *
 * Les bornes restent modifiables (« Dates personnalisées »). Une mention qui resterait accrochée affirmerait une
 * prolongation que l'écran ne montre plus.
 */
describe('🔴🔴 motProlongationDeLaPeriode — elle ne parle que des dates affichées', () => {
  const EVTS = [evt({ closLe: '2026-03-15' })];
  const PROLONGEE = { sorte: 'dates', du: '2025-02-06', au: '2026-03-15' } as const;

  it('ELLE PARAÎT SUR LA PÉRIODE PROLONGÉE', () => {
    expect(motProlongationDeLaPeriode(CARTES, CHOIX_VAGLIO, EVTS, PROLONGEE, AUJOURDHUI))
      .toBe('prolongée par l’événement « Litige dépôt de garantie »');
  });

  it('🔴 ELLE SE TAIT SI LA FIN A ÉTÉ RAMENÉE À LA MAIN AU JOUR DE LA SORTIE', () => {
    const aLaMain = { sorte: 'dates', du: '2025-02-06', au: '2025-10-22' } as const;
    expect(motProlongationDeLaPeriode(CARTES, CHOIX_VAGLIO, EVTS, aLaMain, AUJOURDHUI)).toBeNull();
  });

  it('🔴 ELLE SE TAIT SI LE DÉBUT A ÉTÉ CHANGÉ : la période n’est plus celle de ce locataire', () => {
    const autreDebut = { sorte: 'dates', du: '2024-01-01', au: '2026-03-15' } as const;
    expect(motProlongationDeLaPeriode(CARTES, CHOIX_VAGLIO, EVTS, autreDebut, AUJOURDHUI)).toBeNull();
  });

  it('⚠️ ELLE SE TAIT SUR « TOUS LES ÉCHANGES », qui n’a aucune borne à expliquer', () => {
    expect(motProlongationDeLaPeriode(CARTES, CHOIX_VAGLIO, EVTS, { sorte: 'tous' }, AUJOURDHUI)).toBeNull();
  });

  it('⚠️ ELLE SE TAIT QUAND AUCUNE CARTE N’EST CHOISIE', () => {
    expect(motProlongationDeLaPeriode(CARTES, { sorte: 'en_place' }, EVTS, PROLONGEE, AUJOURDHUI)).toBeNull();
  });
});
