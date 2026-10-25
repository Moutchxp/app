import { changementsCarte, type CarteApres } from '../gestion/traceFiche';
import { enCentimes, lignesConditions, verifierConditions, versEnvoiConditions, type ConditionsEntree, type LoyerMensuel, type SaisieConditions } from './conditionsEntree';
import { entretiensEnTexte } from './encartBien';
import {
  LIBELLE_CATEGORIE_PRIME, LIBELLE_MODE_APPORTEUR, LIBELLE_ORIGINE_CONTACT, LIBELLE_TYPE_ACTIVITE, verifierActivite,
  type CategoriePrime, type ModePrime, type SaisieActivite,
} from './suivi/suivi';

/**
 * ══ 🔴🔴 « DOSSIER DE LOCATION » — LE FORMULAIRE « NOUVEAU LOCATAIRE » ROUVERT EN MODIFICATION (Arno, 24/10/2026) ════════════════
 * Depuis une ligne de « Locations du mois » rattachée à un bail : les 4 blocs du formulaire « Nouveau locataire », pré-remplis avec
 * les données réelles, et modifiables là où l'outil sait MODIFIER (jamais créer en double) :
 *   ① les locataires du bail (leurs cartes : la fiche de l'annuaire) — les contacts du locataire sont montrés ;
 *   ② le bien loué et ses lots, la date d'entrée — montrés (un bail ne change ni de bien ni de date ici) ; « Caractéristiques du
 *     bien loué » ouvre la fiche du bien ;
 *   ③ les conditions d'entrée, le loyer et les sommes dues (une NOUVELLE version des conditions du bail, l'historique reste), et
 *     l'entretien à prévoir du bien ;
 *   ④ le suivi commercial : la MÊME ligne de suivi, mise à jour (jamais une seconde).
 * « Enregistrer les modifications » montre d'abord les SEULS champs modifiés, par bloc. Ce module est PUR : la lecture, la saisie,
 * et le calcul des changements (le même à l'écran pour le récapitulatif et au serveur pour le journal).
 */
export const ECRAN_DOSSIER = 'Dossier de location (Suivi du mois)' as const;

export interface CarteLocataireDossier {
  id: number; civilite: string | null; prenom: string | null; nom: string; qualite: string | null; adresse: string | null;
  codePostal: string | null; commune: string | null; note: string | null;
  contacts: { id: number; sorte: 'telephone' | 'email'; affichage: string; libelle: string | null }[];
}

/** La saisie du bloc 4, au format de l'écran (`SaisieSuivi` : les montants en texte, les taux en %). */
export type SuiviDossier = SaisieActivite & { categoriePrime: CategoriePrime | null };

export interface LectureDossier {
  activiteId: number; bailId: number; lotId: number;
  /** L'empreinte de tout ce qui est lu : une version différente à l'enregistrement = modifié par ailleurs (conflit). */
  version: string;
  titre: string;
  bien: { id: number; titre: string; famille: string | null };
  /** `chargesCopro` : « Paiement des charges » de chaque lot (migration 400 ; absent sans elle) — la présélection, Arno 25/10/2026. */
  lots: { id: number; libelle: string; chargesCopro?: 'agence' | 'proprietaire' | null }[];
  entree: string | null;
  locataires: CarteLocataireDossier[];
  /** Les contacts du locataire (garants, conjoint…) rattachés au bail : montrés, modifiables depuis leur fiche. */
  contacts: { id: number; libelle: string; qualite: string | null }[];
  /** Les conditions d'entrée du bail (la dernière version) ; `null` : aucune n'a été enregistrée (rien n'est inventé). */
  conditions: { occupationId: number; valeurs: ConditionsEntree; loyer: LoyerMensuel | null; lignesHonoraires: { mot: string; valeur: string }[] } | null;
  /** L'entretien à prévoir du BIEN (logement, local) ; `null` : sans objet (parking, cave) ou base d'avant la 379. */
  entretien: { aPrevoir: boolean | null; entretiens: { sorte: string; nom?: string | null; dateAnniversaire?: string | null }[] } | null;
  suivi: SuiviDossier;
}

export interface SaisieDossier {
  version: string;
  /** Les seuls champs modifiés de chaque carte de locataire modifiée. */
  locataires: { id: number; champs: CarteApres }[];
  conditions: SaisieConditions | null;
  entretien: { aPrevoir: boolean | null; entretiens: { sorte: string; nom?: string; dateAnniversaire: string }[] } | null;
  suivi: SuiviDossier;
}

