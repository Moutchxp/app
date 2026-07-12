/**
 * Module INTERNAUTE — Catalogue SERVEUR des textes de consentement VERSIONNÉS (bloc B).
 *
 * Pur, sans dépendance (importable côté serveur ET client). AUCUN import de `app/lib/analytics/*`, du moteur
 * ni de la base → cloisonnement M2 trivial.
 *
 * ⚠️ Pas de migration de seed : le texte v1 est ici une CONSTANTE SERVEUR. La route d'ingestion MATÉRIALISE, de
 * façon idempotente, la ligne `internaute_consentement_texte` correspondante à partir de CE catalogue (jamais du
 * contenu envoyé par le client → non-forgeable). Une nouvelle version = un ajout ici (version incrémentée), sans
 * migration ni perte d'historique (les preuves passées pointent l'ancienne version).
 *
 * ⚠️⚠️ TEXTES PROVISOIRES — VALIDATION JURISTE / DPO REQUISE. Aucune valeur juridique en l'état : formulations,
 * base légale et articulation avec la loi démarchage (opt-in 11/08/2026) restent à trancher (cf.
 * docs/ETUDE_module_internaute_rgpd.md §7). Ne pas mettre en ligne sans validation.
 */

/** Finalités de traitement (miroir du référentiel `internaute_finalite`, migration 023). */
export type CleFinalite = 'recontact_interne' | 'email_marketing' | 'retargeting_tiers';

export interface TexteConsentement {
  finalite: CleFinalite;
  /** Version croissante par finalité (référence de preuve). */
  version: number;
  /** Libellé de la CASE à cocher (l'acte de consentement lui-même). */
  libelleCase: string;
  /** Mention/texte affiché — PLACEHOLDER, à valider juriste. */
  contenu: string;
  /** Affiché dans le tunnel au lancement ? F1 = oui ; F2/F3 = structurés mais non affichés (activables sans refonte). */
  actifTunnel: boolean;
}

const AVERTISSEMENT = 'TEXTE PROVISOIRE — VALIDATION JURISTE REQUISE.';

/**
 * Textes courants par finalité. F1 (recontact interne) est la finalité « service sur mesure » — active au
 * lancement. F2/F3 sont présents (structure prête) mais non affichés (`actifTunnel: false`) tant que le juriste
 * n'a pas validé leur base légale (F2 email) et le transfert tiers (F3 retargeting).
 */
export const TEXTES_CONSENTEMENT: readonly TexteConsentement[] = [
  {
    finalite: 'recontact_interne',
    version: 1,
    libelleCase: 'J’accepte qu’un spécialiste Sans Vis-à-Vis me recontacte au sujet de mon projet.',
    contenu:
      `${AVERTISSEMENT} En cochant cette case, vous acceptez d’être recontacté(e) par Sans Vis-à-Vis au sujet ` +
      'de votre projet immobilier. Aucune donnée n’est transmise à un tiers pour cette finalité. Vous pouvez ' +
      'retirer ce consentement à tout moment. La sollicitation téléphonique commerciale suppose votre consentement ' +
      'préalable (à confirmer selon la base légale retenue).',
    actifTunnel: true,
  },
  {
    finalite: 'email_marketing',
    version: 1,
    libelleCase: 'Je souhaite recevoir les communications de Sans Vis-à-Vis par email.',
    contenu: `${AVERTISSEMENT} Envoi d’informations et d’opportunités par email. Désinscription possible à tout moment.`,
    actifTunnel: false,
  },
  {
    finalite: 'retargeting_tiers',
    version: 1,
    libelleCase: 'J’accepte le ciblage publicitaire sur les réseaux sociaux (transfert à des tiers).',
    contenu:
      `${AVERTISSEMENT} Transmission de vos coordonnées à des tiers (Meta/Google) pour du ciblage publicitaire. ` +
      'Finalité la plus sensible — non activée à ce stade.',
    actifTunnel: false,
  },
];

/** Finalité « service » (F1) : porte de création d’un profil recontactable (cf. route d’ingestion). */
export const FINALITE_SERVICE: CleFinalite = 'recontact_interne';

/** Texte courant d’une finalité (dernière version connue), ou `undefined`. */
export function texteCourant(finalite: CleFinalite): TexteConsentement | undefined {
  return TEXTES_CONSENTEMENT.filter((t) => t.finalite === finalite).sort((a, b) => b.version - a.version)[0];
}

/** Existe-t-il un texte connu pour ce couple (finalité, version) ? (garde anti-forge à l’ingestion). */
export function texteExiste(finalite: string, version: number): boolean {
  return TEXTES_CONSENTEMENT.some((t) => t.finalite === finalite && t.version === version);
}

/** Finalités AFFICHÉES dans le tunnel au lancement (F1 seule pour l’instant). */
export function finalitesActivesTunnel(): TexteConsentement[] {
  return TEXTES_CONSENTEMENT.filter((t) => t.actifTunnel);
}
