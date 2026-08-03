/**
 * Constitution des demandes de communication (chantier S7) — logique PURE et testable. ⚠️ CE MODULE N'ENVOIE RIEN :
 * il compose des lots et le TEXTE d'une demande. Aucune I/O réseau, aucun e-mail.
 *
 * ⚠️ RÈGLE JURIDIQUE (à ne pas « améliorer ») : le droit d'accès (CRPA L311-1/L311-9) s'exerce SANS avoir à justifier
 * d'un motif. Le texte n'énonce donc AUCUN motif, aucune justification d'intérêt, aucune mention de l'usage prévu —
 * en exposer un AFFAIBLIRAIT la demande. Les libellés de pièces viennent de la config (`pieces_demandees`), pas du dur.
 */
import { type CanalContact, emailValide } from './mairieContact';

export interface ConfigDemandeur {
  raisonSociale: string;
  formeJuridique: string;
  siegeAdresse: string;
  representantNom: string;
  representantQualite: string;
  emailContact: string;
  telephone: string;
}

/** Profil du demandeur — deux identités possibles pour exercer le droit d'accès CRPA (cf. migration 055). */
export type ProfilDemandeur = 'entreprise' | 'personne';

/** Libellés d'affichage des profils (UI + journal + messages). */
export const ETIQUETTE_PROFIL: Record<ProfilDemandeur, string> = { entreprise: 'Société', personne: 'Personne physique' };

/** Normalise une valeur libre en profil sûr (défaut 'entreprise' si inconnue). */
export function profilValide(v: unknown): ProfilDemandeur {
  return v === 'personne' ? 'personne' : 'entreprise';
}

interface ControleChamp { cle: keyof ConfigDemandeur; libelle: string; min: number }

/**
 * Contrôles de PLAUSIBILITÉ de l'identité (hors telephone) requis pour qu'une demande quitte 'brouillon'. Au-delà du
 * simple non-vide (S7), on refuse aussi : e-mail au format invalide, longueur invraisemblable, et — pour les champs
 * marqués — une valeur ENTIÈREMENT EN CAPITALES (souvent un texte de substitution non renseigné). Les champs REQUIS
 * DIFFÈRENT par profil (S7e) :
 *  - « entreprise » : identité de société complète (inchangé depuis S7c) ;
 *  - « personne » : nom + adresse postale + e-mail SEULEMENT (raison sociale / forme juridique / qualité ni requis ni
 *    utilisés — voir `genererTexte`). Ce n'est PAS anonyme : le demandeur reste identifié (exigence CADA).
 * Chaque problème NOMME le champ ET la raison. Vide = identité plausible.
 */
const CONTROLES_ENTREPRISE: ControleChamp[] = [
  { cle: 'raisonSociale', libelle: 'raison sociale', min: 2 },
  { cle: 'formeJuridique', libelle: 'forme juridique', min: 2 },
  { cle: 'siegeAdresse', libelle: 'adresse du siège', min: 8 },
  { cle: 'representantNom', libelle: 'nom du représentant', min: 3 },
  { cle: 'representantQualite', libelle: 'qualité du représentant', min: 2 },
];
const CONTROLES_PERSONNE: ControleChamp[] = [
  { cle: 'representantNom', libelle: 'nom', min: 3 },
  { cle: 'siegeAdresse', libelle: 'adresse postale', min: 8 },
];
function controlesIdentite(profil: ProfilDemandeur): ControleChamp[] {
  return profil === 'personne' ? CONTROLES_PERSONNE : CONTROLES_ENTREPRISE;
}

/**
 * PRINCIPE (correctif S8a) : BLOQUER SUR LA CERTITUDE, AVERTIR SUR LE SOUPÇON. Un motif qui se terminerait par « ? » (un
 * doute) ne doit JAMAIS empêcher d'enregistrer — il deviendrait un avertissement affiché à côté du champ. Ici, tous les
 * refus sont des CERTITUDES (champ vide, longueur invraisemblable, chaîne-témoin de gabarit non rempli).
 *
 * ⚠️ On ne refuse PLUS une valeur « tout en capitales » : « CRITERIMMO » (raison sociale au RCS) ou « DUPONT » (nom de
 * famille) sont légitimes — la casse n'est pas un gabarit. On détecte à la place une LISTE FERMÉE de chaînes-témoins
 * (comparées sans casse ni accents) qu'un vrai renseignement ne contiendrait jamais.
 */
