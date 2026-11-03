import type { ActiviteLue } from '../../location/suivi/tableauBord';
import type { Apporteur, RegleCommission } from '../../location/suivi/suivi';
import { ligneLocationCa } from '../../transaction/locationCa';
import type { GestionMois, LigneVente, Partie, Retrocession, Vente } from '../../transaction/modele';
import type { EntreesCoutsGlobaux } from '../../transaction/coutsGlobal';
import { resolveurDe } from '../../transaction/statutLigne';

/**
 * 🔴 « Les coûts » — données FICTIVES de deux années (2025, 2026), montants impairs : une vente partagée CRITERIMMO → MACJ (inter-cabinet), une vente
 * avec apporteur, une agence extérieure, une vente MACJ seule, une vente « mois à confirmer » (2026), des rétrocessions mensuelles ; la location
 * (baux, un mois avec salaires : primes et variable « inclus ») et la gestion (ADHOC, MONGA, salaires). Partagées par les épreuves pures et d'écran.
 */
const ligne = (o: Partial<LigneVente>): LigneVente => ({ id: 1, negociateur: 'X', role: 'negociateur', montantTtc: null, nature: 'vente', compte: true, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const partie = (o: Partial<Partie>): Partie => ({ sorte: 'entree', compteId: 2, negociateur: 'Arnaud Jorel', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null, ...o });
const vente = (o: Partial<Vente>): Vente => ({ id: 1, societe: 'criterimmo', libelle: 'X', honorairesTtc: 4000, statut: 'vendue', annee: 2026, mois: 3, dateCompromis: null,
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const dossier = (entree: { id: number; nom: string } | null, sortie: { id: number; nom: string } | null) =>
  ({ adresseBien: null, dateActePrevue: null, dateActe: null, entree, sortie, apporteurId: null, personnes: [] });
const ARNAUD = partie({ statut: 'associe' });
const PIERRE = partie({ sorte: 'sortie', compteId: 8, negociateur: 'Pierre Thevenin', societe: 'macj', statut: 'independant' });

export const VENTES_COUTS: Vente[] = [
  // CRITERIMMO porte, MACJ reçoit sa part (l'inter-cabinet : jamais un coût)
  vente({ id: 38, libelle: 'PARTAGÉE', honorairesTtc: 4000.07, mois: 3, repartition: { retroApporteurTtc: 0, parties: [ARNAUD, PIERRE] },
    dossier: dossier({ id: 2, nom: 'Arnaud Jorel' }, { id: 8, nom: 'Pierre Thevenin' }),
    lignes: [ligne({ id: 443, negociateur: 'Arnaud Jorel', cote: 'entree', montantTtc: 2000.03 }), ligne({ id: 444, negociateur: 'Pierre Thevenin', cote: 'sortie', montantTtc: 2000.04 })] }),
  // un apporteur (1 000,01 € TTC) et une agence extérieure (20 %)
  vente({ id: 37, libelle: 'APPORTÉE', honorairesTtc: 7500.11, mois: 6, retroApporteur: { montant: 1000.01, unite: 'ttc' },
    repartition: { retroApporteurTtc: 1000.01, parties: [ARNAUD, partie({ sorte: 'exterieure', compteId: null, negociateur: null, societe: null, nom: 'Agence du Parc', pourcentage: 20 })] },
    dossier: dossier({ id: 2, nom: 'Arnaud Jorel' }, null), lignes: [ligne({ id: 440, negociateur: 'Arnaud Jorel', cote: 'entree', montantTtc: 3250.05 })] }),
  // historique : MACJ seule, 2025 ; CRITERIMMO 2025 ; « mois à confirmer » 2026
  vente({ id: 12, societe: 'macj', libelle: 'MACJ 2025', honorairesTtc: 9000.09, annee: 2025, mois: 9, origine: 'import', lignes: [ligne({ id: 12, negociateur: 'MYLENE', montantTtc: 2700.03 })] }),
  vente({ id: 13, libelle: 'CRITERIMMO 2025', honorairesTtc: 6000.01, annee: 2025, mois: 4, origine: 'import', lignes: [ligne({ id: 13, negociateur: 'CEDRIC', montantTtc: 1500.07 })] }),
  vente({ id: 14, libelle: 'SANS MOIS', honorairesTtc: 3000.03, annee: 2026, mois: null, origine: 'import', lignes: [ligne({ id: 14, negociateur: 'CEDRIC', montantTtc: 900.09 })] }),
  vente({ id: 15, societe: 'macj', libelle: 'MACJ 2026', honorairesTtc: 5000.05, annee: 2026, mois: 9, origine: 'import', lignes: [ligne({ id: 15, negociateur: 'MYLENE', montantTtc: 1250.01 })] }),
];
export const RETROS_COUTS = [
  { id: 1, societe: 'criterimmo', annee: 2026, mois: 3, negociateur: 'Arnaud Jorel', montantTtc: 300.03, apporteur: 'DEBLOIS', venteId: 38, libelle: null, origine: 'saisie', sourceOnglet: null, sourceCellule: null },
  { id: 2, societe: 'macj', annee: 2025, mois: 9, negociateur: 'MYLENE', montantTtc: 120.12, apporteur: 'SEUL', venteId: 12, libelle: null, origine: 'saisie', sourceOnglet: null, sourceCellule: null },
] as unknown as Retrocession[];

const regles: RegleCommission[] = [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }];
const apporteurs: Apporteur[] = [{ id: 7, nom: 'Agence Martin', type: 'agence', baremes: [{ depuis: '2019-01-01', taux: 0.1 }], archive: false }];
let n = 0;
const bail = (o: Partial<ActiviteLue>): ActiviteLue => ({
  id: ++n, type: 'bail', dateSignature: '2026-09-12', dateSupposee: false, libelleProprietaire: 'DUPONT', libelleLocataire: 'MARTIN', honoProprietaireHt: 500.05, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: false, categoriePrime: null, apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, negociateurId: 5,
  negociateurLibelle: 'Jean-Baptiste PONS', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: false,
  vacanceJours: null, rattachement: 'rattache', lotId: 3, bailId: 9, source: 'saisie', lots: [], locataires: [], ...o,
} as ActiviteLue);
export const LIGNES_LOCATION_COUTS = [bail({ mandatGestion: true, avecGestion: true, apporteurId: 7 }), bail({ dateSignature: '2026-08-03', mandatGestion: true }),
  bail({ dateSignature: '2025-09-01', honoProprietaireHt: 300 }), bail({ dateSignature: '2025-03-14', mandatGestion: true, apporteurId: 7 })]
  .map((x) => ligneLocationCa(x, { regles, apporteurs }));
const g = (annee: number, mois: number, o: Partial<GestionMois>): GestionMois => ({ id: annee * 100 + mois, annee, mois, nbLots: 300, honorairesHt: 18000.07, adhocHt: 2914.8, mongaHt: 12.34,
  salarieHt: 2688.91, resteHt: null, note: null, origine: 'saisie', ...o } as GestionMois);
export const GESTION_COUTS = [g(2026, 9, {}), g(2026, 8, { mongaHt: null, salarieHt: null }), g(2025, 9, { honorairesHt: 17000 }), g(2025, 2, { adhocHt: 1999.99, salarieHt: 1500.5 })];
// août 2026 : les salaires de la Location saisis → primes et variable « inclus dans les salaires »
export const SALAIRES_LOCATION_COUTS = [{ annee: 2026, mois: 8, salairesHt: 1000.01, note: null }];

export const E_COUTS: EntreesCoutsGlobaux = { ventes: VENTES_COUTS, retrocessions: RETROS_COUTS, statutDuLibelle: resolveurDe(undefined),
  location: { lignes: LIGNES_LOCATION_COUTS, retrocessions: [], salaires: SALAIRES_LOCATION_COUTS }, gestion: GESTION_COUTS };
