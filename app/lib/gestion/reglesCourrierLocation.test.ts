import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REGLES_COURRIER_LOCATION } from './reglesCourrierLocation';
import { appliquerRegles, type MessageJuge, type RegleExclusion } from './regles';
import { normaliserObjet } from './typologie';
import { sensDuMessage } from './capture';
import * as P from '../location/previsite';
import * as M from '../location/mailsPreavisSortie';
import { objetMailSortie } from '../location/sortieLocataires';

/**
 * 🔴 Arno (18/11/2026) — « la règle d'exclusion range la copie interne, mais pas une réponse humaine ni le mail au client. »
 * Le moteur réel (`appliquerRegles`, `sensDuMessage`, `normaliserObjet`) appliqué aux règles que pose la migration 494, sur les
 * objets RÉELS construits par le code de la Location.
 */
const GESTION = 'gestion@criterimmo.fr';
const ADRESSE = '52 Avenue de L’Arche, 92400 Courbevoie';
const RDV = { jour: '2026-12-01', heure: '10:00', dureeMinutes: 60 } as never;
const REGLES: RegleExclusion[] = REGLES_COURRIER_LOCATION.map((r, i) => ({ ...r, id: 500 + i }));
const message = (de: string, objet: string): MessageJuge => ({ sens: sensDuMessage(de, GESTION), deAdresse: de, objet, entetes: {} });
const range = (de: string, objet: string): boolean => appliquerRegles(REGLES, message(de, objet)) !== null;

/** Les copies INTERNES visées, telles que le code les construit. */
const INTERNES = {
  alerte: P.objetAlertePrevisite(ADRESSE),
  recapitulatif: P.objetRecapAlertes(3),
  refusCopie: `${M.PREFIXE_COPIE_INTERNE}${P.objetRefusPrevisite(ADRESSE)}`,
  compteRenduCopie: P.objetCopieInterneCompteRendu(RDV),
  sortieEnregistree: objetMailSortie({ adresse: ADRESSE, lotId: 7 }),
};
/** Tous les AUTRES objets de la Location — mails aux clients, aux partenaires, et autres copies internes. */
const AUTRES = {
  refusAuxLocataires: P.objetRefusPrevisite(ADRESSE),
  compteRendu: P.objetCompteRendu(RDV),
  confirmationRdv: P.objetConfirmationLocataires(ADRESSE, RDV),
  copieConfirmationRdv: `${M.PREFIXE_COPIE_INTERNE}${P.objetConfirmationLocataires(ADRESSE, RDV)}`,
  modificationRdv: P.objetModificationLocataires(ADRESSE, RDV),
  invitationCompteRendu: P.objetInvitationCompteRendu(ADRESSE, RDV),
  annulation: P.objetAnnulationCollegues(ADRESSE, RDV),
  accuseConge: M.objetAccuseConge(ADRESSE),
  adhocPreavis: M.objetAdhocPreavis({ adresse: ADRESSE, locataires: [{ nom: 'BERNARD', prenom: 'Alice' }] } as never),
  adhocSortie: M.objetAdhocSortie(ADRESSE),
  departLocataires: M.objetSortieLocataires(ADRESSE),
};

describe('🔴 les règles « courrier automatique » des mails internes de la Location', () => {
  it('chaque règle : gabarit d’objet, sens « envoyé » seulement, et sa valeur est le gabarit réel d’une copie interne', () => {
    for (const r of REGLES_COURRIER_LOCATION) expect(r).toMatchObject({ type: 'gabarit_objet', sens: 'envoye' });
    expect(REGLES_COURRIER_LOCATION.map((r) => r.valeur)).toEqual([
      normaliserObjet(INTERNES.alerte), normaliserObjet(INTERNES.refusCopie), normaliserObjet(INTERNES.compteRenduCopie), normaliserObjet(INTERNES.sortieEnregistree),
    ]);
    expect(normaliserObjet(INTERNES.recapitulatif)).toBe(normaliserObjet(INTERNES.alerte));
  });

  it('🔴 envoyées par gestion@criterimmo.fr : les COPIES INTERNES sont rangées (alerte, récapitulatif, copie du refus, sortie)', () => {
    for (const [quoi, objet] of Object.entries(INTERNES)) expect(range(GESTION, objet), quoi).toBe(true);
  });

  it('🔴 compte rendu : la COPIE INTERNE porte le préfixe et est rangée, quelle que soit la date ; le mail aux clients, sans préfixe, ne l’est pas', () => {
    for (const r of [{ jour: '2026-12-01', heure: '10:00' }, { jour: '2027-01-31', heure: '18:45' }] as never[]) {
      expect(P.objetCopieInterneCompteRendu(r)).toBe(`[Copie interne] ${P.objetCompteRendu(r)}`);
      expect(range(GESTION, P.objetCopieInterneCompteRendu(r))).toBe(true);
      expect(P.objetCompteRendu(r).startsWith('[Copie interne]')).toBe(false);
      expect(range(GESTION, P.objetCompteRendu(r))).toBe(false);
    }
  });

  it('🔴 le mail AU CLIENT n’est pas rangé, ni aucun autre mail de la Location (compte rendu aux clients compris)', () => {
    for (const [quoi, objet] of Object.entries(AUTRES)) expect(range(GESTION, objet), quoi).toBe(false);
  });

  it('🔴 une RÉPONSE HUMAINE (collègue, locataire, propriétaire) est REÇUE : jamais rangée, elle reste en Réception', () => {
    expect(range('c.jullien@sansvisavis.com', `RE: ${INTERNES.alerte}`)).toBe(false);
    expect(range('locataire@exemple.fr', `RE: ${INTERNES.refusCopie}`)).toBe(false);
    expect(range('locataire@exemple.fr', `RE: ${AUTRES.refusAuxLocataires}`)).toBe(false);
    expect(range('proprietaire@exemple.fr', `Re: ${INTERNES.sortieEnregistree}`)).toBe(false);
    // Même objet qu'une copie interne, mais écrit par quelqu'un d'autre : reçu, donc jamais rangé.
    expect(range('jb.pons@sansvisavis.com', INTERNES.alerte)).toBe(false);
  });

  it('la migration 494 pose exactement ces règles (type, valeur, sens, motif), une fois chacune', () => {
    const sql = readFileSync('db/migrations/494_gestion_regles_courrier_location.sql', 'utf8');
    for (const r of REGLES_COURRIER_LOCATION) {
      expect(sql).toContain(`('${r.type}', '${r.valeur}', '${r.sens}',\n     '${r.motif}')`);
    }
    expect(sql.replace(/\s+/g, ' ')).toContain('WHERE NOT EXISTS (SELECT 1 FROM gestion_regle_exclusion r WHERE r.type = v.type AND lower(r.valeur) = lower(v.valeur) AND r.sens = v.sens)');
  });
});