const GABARITS_TEMOINS = [
  'RAISON SOCIALE', 'FORME JURIDIQUE', 'ADRESSE COMPLETE', 'ADRESSE DU SIEGE', 'PRENOM NOM', 'NOM PRENOM',
  'QUALITE', 'EXACTE', 'A REMPLIR', 'XXX', 'LOREM',
] as const;
function sansCasseNiAccents(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
/** Chaîne-témoin de gabarit RECONNUE dans la valeur (insensible casse/accents, par SOUS-CHAÎNE), ou `null`. */
function gabaritReconnu(v: string): string | null {
  const n = sansCasseNiAccents(v);
  return GABARITS_TEMOINS.find((g) => n.includes(sansCasseNiAccents(g))) ?? null;
}

/**
 * Contrôle de PLAUSIBILITÉ d'UN champ (partagé identité S7c ↔ collaborateur S8a) : requis / longueur crédible / refus
 * d'un GABARIT non rempli (chaîne-témoin). Retourne le problème nommé (champ + raison) ou `null` si plausible. Aucun
 * refus fondé sur la seule casse (cf. principe ci-dessus).
 */
export function problemeChamp(valeur: string | null | undefined, libelle: string, min: number): string | null {
  const v = (valeur ?? '').trim();
  if (v === '') return `${libelle} : requis`;
  return problemeChampRenseigne(v, libelle, min);
}

/** Contrôles applicables SEULEMENT si le champ est renseigné (longueur crédible, gabarit) — factorisé. */
function problemeChampRenseigne(v: string, libelle: string, min: number): string | null {
  if (v.length < min) return `${libelle} : trop court pour être crédible`;
  const g = gabaritReconnu(v);
  if (g !== null) return `${libelle} : ressemble à un gabarit non rempli (« ${g} »)`;
  return null;
}

/**
 * Variante FACULTATIVE : un champ vide est ACCEPTÉ (null). Les autres contrôles (longueur, gabarit) ne s'appliquent QUE
 * s'il est renseigné. Pour les champs informatifs et non obligatoires (ex. la fonction d'un collaborateur — S8a).
 */
export function problemeChampFacultatif(valeur: string | null | undefined, libelle: string, min: number): string | null {
  const v = (valeur ?? '').trim();
  if (v === '') return null;
  return problemeChampRenseigne(v, libelle, min);
}

/** Problème de plausibilité d'un e-mail (partagé) : requis + format. `libelle` nomme le champ. */
export function problemeEmail(valeur: string | null | undefined, libelle: string): string | null {
  const v = (valeur ?? '').trim();
  if (v === '') return `${libelle} : requis`;
  if (!emailValide(v)) return `${libelle} : format invalide`;
  return null;
}

/** Problèmes d'identité (champ + raison) pour le profil donné ; vide si plausible. Défaut 'entreprise' (compat S7c/S7d). */
export function problemesIdentite(c: ConfigDemandeur, profil: ProfilDemandeur = 'entreprise'): string[] {
  const p: string[] = [];
  for (const ctl of controlesIdentite(profil)) {
    const e = problemeChamp(c[ctl.cle], ctl.libelle, ctl.min);
    if (e) p.push(e);
  }
  const e = problemeEmail(c.emailContact, 'e-mail de contact');
  if (e) p.push(e);
  return p;
}

// ── Pièces demandées (libellés depuis la config, jamais en dur) ──────────────
export interface Piece { code: string; description: string }
/** Descriptions RÉGLEMENTAIRES connues (le CHOIX des pièces vient de `pieces_demandees` ; ici seulement leur libellé). */
const LIBELLES_PIECES: Record<string, string> = {
  PC2: 'plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme',
  PC3: 'plan en coupe du terrain et de la construction',
};
export function piecesDepuisConfig(piecesDemandees: string): Piece[] {
  return piecesDemandees.split(',').map((s) => s.trim()).filter((s) => s !== '')
    .map((code) => ({ code, description: LIBELLES_PIECES[code] ?? '' }));
}

// ── Constitution des lots (pure) ─────────────────────────────────────────────
export interface CandidatDossier {
  dossierId: number;
  codeInsee: string;
  communeNom: string | null;
  canal: CanalContact | null;
  numDau: string;
  dateReelleAutorisation: string | null;
  adresse: string;
  codePostal: string | null;
  cadastre: string[];
  etatDau: string | null;               // S12 : 2=Autorisé 4=Annulé 5=Commencé 6=Terminé (null = jamais revu → proposable)
  absentDuDernierMillesime: boolean;    // S12 : dossier RÉELLEMENT retiré du fichier Sitadel (état futur inconnu)
  arbitragePrada?: boolean;             // S14d : PRADA au courriel non vide mais contact 'confirme' conservé → à arbitrer
  destOrigine?: 'mairie_contact' | 'prada'; // S14e : origine du destinataire résolu (affichage)
  destNom?: string | null;              // S14e : nom de la PRADA quand origine = 'prada'
}
export interface HistoriqueDemandes {
  /** dossier_id déjà rattachés à une demande NON abandonnée → jamais reproposés. */
  dejaRattaches: ReadonlySet<number>;
  /** nombre de demandes déjà créées CE MOIS-CI, par code_insee (plafond mensuel). */
  demandesCeMoisParCommune: ReadonlyMap<string, number>;
}
export interface ParamsLot {
  dossiersParDemande: number;
  demandesParCommuneParMois: number;
  /** Date d'autorisation minimale ('AAAA-MM-JJ', = aujourd'hui − anciennete_max). `null` = pas de borne (jamais en prod). */
  dateMin: string | null;
}
export interface Lot {
  codeInsee: string; communeNom: string; canal: CanalContact; dossiers: CandidatDossier[];
  destOrigine?: 'mairie_contact' | 'prada'; // S14e : origine du destinataire résolu du lot (affichage)
  destNom?: string | null;
}

/**
 * Propose des lots à partir de candidats DÉJÀ ORDONNÉS par priorité (cf. priorite.ts — on ne réordonne pas ici).
 * Exclut : dossiers HORS FENÊTRE d'ancienneté (date < `dateMin`) ou SANS DATE d'autorisation (pertinence non jugeable —
 * la cible d'une demande est un bâtiment que le LiDAR ne voit pas encore ; au-delà, la hauteur est déjà mesurée) ;
 * dossiers déjà rattachés ; communes en canal 'inconnu'/absent ou orphelines (communeNom null). Groupe par commune,
 * ≤ `dossiersParDemande` par demande, au plus `quota` demandes/commune (= plafond mensuel − demandes du mois). PURE.
 */
export function proposerLots(candidats: CandidatDossier[], params: ParamsLot, hist: HistoriqueDemandes): Lot[] {
  const parCommune = new Map<string, CandidatDossier[]>();
  for (const d of candidats) {
    // ── Exclusions FERMES d'état (S12) ──────────────────────────────────────────
    // ⚠️ SEUL l'état 4 (Annulé) exclut : demander les plans d'un permis annulé est un courrier perdu. Les états 5
    // (Commencé) et 6 (Terminé) NE SONT JAMAIS exclus — le bâtiment sort de terre ou existe, c'est précisément sa
    // hauteur qu'on cherche : ce sont des CONFIRMATIONS POSITIVES, pas des prérequis. L'ABSENCE d'état 5/6 (dossier
    // encore autorisé, ou etat_dau null car jamais revu) n'exclut donc rien (sinon on ignorerait 94 % du gisement récent).
    if (d.etatDau === '4') continue;                                 // annulé → jamais de courrier
    if (d.absentDuDernierMillesime) continue;                        // retiré du fichier Sitadel → état futur inconnu
    if (d.dateReelleAutorisation === null) continue;                 // sans date → pertinence non jugeable → exclu
    if (params.dateMin !== null && d.dateReelleAutorisation < params.dateMin) continue; // trop ancien → déjà mesuré au LiDAR
    if (hist.dejaRattaches.has(d.dossierId)) continue;               // déjà demandé
    if (d.communeNom === null || d.canal === null || d.canal === 'inconnu') continue; // non adressable
    (parCommune.get(d.codeInsee) ?? parCommune.set(d.codeInsee, []).get(d.codeInsee)!).push(d);
  }
  const lots: Lot[] = [];
  for (const [code, dossiers] of parCommune) {
    const quota = Math.max(0, params.demandesParCommuneParMois - (hist.demandesCeMoisParCommune.get(code) ?? 0));
    if (quota <= 0) continue;
    const commune = dossiers[0].communeNom!;
    const canal = dossiers[0].canal!;
    const destOrigine = dossiers[0].destOrigine;   // S14e : origine résolue de la commune (identique pour tous ses dossiers)
    const destNom = dossiers[0].destNom;
    for (let i = 0, faits = 0; i < dossiers.length && faits < quota; i += params.dossiersParDemande, faits += 1) {
      lots.push({ codeInsee: code, communeNom: commune, canal, destOrigine, destNom, dossiers: dossiers.slice(i, i + params.dossiersParDemande) });
    }
  }
  return lots;
}

// ── Référence + texte ────────────────────────────────────────────────────────
/** Formate SVAV-DEM-AAAA-NNNNNN (6 chiffres). */
export function formaterReferenceDemande(annee: number, n: number): string {
  return `SVAV-DEM-${annee}-${String(n).padStart(6, '0')}`;
}

// ── Aides d'INTERFACE (pures, S7b) ───────────────────────────────────────────
/** Ancre/cible du détail d'une demande — NON VIDE pour un id réel (garde contre un lien mort/vide). */
export function ancreDetail(id: number): string {
  return Number.isInteger(id) && id > 0 ? `demande-${id}` : '';
}

/** Décision de transition d'un LOT : passer 'prete' exige une identité plausible (sinon champs+raisons → aucune écriture). */
export function peutPasserLot(statut: 'prete' | 'abandonnee', config: ConfigDemandeur): { ok: boolean; champs: string[] } {
  if (statut === 'prete') { const champs = problemesIdentite(config); return { ok: champs.length === 0, champs }; }
  return { ok: true, champs: [] };
}

/** Compteurs expliquant l'absence de lots (mesurés, jamais figés). */
export interface DiagnosticProposition {
  candidatsExamines: number;
  dossiersAnnules: number;      // S12 : etat_dau = 4
  dossiersAbsents: number;      // S12 : retirés du fichier Sitadel
  dossiersHorsFenetre: number;
  dossiersDejaRattaches: number;
  communesSansCanal: number;
  communesPlafondMensuel: number;
  /** S14d : communes où une PRADA au courriel non vide existe mais le contact 'confirme' est conservé → arbitrage à
   *  rendre (jamais de bascule silencieuse). Optionnel : absent = aucun arbitrage (compat des littéraux existants). */
  arbitragesPrada?: string[];
}

/**
 * Message expliquant POURQUOI 0 lot, à partir des compteurs RÉELS (jamais un texte générique). '' si des lots existent.
 */
export function expliquerProposition(nbLots: number, d: DiagnosticProposition): string {
  if (nbLots > 0) return '';
  const raisons: string[] = [];
  if (d.dossiersAnnules > 0) raisons.push(`${d.dossiersAnnules} dossier(s) annulé(s)`);
  if (d.dossiersAbsents > 0) raisons.push(`${d.dossiersAbsents} dossier(s) absent(s) du dernier millésime`);
  if (d.dossiersHorsFenetre > 0) raisons.push(`${d.dossiersHorsFenetre} dossier(s) hors fenêtre d'ancienneté (déjà mesurés au LiDAR) ou sans date`);
  if (d.dossiersDejaRattaches > 0) raisons.push(`${d.dossiersDejaRattaches} dossier(s) déjà rattaché(s) à une demande`);
  if (d.communesPlafondMensuel > 0) raisons.push(`plafond mensuel atteint pour ${d.communesPlafondMensuel} commune(s)`);
  if (d.communesSansCanal > 0) raisons.push(`${d.communesSansCanal} commune(s) sans canal de contact connu`);
  const base = `Aucun lot à proposer sur ${d.candidatsExamines} dossier(s) examiné(s) en tête de classement`;
  return raisons.length ? `${base} : ${raisons.join(' ; ')}.` : `${base}.`;
}

/**
 * Décompte CHIFFRÉ du filtrage, TOUJOURS affichable (que des lots existent ou non) — jamais un texte figé. Rend lisible
 * depuis l'écran l'effet des réglages, notamment `anciennete_max_demande_annees` (dossiers écartés « hors fenêtre »).
 */
export function resumeDiagnostic(d: DiagnosticProposition): string {
  return `Sur ${d.candidatsExamines} dossier(s) examiné(s) en tête de classement : `
    + `${d.dossiersAnnules} annulé(s) · `
    + `${d.dossiersAbsents} absent(s) du dernier millésime · `
    + `${d.dossiersHorsFenetre} hors fenêtre d'ancienneté (déjà mesurés au LiDAR) ou sans date · `
    + `${d.dossiersDejaRattaches} déjà rattaché(s) · `
    + `${d.communesSansCanal} commune(s) sans canal · `
    + `${d.communesPlafondMensuel} commune(s) au plafond mensuel.`;
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Date d'autorisation en toutes lettres : '2017-03-14' → « 14 mars 2017 ». `null`/invalide → « date inconnue »/valeur brute. */
export function dateEnFrancais(iso: string | null): string {
  if (!iso) return 'date inconnue';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mois = Number(m[2]) - 1;
  if (mois < 0 || mois > 11) return iso;
  return `${Number(m[3])} ${MOIS_FR[mois]} ${m[1]}`;
}

/** Signataire alternatif d'un courrier « entreprise » : un COLLABORATEUR (S8a) qui signe au nom de la société. */
export interface Signataire { nom: string; prenom: string; fonction: string; email: string }

/**
 * Applique un SIGNATAIRE collaborateur à l'identité de société : le représentant devient le collaborateur (prénom nom,
 * fonction) et l'adresse de réponse son e-mail — MAIS la raison sociale, la forme juridique et le siège restent CEUX DE
 * LA SOCIÉTÉ (config_demandeur). ⚠️ MOTIF : l'équipe se répartit la charge, elle ne se présente jamais comme des citoyens
 * indépendants → un courrier signé par un collaborateur porte TOUJOURS la raison sociale (invariant verrouillé par test).
 * `null` → config inchangée (repli figé, comportement historique). Pur.
 */
export function configAvecSignataire(config: ConfigDemandeur, s: Signataire | null): ConfigDemandeur {
  if (s === null) return config;
  return {
    ...config,
    representantNom: `${s.prenom.trim()} ${s.nom.trim()}`.trim(),
    representantQualite: s.fonction.trim(),
    emailContact: s.email.trim(),
  };
}

export interface TexteDemande { objet: string; corps: string }

/**
 * Génère l'objet + le corps d'une demande selon la trame CRPA imposée, en substituant les variables. AUCUN motif ni
 * justification, et AUCUNE date-calendrier dans le corps (la date est apposée à l'ENVOI — chantier ultérieur — car
 * c'est elle qui fait courir le délai de refus tacite ; une date figée à la création serait fausse). Les pièces
 * proviennent de la config. `profil` sélectionne le modèle : 'entreprise' (identité de société, INCHANGÉ depuis S7c)
 * ou 'personne' (en-tête Nom/adresse/e-mail, 1re personne, aucune société/qualité/marque).
 */
export function genererTexte(
  lot: Lot, config: ConfigDemandeur, reference: string, pieces: Piece[], profil: ProfilDemandeur = 'entreprise',
): TexteDemande {
  const n = lot.dossiers.length;

  const lignesPieces = pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`).join('\n');
  const lignesDossiers = lot.dossiers.map((d) => {
    // Commune + code postal, en plus de l'adresse. ⚠️ l'adresse (libellé de voie tronqué à 26 c par Sitadel) est
    // transmise TELLE QUELLE — on ajoute seulement les autres éléments d'identification autour.
    const villeCP = [d.codePostal, d.communeNom].filter((x) => x !== null && x.trim() !== '').map((x) => x!.trim()).join(' ');
    const adresse = d.adresse.trim();
    const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
    const segments = [d.numDau, `autorisé le ${dateEnFrancais(d.dateReelleAutorisation)}`];
    if (adresse !== '') {
      segments.push([adresse, villeCP].filter((x) => x !== '').join(', '));
      if (cad) segments.push(cad);
    } else {
      // Pas d'adresse : la ligne s'appuie explicitement sur les parcelles (+ commune/CP), sans vide ni tiret orphelin.
      const secours = [villeCP, cad].filter((x) => x !== '').join(', ');
      if (secours) segments.push(secours);
    }
    return segments.join(' — ');
  }).join('\n');

  if (profil === 'personne') {
    // ⚠️ DISCRÉTION (S7e correctif) : objet GÉNÉRIQUE et banal, SANS référence ni aucune chaîne dérivée de la marque
    // (« SVAV », « Sans Vis-à-Vis »…). La référence sérialisée SVAV-DEM-… trahirait un traitement de masse et
    // l'identité du système — ce que le profil « personne » existe justement pour éviter. Le suivi reste INTERNE
    // (demande.reference inchangée en base / admin / journal). En-tête = Nom / adresse postale / e-mail uniquement,
    // 1re personne, AUCUNE société, qualité ni marque. Signature = le seul nom.
    const objet = 'Demande de communication de documents administratifs';
    const enTete = [config.representantNom, config.siegeAdresse, config.emailContact]
      .map((x) => x.trim()).filter((x) => x !== '').join('\n');
    const corps = [
      enTete,
      '',
      'Madame, Monsieur,',
      '',
      'En application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration, je demande communication, par voie électronique, des pièces suivantes pour chacun des dossiers listés ci-dessous :',
      lignesPieces,
      '',
      'Dossiers concernés :',
      lignesDossiers,
      '',
      'Je vous remercie de bien vouloir m’adresser ces documents à l’adresse électronique figurant en tête de la présente.',
      '',
      'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
      '',
      config.representantNom.trim(),
    ].join('\n');
    return { objet, corps };
  }

  const objet = `Demande de communication de documents administratifs — ${lot.communeNom} — ${n} dossier(s) — réf. ${reference}`;
  const tel = config.telephone.trim() !== '' ? `, téléphone ${config.telephone.trim()}` : '';
  const corps = [
    'Madame, Monsieur,',
    '',
    'En application des articles L311-1 et L311-9 3° du code des relations entre le public et l’administration, je vous demande communication, par voie électronique, des pièces suivantes pour chacun des dossiers listés ci-dessous :',
    '',
    lignesPieces,
    '',
    'Dossiers concernés :',
    lignesDossiers,
    '',
    // La qualité (fonction du signataire) est FACULTATIVE (S8a) : si vide, on l'omet SANS virgule orpheline ni double
    // espace. Non vide → « , qualité » exactement comme avant (instantané figé préservé pour l'identité société).
    `${config.raisonSociale}, ${config.formeJuridique}, dont le siège est ${config.siegeAdresse}, représentée par ${config.representantNom}${config.representantQualite.trim() !== '' ? `, ${config.representantQualite}` : ''}.`,
    `Adresse de réponse : ${config.emailContact}${tel}`,
    '',
    `Je vous remercie de bien vouloir rappeler la référence ${reference} dans votre réponse.`,
    '',
    'Je vous prie d’agréer, Madame, Monsieur, l’expression de ma considération distinguée.',
  ].join('\n');

  return { objet, corps };
}
