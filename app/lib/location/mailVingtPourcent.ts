/**
 * ══ 🔴🔴 « ENVOYER UN MAIL » DEPUIS L'ÉCRAN « 20 % À RESTITUER » (Arno, 25/11/2026) — MODULE PUR. ═══════════════════════════════════════════════════
 *
 * Arno : « Règle maintenue : un mail par locataire (jamais deux locataires dans le même mail, jamais l'adresse d'un client visible d'un autre
 * client) » ; décision 2A du 25/11/2026 : un module par locataire, contrôle À L'ÉCRAN et AU SERVEUR (seulement pour les mails partis de cet écran).
 * La règle, ici, est la même pour les deux : un mail qui touche une adresse d'un locataire de la sortie
 *   · ne touche aucun AUTRE locataire de la sortie ;
 *   · et ne part qu'à ce locataire (ses propres adresses, aucune autre).
 * Les mails sans locataire (syndic, propriétaire(s), syndic avec propriétaire(s) en copie — modèles validés par Arno) ne sont pas concernés.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export const MOTIF_DEUX_LOCATAIRES = 'Un mail par locataire : ce message s’adresse à plusieurs locataires. Écrivez à chacun séparément.';
export const MOTIF_LOCATAIRE_PAS_SEUL = 'Un mail adressé à un locataire part à lui seul : retirez les autres destinataires (aucun client ne voit l’adresse d’un autre).';

const norme = (x: string): string => x.trim().toLowerCase();

/** Le refus (motif) ou `null`. `locataires` : les adresses de CHAQUE locataire de la sortie ; `destinataires` : À + Cc + Cci. PUR. */
export function refusUnLocataireParMail(locataires: readonly (readonly string[])[], destinataires: readonly string[]): string | null {
  const dest = [...new Set(destinataires.map(norme).filter((x) => x !== ''))];
  const touches = locataires.map((ad) => new Set(ad.map(norme).filter((x) => x !== ''))).filter((s) => dest.some((d) => s.has(d)));
  if (touches.length > 1) return MOTIF_DEUX_LOCATAIRES;
  if (touches.length === 1 && dest.some((d) => !touches[0].has(d))) return MOTIF_LOCATAIRE_PAS_SEUL;
  return null;
}

/** La marque qu'un mail est parti de l'écran « 20 % à restituer » (lue STRICTEMENT par le serveur : un entier positif). PUR. */
export function marqueVingtPourcent(x: unknown): { sortieId: number } | null {
  if (x === null || typeof x !== 'object') return null;
  const id = (x as { sortieId?: unknown }).sortieId;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? { sortieId: id } : null;
}

// ══ 🔴🔴 Arno (25/11/2026) — LES QUATRE MODÈLES (textes validés par Arno le 25/11/2026), au choix dans le module, modifiables avant envoi ══════════════
/**
 * a. « Syndic — date de la prochaine AGO » ; b. « Propriétaire — date de la prochaine AGO » ; c. « Syndic, propriétaire(s) en copie — … » (le modèle a,
 * le ou les propriétaires du bien automatiquement en copie) ; d. « Locataire — restitution du solde effectuée » (un module PAR LOCATAIRE : un mail
 * par locataire). Choisir un modèle sélectionne d'office les destinataires correspondants (modifiables). La formule d'appel et la signature sont
 * celles de nos autres mails (posées par le module). 🔴 (Arno, 25/11/2026) plus aucune phrase d'estimation de l'AGO ; a et c présentent le cabinet et le lot.
 */
export type CleModeleVingt = 'syndic' | 'proprietaire' | 'syndic_copie' | 'locataire';
export const MODELES_VINGT: readonly { cle: CleModeleVingt; libelle: string }[] = [
  { cle: 'syndic', libelle: 'Syndic — date de la prochaine AGO' },
  { cle: 'proprietaire', libelle: 'Propriétaire — date de la prochaine AGO' },
  { cle: 'syndic_copie', libelle: 'Syndic, propriétaire(s) en copie — date de la prochaine AGO' },
  { cle: 'locataire', libelle: 'Locataire — restitution du solde effectuée' },
];
export const A_COMPLETER = '[à compléter]';

export interface DonneesModeleVingt {
  /** la copropriété (son nom ou son adresse) */ copro: string;
  /** le logement (son adresse) */ logement: string;
  /** 🔴 (Arno, 25/11/2026) le numéro du lot principal (fiche du bien) ; `null` : non renseigné (« du lot n° … » n'est pas dit) */ numLot?: string | null;
  /** la clôture de l'exercice concerné (AAAA-MM-JJ) ou `null` */ exercice: string | null;
  /** l'AGO qui compte, ou `null` (🔴 25/11/2026 : plus aucune phrase d'estimation, elle n'est plus lue par les textes) */ ago: { date: string; statut: 'officielle' | 'projetee' } | null;
  dateSortie: string;
  /** « Prénom NOM » de chaque locataire de la sortie (jamais nommé au syndic) */ locataires: readonly string[];
  /** « M. Prénom NOM » de chaque propriétaire du bien (civilité de la fiche) */ proprietaires: readonly string[];
  /** la restitution ENREGISTRÉE (sinon les champs sont « [à compléter] ») */ restitution?: { date: string; montantRestitue: number; montantRetenuCharges: number | null } | null;
}

const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const euros = (n: number): string => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
const liste = (x: readonly string[]): string => (x.length <= 1 ? x.join('') : `${x.slice(0, -1).join(', ')} et ${x[x.length - 1]}`);
const exerciceDit = (e: string | null): string => (e === null ? 'concerné' : `clos le ${dateFr(e)}`);