export interface ChangementDossier { bloc: 1 | 3 | 4; champ: string; avant: string; apres: string }
export const TITRE_BLOC: Record<ChangementDossier['bloc'], string> = { 1: 'Le ou les locataires', 3: 'Conditions d’entrée et sommes dues', 4: 'Suivi commercial' };

/** Les noms à montrer pour un identifiant (négociateur, collègue, apporteur). */
export interface NomsDossier { negociateur: (id: number) => string; collegue: (id: number) => string; apporteur: (id: number) => string }

const vide = (x: string): string => (x === '' ? '(vide)' : x);
const euros = (x: number | null): string => (x === null ? '' : `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`.replace(/[  ]/g, ' '));
const pct = (x: number | null): string => (x === null ? '' : `${Number((x * 100).toPrecision(12)).toLocaleString('fr-FR', { maximumFractionDigits: 6 })} %`);
const ouiNon = (b: boolean): string => (b ? 'Oui' : 'Non');
const dateFr = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);
const MOT_PRIME: Record<ModePrime, string> = { regle: 'Règle de l’agence', personnalise: 'Personnalisé', aucune: 'Aucune' };

/** Le loyer saisi (texte) → centimes ; illisible → `undefined` (la vérification le refusera). PUR. */
export function loyerDeLaSaisieDossier(l: { principal: string; provisions: string }): LoyerMensuel | undefined {
  const p = enCentimes(l.principal);
  const c = enCentimes(l.provisions);
  if (p === undefined || c === undefined) return undefined;
  return { principal: p, provisions: c };
}

/** Les lignes par intitulé ; un intitulé répété (« Dépôt de garantie » : le choix, puis le montant dû) garde les deux. PUR. */
function parIntitule(l: readonly { mot: string; valeur: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of l) m.set(m.has(x.mot) ? `${x.mot} — montant` : x.mot, x.valeur);
  return m;
}

/**
 * Les SEULS champs modifiés, par bloc, « Champ : ancienne → nouvelle ». Les deux côtés passent par les MÊMES vérifications (les
 * mêmes normalisations) : une valeur identique écrite autrement n'est pas un changement. PUR.
 */
