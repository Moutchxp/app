/**
 * Module INTERNAUTE — Catalogue SERVEUR des textes de consentement VERSIONNÉS (bloc B).
 *
 * Pur, sans dépendance (importable côté serveur ET client). AUCUN import de `app/lib/analytics/*`, du moteur
 * ni de la base → cloisonnement M2 trivial.
 *
 * Le texte v1 est une CONSTANTE SERVEUR. La route d'ingestion MATÉRIALISE, de façon idempotente, la ligne
 * `internaute_consentement_texte` correspondante à partir de CE catalogue (jamais du contenu envoyé par le client
 * → non-forgeable). Une nouvelle version = un ajout ici (version incrémentée), sans migration ni perte
 * d'historique (les preuves passées pointent l'ancienne version).
 */

/** Finalités de traitement (miroir du référentiel `internaute_finalite`, migration 023). */
export type CleFinalite = 'recontact_interne' | 'email_marketing' | 'retargeting_tiers';

export interface TexteConsentement {
  finalite: CleFinalite;
  /** Version croissante par finalité (référence de preuve). */
  version: number;
  /** Libellé de la CASE à cocher (l'acte de consentement lui-même). */
  libelleCase: string;
  /** Mention/texte affiché ET texte de preuve persisté (matérialisé dans `internaute_consentement_texte`). */
  contenu: string;
  /** Titre de la sous-section affichée dans le tunnel (facultatif). Absent → la case est rendue seule (sans titre). */
  titre?: string;
  /** Affiché dans le tunnel au lancement ? F1 (recontact) et F2 (email) = oui ; F3 (tiers) = non (activable sans refonte). */
  actifTunnel: boolean;
}

/**
 * Textes courants par finalité. F1 (recontact interne) = finalité « service sur mesure ». F2 (email marketing) =
 * accord d'envoi d'emails. Les deux sont affichés au tunnel. F3 (retargeting tiers) est présent (structure prête)
 * mais non affiché (`actifTunnel: false`) — la plus sensible, non activée à ce stade.
 */
export const TEXTES_CONSENTEMENT: readonly TexteConsentement[] = [
  {
    finalite: 'recontact_interne',
    version: 1,
    libelleCase: 'J’accepte qu’un spécialiste Sans Vis-à-Vis me recontacte au sujet de mon projet.',
    contenu:
      'En cochant cette case, vous acceptez d’être recontacté(e) par Sans Vis-à-Vis au sujet de votre projet ' +
      'immobilier. Aucune donnée n’est transmise à un tiers pour cette finalité. Vous pouvez retirer ce ' +
      'consentement à tout moment.',
    actifTunnel: true,
  },
  {
    finalite: 'email_marketing',
    version: 1,
    titre: 'Votre accord pour l’envoi de mails',
    libelleCase:
      'Je donne mon accord pour recevoir les mails de l’application sansvisavis.com et note qu’il n’est pas ' +
      'nécessaire de cocher cette case pour obtenir mon certificat.',
    contenu:
      'Vous acceptez de recevoir les communications de l’application sansvisavis.com par email. Vous pouvez vous ' +
      'désinscrire à tout moment.',
    actifTunnel: true,
  },
  {
    finalite: 'retargeting_tiers',
    version: 1,
    libelleCase: 'J’accepte le ciblage publicitaire sur les réseaux sociaux (transfert à des tiers).',
    contenu:
      'Transmission de vos coordonnées à des tiers (Meta/Google) pour du ciblage publicitaire. Finalité la plus ' +
      'sensible — non activée à ce stade.',
    actifTunnel: false,
  },
];

/** Finalité « service » (F1) : consentement au recontact téléphonique interne (recontactabilité — cf. `opposition_recontact`). */
export const FINALITE_SERVICE: CleFinalite = 'recontact_interne';

/** Texte courant d’une finalité (dernière version connue), ou `undefined`. */
export function texteCourant(finalite: CleFinalite): TexteConsentement | undefined {
  return TEXTES_CONSENTEMENT.filter((t) => t.finalite === finalite).sort((a, b) => b.version - a.version)[0];
}

/** Existe-t-il un texte connu pour ce couple (finalité, version) ? (garde anti-forge à l’ingestion). */
export function texteExiste(finalite: string, version: number): boolean {
  return TEXTES_CONSENTEMENT.some((t) => t.finalite === finalite && t.version === version);
}

/** Finalités AFFICHÉES dans le tunnel au lancement (F1 + F2 aujourd’hui ; F3 masquée). */
export function finalitesActivesTunnel(): TexteConsentement[] {
  return TEXTES_CONSENTEMENT.filter((t) => t.actifTunnel);
}
