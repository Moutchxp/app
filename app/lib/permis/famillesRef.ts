/**
 * PART-2 (élargissement) — RÉFÉRENTIEL des familles de pièces suivies au diagnostic de complétude. Module PUR (aucune I/O). C'est la
 * SOURCE UNIQUE, pilotable : le catalogue vient de la table `permis_famille_ref` (cf. `famillesRefRepo.chargerFamillesRef`), avec un
 * REPLI EN DUR (`FAMILLES_REF_DEFAUT`) STRICTEMENT ÉGAL au comportement historique (4 familles) tant que la table est absente/vide.
 *
 * DEUX MODES DE DÉTECTION par famille :
 *   · `detecteurContenu` non nul (les 4 familles HISTORIQUES : masse/coupe/etage/cerfa) → la présence est lue sur le CLASSEMENT déjà
 *     mémorisé (par CONTENU des PDF, nom en appoint). Une absence est un « manquant » FIABLE (le contenu a été lu) — comportement ACTUEL.
 *   · `detecteurContenu` nul (familles NOUVELLES, PC1/PC4/PC5/PC6/arrêté/NGF) → présence détectée par le NOM (`motifsNom`). Comme le
 *     contenu de ces familles n'est pas lu, une absence n'est « manquant » QUE si le dossier a un NOMMAGE RÉGLEMENTAIRE AVÉRÉ (au moins
 *     une pièce dont le nom porte un code/mot suivi) ; sinon « indéterminé » — on ne fabrique JAMAIS un faux manquant (règle porteur).
 *
 * 🔴 DISTINCT de `FamillePlan` (planMasse.ts), qui reste le vocabulaire du sous-système tracé d'emprise / best-of (INCHANGÉ). Ici on
 *    manipule des CODES de famille (chaînes ouvertes, pilotées en base). Les 4 codes historiques COÏNCIDENT avec les valeurs de
 *    `FamillePlan` → le classement mémorisé (`famille: FamillePlan`) reste directement exploitable comme détecteur de contenu.
 */

/** État d'une famille au diagnostic. `indetermine` (« à vérifier ») ≠ `manquant` : il ne compte jamais comme manquante. */
export type EtatFamille = 'present' | 'manquant' | 'indetermine';

/** Détecteurs de CONTENU câblés (les 4 familles historiques). NULL = famille détectée par le nom seul. */
export type DetecteurContenu = 'masse' | 'coupe' | 'etage' | 'cerfa';

/** Une famille suivie du référentiel (table `permis_famille_ref`, ou repli EN DUR). */
export interface FamilleRef {
  code: string;                              // identifiant stable (cases à cocher, journal)
  libelle: string;                           // affichage court
  libelleCorps: string;                      // phrase EN CLAIR insérée dans le corps du mail de demande
  ordre: number;                             // tri d'affichage (et ordre dans le corps)
  motifsNom: string[];                       // détection PAR NOM (mots-clés / codes PCx)
  detecteurContenu: DetecteurContenu | null; // détecteur de CONTENU câblé, ou null (nom seul)
  actif: boolean;                            // proposée au diagnostic (les 4 historiques : activation pilotée en plus par config_veille)
}

/**
 * REPLI EN DUR = comportement HISTORIQUE À L'IDENTIQUE (mêmes 4 familles, même ordre masse→coupe→étage→cerfa, mêmes libellés et mêmes
 * phrases de corps qu'avant l'externalisation). Utilisé tant que `permis_famille_ref` est absente ou vide → aucune régression, et les
 * 6 familles nouvelles n'apparaissent qu'une fois la migration 223 appliquée. NE PAS y ajouter les nouvelles familles : ce repli EST
 * la garantie de non-régression (il doit rester le miroir exact de l'existant).
 */
export const FAMILLES_REF_DEFAUT: readonly FamilleRef[] = [
  { code: 'masse', libelle: 'Plan de masse', libelleCorps: 'le plan de masse (PC2)', ordre: 10, motifsNom: ['pc2', 'plan de masse'], detecteurContenu: 'masse', actif: true },
  { code: 'coupe', libelle: 'Plan de coupe', libelleCorps: 'le plan de coupe (PC3)', ordre: 20, motifsNom: ['pc3', 'plan en coupe', 'coupe'], detecteurContenu: 'coupe', actif: true },
  { code: 'etage', libelle: 'Plans d’étages', libelleCorps: 'les plans des différents niveaux (plans d’étages)', ordre: 30, motifsNom: ['plan de niveau', 'plans de niveaux', 'etage', 'etages'], detecteurContenu: 'etage', actif: true },
  { code: 'cerfa', libelle: 'Formulaire Cerfa', libelleCorps: 'le formulaire Cerfa de demande de permis de construire et son annexe si besoin pour obtenir la liste intégrale des parcelles cadastrales concernées par ce permis', ordre: 40, motifsNom: ['cerfa', '13409', '13824'], detecteurContenu: 'cerfa', actif: true },
];

/** Les 4 codes historiques → leur interrupteur d'activation `config_veille.famille_attendue_*` (activation INCHANGÉE pour eux). */
export interface ActivationConfig { familleAttendueCerfa: boolean; familleAttendueMasse: boolean; familleAttendueCoupe: boolean; familleAttendueEtage: boolean }