export function changementsDossier(lu: LectureDossier, s: SaisieDossier, noms: NomsDossier): ChangementDossier[] {
  const sortie: ChangementDossier[] = [];
  // ① Les locataires.
  for (const l of s.locataires) {
    const carte = lu.locataires.find((x) => x.id === l.id);
    if (carte === undefined) continue;
    const qui = [carte.nom, carte.prenom].filter((x) => x).join(' ');
    for (const c of changementsCarte(carte, l.champs)) sortie.push({ bloc: 1, champ: `${qui} — ${c.champ}`, avant: c.avant, apres: c.apres });
  }
  // ③ Les conditions d'entrée (lues comme sur la fiche : une ligne par information) et l'entretien du bien.
  if (lu.conditions !== null && s.conditions !== null) {
    const v = verifierConditions(versEnvoiConditions(s.conditions));
    const loyer = loyerDeLaSaisieDossier(s.conditions.loyer);
    if (v.ok && loyer !== undefined) {
      const avant = parIntitule(lignesConditions(lu.conditions.valeurs, null, lu.conditions.loyer));
      const apres = parIntitule(lignesConditions(v.valeurs, null, loyer));
      for (const mot of new Set([...avant.keys(), ...apres.keys()])) {
        const a = avant.get(mot) ?? '';
        const b = apres.get(mot) ?? '';
        if (a !== b) sortie.push({ bloc: 3, champ: mot, avant: vide(a), apres: vide(b) });
      }
    }
  }
  if (lu.entretien !== null && s.entretien !== null) {
    const a = lu.entretien.aPrevoir;
    const b = s.entretien.aPrevoir;
    if (a !== b) sortie.push({ bloc: 3, champ: 'Entretien à prévoir', avant: a === null ? '(vide)' : ouiNon(a), apres: b === null ? '(vide)' : ouiNon(b) });
    const ta = entretiensEnTexte(a === true ? lu.entretien.entretiens : []);
    const tb = entretiensEnTexte(b === true ? s.entretien.entretiens : []);
    if (ta !== tb) sortie.push({ bloc: 3, champ: 'Entretiens', avant: vide(ta), apres: vide(tb) });
  }
  // ④ Le suivi commercial : les deux côtés vérifiés de la même façon, puis comparés champ par champ.
  const va = verifierActivite(lu.suivi, { origineObligatoire: false });
  const vb = verifierActivite(s.suivi, { origineObligatoire: false });
  if (va.ok && vb.ok) {
    const a = va.valeurs;
    const b = vb.valeurs;
    const champ = (mot: string, x: string, y: string): void => { if (x !== y) sortie.push({ bloc: 4, champ: mot, avant: vide(x), apres: vide(y) }); };
    const nom = (f: (id: number) => string, id: number | null): string => (id === null ? '' : f(id));
    champ('Date de signature du bail', dateFr(a.dateSignature), dateFr(b.dateSignature));
    champ('Nature', LIBELLE_TYPE_ACTIVITE[a.type], LIBELLE_TYPE_ACTIVITE[b.type]);
    champ('Négociateur', nom(noms.negociateur, a.negociateurId), nom(noms.negociateur, b.negociateurId));
    champ('Relocation (portefeuille de gestion)', ouiNon(a.avecGestion), ouiNon(b.avecGestion));
    champ('Nouveau mandat de gestion signé (prime)', ouiNon(a.mandatGestion), ouiNon(b.mandatGestion));
    champ('Prime de gestion', a.primeMode === null ? '' : MOT_PRIME[a.primeMode], b.primeMode === null ? '' : MOT_PRIME[b.primeMode]);
    champ('Prime de gestion — montant', euros(a.primeMontant), euros(b.primeMontant));
    champ('Type de bien', lu.suivi.categoriePrime === null ? '' : LIBELLE_CATEGORIE_PRIME[lu.suivi.categoriePrime], s.suivi.categoriePrime === null ? '' : LIBELLE_CATEGORIE_PRIME[s.suivi.categoriePrime]);
    champ('Honoraires propriétaire HT', euros(a.honoProprietaireHt), euros(b.honoProprietaireHt));
    champ('Honoraires locataire HT', euros(a.honoLocataireHt), euros(b.honoLocataireHt));
    champ('Origine du contact', a.origineContact === null ? '' : LIBELLE_ORIGINE_CONTACT[a.origineContact], b.origineContact === null ? '' : LIBELLE_ORIGINE_CONTACT[b.origineContact]);
    champ('Origine personnalisée', a.origineContactPrecision ?? '', b.origineContactPrecision ?? '');
    champ('Collègue', nom(noms.collegue, a.collegueId), nom(noms.collegue, b.collegueId));
    champ('Apporteur', nom(noms.apporteur, a.apporteurId), nom(noms.apporteur, b.apporteurId));
    champ('Taux de l’apporteur', pct(a.apporteurTaux), pct(b.apporteurTaux));
    champ('Honoraires d’apporteur', euros(a.commissionApporteur), euros(b.commissionApporteur));
    champ('Commission d’apporteur', a.apporteurMode === null ? '' : LIBELLE_MODE_APPORTEUR[a.apporteurMode], b.apporteurMode === null ? '' : LIBELLE_MODE_APPORTEUR[b.apporteurMode]);
    champ('Taux de l’apporteur sur la gestion', pct(a.apporteurTauxGestion), pct(b.apporteurTauxGestion));
  }
  return sortie;
}

/** Le motif d'une saisie que le serveur refuserait (vérifiée AVANT tout envoi, et au serveur avant toute écriture). PUR. */
export function refusDossier(lu: LectureDossier, s: SaisieDossier,
  /** Le serveur : l'indice (423) et le paiement des charges (400) exigés quand la base les a, même si la saisie ne les porte pas. */
  exiger: { indice?: boolean; charges?: boolean } = {}): string | null {
  if (lu.conditions !== null && s.conditions !== null) {
    // 🔴 Arno (25/10/2026) — à l'ENREGISTREMENT, le dossier complet (loyer, dépôt, honoraires agence, indice, paiement des charges) ; un
    // dossier ancien incomplet s'ouvre et se lit toujours : seule cette vérification, au moment d'enregistrer, l'exige.
    const v = verifierConditions(versEnvoiConditions(s.conditions), { complet: true, ...exiger });
    if (!v.ok) return v.motif;
    if (loyerDeLaSaisieDossier(s.conditions.loyer) === undefined) return 'Loyer mensuel : un montant en euros, au centime (ex. 1 180,50).';
  }
  const v = verifierActivite(s.suivi, { origineObligatoire: true });
  return v.ok ? null : v.motif;
}

/** Le titre de la modale : « Dossier de location — <locataires> — <adresse du bien> ». PUR. */
export function titreDossier(locataires: readonly { nom: string; prenom: string | null }[], adresse: string): string {
  const noms = locataires.map((l) => [l.nom, l.prenom].filter((x) => x).join(' ')).join(', ');
  return `Dossier de location — ${noms || 'locataire inconnu'} — ${adresse || 'bien'}`;
}