/**
 * L'objet et le texte d'un modèle (sans formule d'appel ni signature : le module les pose). PUR.
 * 🔴🔴 Arno (25/11/2026) — 1. plus AUCUNE phrase d'estimation de l'AGO (a, b, c) ; 2. a et c : la présentation du cabinet, du lot (son numéro s'il est
 * sur la fiche), de l'adresse et du ou des clients copropriétaires (civilité Prénom NOM), le locataire jamais nommé ; 3. c : la ligne « … est en copie de
 * ce mail. » avant les remerciements (en plus de la copie automatique) ; 4. b : inchangé hors la phrase d'estimation.
 */
export function texteModeleVingt(cle: CleModeleVingt, d: DonneesModeleVingt): { objet: string; texte: string } {
  const p = d.proprietaires;
  const plusieurs = p.length > 1;
  const lot = d.numLot != null && d.numLot.trim() !== '' ? `du lot n° ${d.numLot.trim()}` : 'du lot';
  const clients = p.length === 0 ? 'de notre client' : plusieurs ? `de nos clients ${liste(p)}` : `de notre client ${p[0]}`;
  const demandeSyndic = [
    `Nous sommes le cabinet CRITERIMMO, gestionnaire ${lot} situé ${d.logement}, pour le compte ${clients}, ${plusieurs ? 'copropriétaires' : 'copropriétaire'} de la résidence ${d.copro} dont vous assurez le syndic de copropriété.`,
    `Pour finaliser la restitution du solde du dépôt de garantie de ${plusieurs ? 'leur' : 'son'} ancien locataire, nous avons besoin de la date de la prochaine assemblée générale ordinaire, qui approuvera les comptes de l’exercice ${exerciceDit(d.exercice)}.`,
    'Pourriez-vous nous indiquer la date retenue, ou nous transmettre la convocation dès qu’elle sera disponible ?',
  ];
  const fin = 'Nous vous remercions par avance et restons à votre disposition.';
  if (cle === 'syndic') return { objet: `Date de la prochaine AGO — ${d.copro}`, texte: [...demandeSyndic, fin].join('\n\n') };
  if (cle === 'syndic_copie') {
    const copie = p.length === 0 ? [] : [plusieurs ? `${liste(p)}, propriétaires, sont en copie de ce mail.` : `${p[0]}, propriétaire, est en copie de ce mail.`];
    return { objet: `Date de la prochaine AGO — ${d.copro}`, texte: [...demandeSyndic, ...copie, fin].join('\n\n') };
  }
  if (cle === 'proprietaire') {
    const coloc = d.locataires.length > 1;
    const qui = d.locataires.length === 0 ? 'votre locataire' : `${coloc ? 'vos locataires' : 'votre locataire'} ${liste(d.locataires)}`;
    return {
      objet: `Date de la prochaine AGO — ${d.logement}`,
      texte: [
        `Suite au départ de ${qui} le ${dateFr(d.dateSortie)}, nous avons conservé 20 % de ${coloc ? 'leur' : 'son'} dépôt de garantie, dans l’attente de l’approbation des comptes de l’exercice ${exerciceDit(d.exercice)} par l’assemblée générale de la copropriété ${d.copro}.`,
        'Si vous avez reçu la convocation, ou si vous en connaissez la date, pourriez-vous nous la communiquer ? Cela nous permettra de procéder à la régularisation et à la restitution du solde dans les délais.',
        'Merci par avance.',
      ].join('\n\n'),
    };
  }
  // d. le locataire : la restitution enregistrée, sinon les champs à compléter
  const r = d.restitution ?? null;
  const montant = r === null ? `${A_COMPLETER} €` : `${euros(r.montantRestitue)} €`;
  const retenu = r === null
    ? ` Un montant de ${A_COMPLETER} € a été conservé au titre de la régularisation des charges (phrase à supprimer s’il n’y a pas de retenue).`
    : r.montantRetenuCharges !== null ? ` Un montant de ${euros(r.montantRetenuCharges)} € a été conservé au titre de la régularisation des charges.` : '';
  return {
    objet: `Restitution du solde de votre dépôt de garantie — ${d.logement}`,
    texte: [
      `Lors de votre départ du logement situé ${d.logement} le ${dateFr(d.dateSortie)}, 20 % de votre dépôt de garantie avaient été conservés dans l’attente de l’arrêté des comptes de la copropriété.`,
      `Les comptes ayant été approuvés, nous vous confirmons la restitution du solde le ${r === null ? A_COMPLETER : dateFr(r.date)}, pour un montant de ${montant}.${retenu}`,
      'Nous restons à votre disposition pour toute question et vous souhaitons une bonne continuation.',
    ].join('\n\n'),
  };
}

/**
 * Les destinataires sélectionnés d'office par un modèle — UN ENVOI PAR ÉLÉMENT : a. le syndic ; b. le ou les propriétaires ; c. le syndic, le ou les
 * propriétaires en copie ; d. chaque locataire seul (un mail par locataire, même en colocation ; un locataire sans adresse : un module à compléter). PUR.
 */
export function destinatairesModeleVingt(cle: CleModeleVingt, s: { syndics: readonly string[]; proprietaires: readonly string[]; locataires: readonly (readonly string[])[] }):
  { a: string[]; cc: string[]; locataire: number | null }[] {
  if (cle === 'syndic') return [{ a: [...s.syndics], cc: [], locataire: null }];
  if (cle === 'proprietaire') return [{ a: [...s.proprietaires], cc: [], locataire: null }];
  if (cle === 'syndic_copie') return [{ a: [...s.syndics], cc: [...s.proprietaires], locataire: null }];
  const locs = s.locataires.length === 0 ? [[]] : s.locataires;
  return locs.map((ad, i) => ({ a: ad.length > 0 ? [ad[0]] : [], cc: [], locataire: s.locataires.length === 0 ? null : i }));
}