/** Normalise un nom/motif pour la détection : minuscules, accents retirés, séparateurs (_ - espaces multiples) réduits à un espace. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Un nom (déjà normalisé) matche-t-il UN motif ? « pcN » → frontière de mot (pc1 ne matche pas pc10) ; sinon sous-chaîne normalisée. PUR. */
function motifMatche(nomNorm: string, motif: string): boolean {
  const m = norm(motif);
  if (m === '') return false;
  const pc = m.match(/^pc\s*(\d+)$/); // code réglementaire « pcN » → frontière stricte
  if (pc) return new RegExp(`\\bpc\\s*${pc[1]}\\b`).test(nomNorm);
  return nomNorm.includes(m);
}

/** Le nom de fichier matche-t-il l'un des motifs de la famille (détection par nom) ? PUR. */
export function nomMatcheFamille(nomFichier: string, motifs: readonly string[]): boolean {
  const n = norm(nomFichier);
  return motifs.some((m) => motifMatche(n, m));
}

/** Forme minimale d'un classement mémorisé consommée ici (compatible `ClassementPiece`). */
export interface ClassementMinimal { nomFichier: string; famille: string | null }

/**
 * Le dossier a-t-il un NOMMAGE RÉGLEMENTAIRE AVÉRÉ ? = au moins une pièce dont le NOM matche un motif d'une famille suivie (code PCx,
 * « cerfa », etc.). Sert de garde-fou pour les familles détectées par nom seul : si le dossier ne nomme rien réglementairement (noms
 * opaques, scans), on n'ose PAS conclure « manquant » → « indéterminé ». PUR. (On ne se fie PAS à `famille` mémorisé : il peut venir du
 * CONTENU sans que le NOM soit réglementaire — or c'est bien la fiabilité du NOM qui rend une absence significative.)
 */
export function nommageReglementaireAvere(classements: readonly ClassementMinimal[], refs: readonly FamilleRef[]): boolean {
  return classements.some((c) => refs.some((f) => nomMatcheFamille(c.nomFichier, f.motifsNom)));
}

/** Une ligne de diagnostic évaluée : la famille (code + libellés + ordre du référentiel) + son état (3 valeurs) + les pièces qui l'attestent. */
export interface LigneCompletudeEval { code: string; libelle: string; libelleCorps: string; ordre: number; etat: EtatFamille; pieces: string[] }

/** Évalue UNE famille contre les classements mémorisés. `nommageAvere` déjà calculé (cf. `nommageReglementaireAvere`). PUR. */
export function evaluerFamille(f: FamilleRef, classements: readonly ClassementMinimal[], nommageAvere: boolean): LigneCompletudeEval {
  const pieces = f.detecteurContenu
    ? classements.filter((c) => c.famille === f.detecteurContenu).map((c) => c.nomFichier)         // 4 historiques : classement par CONTENU mémorisé
    : classements.filter((c) => nomMatcheFamille(c.nomFichier, f.motifsNom)).map((c) => c.nomFichier); // nouvelles : par le NOM
  const base = { code: f.code, libelle: f.libelle, libelleCorps: f.libelleCorps, ordre: f.ordre };
  if (pieces.length > 0) return { ...base, etat: 'present', pieces };
  // Absente : les familles à détecteur de CONTENU sont fiables (« manquant ») ; celles par nom seul ne le sont que si le dossier est
  //   nommé réglementairement, sinon « indéterminé » (jamais un faux manquant).
  const etat: EtatFamille = f.detecteurContenu ? 'manquant' : (nommageAvere ? 'manquant' : 'indetermine');
  return { ...base, etat, pieces: [] };
}

/** Évalue TOUTES les familles actives (déjà filtrées + triées par ordre attendu par l'appelant). PUR. */
export function evaluerCompletude(classements: readonly ClassementMinimal[], famillesActives: readonly FamilleRef[]): LigneCompletudeEval[] {
  const avere = nommageReglementaireAvere(classements, famillesActives);
  return [...famillesActives].sort((a, b) => a.ordre - b.ordre).map((f) => evaluerFamille(f, classements, avere));
}

/**
 * Familles ACTIVES (dans l'ordre), activation HYBRIDE (décision porteur) : les 4 familles historiques restent pilotées par les
 * interrupteurs existants `config_veille.famille_attendue_*` (réglages inchangés) ; les familles NOUVELLES par leur seul `actif` de
 * référentiel. Une famille inactive n'est jamais signalée manquante. PUR.
 */
export function famillesSuiviesActives(refs: readonly FamilleRef[], cfg: ActivationConfig): FamilleRef[] {
  const drapeauHistorique: Record<string, boolean> = {
    cerfa: cfg.familleAttendueCerfa, masse: cfg.familleAttendueMasse, coupe: cfg.familleAttendueCoupe, etage: cfg.familleAttendueEtage,
  };
  return refs
    .filter((f) => f.actif && (f.code in drapeauHistorique ? drapeauHistorique[f.code] : true))
    .sort((a, b) => a.ordre - b.ordre);
}

/** Phrase du corps de relance pour un code de famille (repli sur le libellé si le code est inconnu du référentiel). PUR. */
export function libelleCorpsPour(code: string, refs: readonly FamilleRef[]): string | null {
  return refs.find((f) => f.code === code)?.libelleCorps ?? null;
}
