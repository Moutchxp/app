import type { RegleExclusion } from './regles';

/**
 * ══ 🔴🔴 LES MAILS INTERNES DE LA LOCATION RANGÉS EN « COURRIER AUTOMATIQUE » DANS LA BOÎTE GESTION (Arno, 18/11/2026). PUR. ══
 *
 * Arno : « Prépare les règles d'exclusion pour ranger ces cinq mails en « Courrier automatique » dans la boîte Gestion. Elles ne
 * s'appliquent qu'aux messages ENVOYÉS par gestion@criterimmo.fr et reconnus par leur gabarit d'objet. » Garde-fous : « une RÉPONSE
 * HUMAINE à l'un de ces mails (locataire, propriétaire, collègue) reste dans la Réception » ; « le mail envoyé AU CLIENT lui-même
 * […] ne doit pas être caché : seule la copie interne est rangée ».
 *
 * CE QUE CES LIGNES SONT : la description EXACTE des lignes que la migration 494 pose dans `gestion_regle_exclusion` (même type,
 * même valeur, même sens, même motif). Les épreuves vérifient que chaque valeur est bien le gabarit (`normaliserObjet`) de l'objet
 * construit par le code, qu'aucun mail au client ni aucun autre mail de la Location ne porte ce gabarit, et que la migration pose
 * ces valeurs-là. Le moteur (`appliquerRegles`) ne lit, lui, que la base.
 *
 * 🔴 POURQUOI LE GARDE-FOU TIENT :
 *   · `sens = 'envoye'` : le moteur ne regarde que les messages DE gestion@criterimmo.fr (`sensDuMessage`). Une réponse d'un
 *     locataire, d'un propriétaire ou d'un collègue est REÇUE : aucune de ces règles ne la voit, elle reste en Réception ;
 *   · chaque gabarit n'appartient qu'à une copie interne (mesuré sur tous les objets de la Location) : le mail au client a
 *     un autre gabarit et reste visible.
 * ⚠️ LIMITE, dite plutôt que cachée : une réponse écrite DEPUIS gestion@criterimmo.fr (« RE: Alerte préavis — … ») a le même
 * gabarit (les « RE: » sont retirés) et serait rangée avec. Elle reste enregistrée et se lit par « Afficher aussi le courrier
 * automatique ».
 * 🔴 LE COMPTE RENDU DE PRÉ-VISITE (Arno, 18/11/2026, option 1) : sa copie interne porte désormais « [Copie interne] »
 * (`objetCopieInterneCompteRendu`) ; les mails aux locataires et aux propriétaires gardent `objetCompteRendu`, sans le préfixe. Son
 * gabarit est coupé à 70 caractères par `normaliserObjet` AVANT la date : il est le même pour tous les comptes rendus.
 */
export const REGLES_COURRIER_LOCATION: readonly Omit<RegleExclusion, 'id'>[] = [
  {
    type: 'gabarit_objet', valeur: 'Alerte préavis', sens: 'envoye',
    motif: 'Alerte interne de la Location « aucune pré-visite fixée » (individuelle ou récapitulative), envoyée aux collaborateurs prévenus.',
  },
  {
    type: 'gabarit_objet', valeur: '[Copie interne] Pré-visite d’état des lieux de sortie', sens: 'envoye',
    motif: 'Copie interne du mail « Refus / absence de pré-visite » de la Location (le mail aux locataires, lui, reste visible).',
  },
  {
    type: 'gabarit_objet', valeur: '[Copie interne] Compte rendu de pré-visite d’état des lieux de sortie…', sens: 'envoye',
    motif: 'Copie interne du compte rendu de pré-visite de la Location (les mails aux locataires et aux propriétaires, eux, restent visibles).',
  },
  {
    type: 'gabarit_objet', valeur: 'Sortie de locataire', sens: 'envoye',
    motif: 'Mail interne de la Location « Sortie de locataire » (sortie enregistrée, parcours préavis / sortie), envoyé aux collaborateurs prévenus.',
  },
];
