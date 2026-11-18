/**
 * ══ 🔴🔴 RÉGLAGE « COLLABORATEURS PRÉVENUS » — LES DESTINATAIRES DES MAILS INTERNES DE LA LOCATION (Arno, 18/11/2026). MODULE PUR. ══
 *
 * Arno : « Crée un seul réglage « collaborateurs prévenus », éditable sans code, qui remplace la règle des comptes pour les cinq
 * mails internes de la Location » — l'alerte préavis (individuelle et récapitulative), la copie du compte rendu de pré-visite, la
 * copie du mail « Refus / absence de pré-visite », le mail « Sortie enregistrée » et le mail interne du parcours préavis / sortie.
 * « Valeur par défaut : a.jorel@sansvisavis.com, jb.pons@sansvisavis.com, c.jullien@sansvisavis.com, gestion@criterimmo.fr. […] Tant
 * qu'elle n'est pas passée, ou si la liste est vide, la règle actuelle s'applique (repli sûr). Prévois un type, une validation
 * (adresses e-mail valides, pas de doublon) et un libellé lisible par un non-développeur, pour une future interface de réglages. »
 *
 * OÙ IL VIT : `gestion_config.collaborateurs_prevenus` (migration 493), une liste d'adresses séparées par des virgules — la forme
 * des autres listes de la configuration de la Gestion (`domaines_internes`, `types_pieces_acceptes`).
 *
 * 🔴 LA RÈGLE ACTUELLE, en repli : tous les comptes ACTIFS administrateurs ou ayant accès à la Gestion ou à la Location
 * (`destinatairesSortie`, sortieLocatairesRepo.ts). Elle s'applique quand la colonne n'existe pas, quand la liste est vide, ET
 * quand la liste enregistrée est INVALIDE (une adresse mal formée, un doublon) : une liste cassée ne doit jamais faire partir un
 * mail interne vers une adresse fausse, ni le faire disparaître.
 *
 * Module PUR (aucune requête) : lisible par une future page de réglages comme par le serveur, sans tirer la base.
 */

/** La description du réglage, pour une interface de réglages lisible par un non-développeur. */
export const REGLAGE_COLLABORATEURS_PREVENUS = {
  cle: 'collaborateurs_prevenus',
  table: 'gestion_config',
  colonne: 'collaborateurs_prevenus',
  type: 'liste_emails' as const,
  /** VIVE : éditable, elle agit sur les envois (distinction VIVE / VESTIGIALE / GARDE du pilotage sans code). */
  statut: 'vive' as const,
  libelle: 'Collaborateurs prévenus (mails internes de la Location)',
  aide: 'Les adresses qui reçoivent les mails internes de la Location : alertes « aucune pré-visite fixée », copies du compte rendu '
    + 'et du refus de pré-visite, mails de sortie de locataire. Une adresse par ligne ou séparées par des virgules. Laissée vide, '
    + 'ces mails partent à tous les comptes qui ont accès à la Gestion ou à la Location (comme avant).',
  defaut: ['a.jorel@sansvisavis.com', 'jb.pons@sansvisavis.com', 'c.jullien@sansvisavis.com', 'gestion@criterimmo.fr'] as readonly string[],
  /** Au-delà, ce n'est plus une liste de collaborateurs : refusé. */
  maximum: 30,
};

/** La même forme d'adresse que le reste des envois de la Location (`adressesUniques`, `ESSAI`). */
const FORMAT_EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export type ValidationCollaborateurs = { ok: true; adresses: string[] } | { ok: false; motif: string };

/** Découpe une saisie ou une valeur enregistrée (virgules, points-virgules, retours à la ligne) en adresses nettoyées. PUR. */
export function decouperCollaborateurs(brut: string | null | undefined): string[] {
  return (brut ?? '').split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter((x) => x !== '');
}

/**
 * LA VALIDATION, pour l'interface comme pour la lecture : chaque adresse valide, aucune en double, pas plus que le maximum.
 * Une liste VIDE est valide : elle veut dire « la règle des comptes » (le repli). PUR.
 */
export function validerCollaborateurs(brut: string | readonly string[] | null | undefined): ValidationCollaborateurs {
  const adresses = typeof brut === 'string' || brut === null || brut === undefined
    ? decouperCollaborateurs(brut) : brut.map((x) => x.trim().toLowerCase()).filter((x) => x !== '');
  const invalides = adresses.filter((a) => !FORMAT_EMAIL.test(a));
  if (invalides.length > 0) return { ok: false, motif: `Adresse e-mail invalide : ${invalides.join(', ')}.` };
  const vues = new Set<string>(); const doublons: string[] = [];
  for (const a of adresses) { if (vues.has(a) && !doublons.includes(a)) doublons.push(a); vues.add(a); }
  if (doublons.length > 0) return { ok: false, motif: `Adresse en double : ${doublons.join(', ')}.` };
  if (adresses.length > REGLAGE_COLLABORATEURS_PREVENUS.maximum) {
    return { ok: false, motif: `Pas plus de ${REGLAGE_COLLABORATEURS_PREVENUS.maximum} adresses.` };
  }
  return { ok: true, adresses };
}

/**
 * Ce que la valeur enregistrée donne pour un envoi : la liste à utiliser, ou `null` = appliquer la règle des comptes (colonne
 * absente, liste vide, liste invalide). PUR.
 */
export function collaborateursDuReglage(brut: string | null | undefined): string[] | null {
  const v = validerCollaborateurs(brut);
  return v.ok && v.adresses.length > 0 ? v.adresses : null;
}

/** La valeur à écrire en base pour une liste validée (la forme lue par `decouperCollaborateurs`). PUR. */
export function valeurEnregistree(adresses: readonly string[]): string {
  return adresses.join(', ');
}
