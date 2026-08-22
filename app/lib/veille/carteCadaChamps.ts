/**
 * CADA lot A — COMPOSITION PURE des champs du formulaire de saisine CADA (« Particulier : Demande d'Avis »), un champ = un
 * bouton « Copier ». Aucune I/O, aucun import de pg. La carte suit la structure du FORMULAIRE (personne physique + « Pour le
 * compte de »), PAS celle de notre lettre : le formulaire n'a pas de mode « personne morale ».
 *
 * ⚠️ AUCUNE donnée inventée : un champ dont la donnée manque est renvoyé `disponible:false` avec une valeur vide — la carte
 * invite alors à saisir à la main plutôt que d'imprimer une valeur fausse (même règle que copieDemandePdf).
 *
 * Le champ 15 (documents) réutilise la MÊME désignation réglementaire (PC2/PC3, R.431-9) et le MÊME détail par dossier que le
 * corps de la saisine (saisineCada.ts) : c'est ce détail qui rend la demande difficile à écarter.
 */
import { dateEnFrancais, type CandidatDossier, type Piece } from '../sitadel/demande';

/** Clés STABLES des champs (servent d'ancre à la trace de copie — ne jamais renommer sans migration). Ordre = ordre du formulaire. */
export type CleChampCada =
  | 'civilite' | 'prenom' | 'nom' | 'courriel' | 'pour_compte' | 'adresse' | 'code_postal' | 'localite' | 'pays'
  | 'admin_nom' | 'admin_adresse' | 'admin_code_postal' | 'admin_localite'
  | 'objet_porte' | 'documents' | 'date_demande' | 'observations';

export interface ChampCada {
  cle: CleChampCada;
  libelle: string;      // intitulé du champ, tel qu'affiché à côté du bouton
  valeur: string;       // valeur à copier (vide si indisponible)
  disponible: boolean;  // false → donnée absente : à saisir à la main (jamais inventée)
}

/** Données NÉCESSAIRES à la composition (déjà chargées côté serveur ; ce module ne lit rien). */
export interface EntreeCarteCada {
  // Identité du profil demandeur (entreprise) — déclarée en personne physique + « pour le compte de ».
  representantNom: string;      // « Prénom NOM » (ex. « Arnaud JOREL »)
  representantQualite: string;  // ex. « Gérant »
  emailContact: string;
  raisonSociale: string;
  formeJuridique: string;       // ex. « sarl » → affichée « SARL »
  siegeAdresse: string;         // ex. « 191 Avenue Charles de Gaulle 92200 Neuilly-sur-Seine »
  // Administration concernée (la mairie).
  communeNom: string;
  destNom: string | null;            // nom figé de l'administration (souvent vide → composé « Mairie de … »)
  mairieAdressePostale: string | null; // adresse postale de la mairie si connue (souvent absente)
  // Objet de la demande.
  pieces: Piece[];              // PC2, PC3 (avec leur désignation R.431-9)
  dossiersDus: CandidatDossier[];
  envoyeeLe: Date;              // envoi RÉEL de la demande initiale
  refusTaciteLe: Date;          // naissance du refus tacite (fenetreCada)
}

const propre = (s: string | null | undefined): string => (s ?? '').trim();

/** jj/mm/aaaa (Europe/Paris est sans effet sur une date seule ; on lit la date UTC comme partout — cohérent avec echeanceDe). */
function jjmmaaaa(d: Date): string {
  const iso = d.toISOString().slice(0, 10); // AAAA-MM-JJ
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/** Prénom / NOM depuis « Prénom NOM » : premier mot = prénom, le reste = nom (convention française). */
export function decouperNom(nomComplet: string): { prenom: string; nom: string } {
  const parts = propre(nomComplet).split(/\s+/).filter((x) => x !== '');
  if (parts.length === 0) return { prenom: '', nom: '' };
  if (parts.length === 1) return { prenom: '', nom: parts[0] };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

/** Découpe une adresse française « voie … CP localité » en ses trois parties par le code postal (5 chiffres). Sans CP → tout en voie. */
export function decouperAdresse(adresse: string): { voie: string; codePostal: string; localite: string } {
  const s = propre(adresse);
  const m = /^(.*?)[\s,]*(\d{5})\s+(.*)$/.exec(s);
  if (!m) return { voie: s, codePostal: '', localite: '' };
  return { voie: propre(m[1]), codePostal: m[2], localite: propre(m[3]) };
}

/** Élision « de / d' » selon l'initiale du nom (voyelle/h muet → d'). */
function avecElision(prefixe: string, mot: string): string {
  const c = propre(mot);
  if (c === '') return prefixe;
  return /^[aeiouyàâäéèêëîïôöûüh]/i.test(c) ? `${prefixe} d’${c}` : `${prefixe} de ${c}`;
}
/** « Mairie de / d' … » (nom d'administration composé quand dest_nom est absent). */
function nomMairie(communeNom: string): string {
  return propre(communeNom) === '' ? 'Mairie' : avecElision('Mairie', communeNom);
}

/** Détail d'UN dossier (miroir de saisineCada.ligneDossier) : n° — autorisé le … — lieu — parcelle(s). */
export function ligneDossierCada(d: CandidatDossier): string {
  const villeCP = [d.codePostal, d.communeNom].map((x) => propre(x)).filter((x) => x !== '').join(' ');
  const lieu = [propre(d.adresse), villeCP].filter((x) => x !== '').join(', ');
  const cad = d.cadastre.length ? `parcelle(s) ${d.cadastre.join(', ')}` : '';
  const autorise = propre(d.dateReelleAutorisation) !== '' ? `autorisé le ${dateEnFrancais(d.dateReelleAutorisation!)}` : '';
  return [d.numDau, autorise, lieu, cad].filter((x) => x && propre(x) !== '').join(' — ');
}

/** Champ 14 — « Votre demande porte sur » : UNE ligne courte et précise. */
export function objetPorteSur(e: EntreeCarteCada): string {
  const codes = e.pieces.map((p) => p.code).filter((c) => c.trim() !== '').join(', ');
  const pieces = codes !== '' ? ` (pièces ${codes})` : '';
  return `Communication de documents administratifs d’urbanisme${pieces} relatifs à un permis de construire — ${avecElision('commune', e.communeNom)}`;
}

/** Champ 15 — « Document(s) objet de la saisine » : désignation réglementaire des pièces + détail par dossier dû. */
export function documentsObjet(e: EntreeCarteCada): string {
  const lignesPieces = e.pieces.map((p) => `— la pièce ${p.code}${p.description ? `, ${p.description}` : ''} ;`).join('\n');
  const lignesDossiers = e.dossiersDus.map(ligneDossierCada).join('\n');
  return [
    'Pièces demandées, pour chacun des dossiers ci-dessous :',
    lignesPieces,
    '',
    'Dossiers concernés :',
    lignesDossiers,
  ].join('\n');
}

/** Champ 17 — « Observations » : qualité du signataire, compte de la société, date du refus tacite, absence de réponse. */
export function observations(e: EntreeCarteCada): string {
  const qualite = propre(e.representantQualite);
  const enQualite = qualite !== '' ? `, en qualité de ${qualite.toLowerCase()},` : '';
  const societe = [propre(e.raisonSociale), propre(e.formeJuridique).toUpperCase()].filter((x) => x !== '');
  const nomSociete = societe.length === 2 ? `${societe[0]} (${societe[1]})` : (societe[0] ?? '');
  return [
    `Demande formée par ${propre(e.representantNom)}${enQualite} pour le compte de la société ${nomSociete}.`,
    `La demande de communication a été adressée à la commune le ${jjmmaaaa(e.envoyeeLe)} et est restée sans réponse.`,
    `Le délai d’un mois étant écoulé, une décision implicite de refus est née le ${dateEnFrancais(e.refusTaciteLe.toISOString().slice(0, 10))} (article R. 311-12 du code des relations entre le public et l’administration). Aucune réponse n’a été reçue à ce jour.`,
  ].join(' ');
}

/**
 * Compose les 17 champs, DANS L'ORDRE DU FORMULAIRE. Un champ sans donnée fiable → `disponible:false` (valeur vide).
 * L'adresse de la société est découpée depuis `siegeAdresse` ; l'adresse de la mairie depuis `mairieAdressePostale`
 * (souvent absente → 11/12 indisponibles ; 13 retombe sur la commune, fait factuel).
 */
export function champsCarteCada(e: EntreeCarteCada): ChampCada[] {
  const { prenom, nom } = decouperNom(e.representantNom);
  const siege = decouperAdresse(e.siegeAdresse);
  const mairie = decouperAdresse(propre(e.mairieAdressePostale));
  const societe = [propre(e.raisonSociale), propre(e.formeJuridique).toUpperCase()].filter((x) => x !== '');
  const pourCompte = societe.length === 2 ? `${societe[0]} (${societe[1]})` : (societe[0] ?? '');
  const adminNom = propre(e.destNom) !== '' ? propre(e.destNom) : nomMairie(e.communeNom);
  const objet = objetPorteSur(e);
  const docs = documentsObjet(e);
  const obs = observations(e);

  const champ = (cle: CleChampCada, libelle: string, valeur: string, disponible = valeur.trim() !== ''): ChampCada =>
    ({ cle, libelle, valeur, disponible });

  return [
    champ('civilite', 'Civilité', 'Monsieur'),               // valeur simple (aucune civilité stockée → défaut explicite)
    champ('prenom', 'Prénom', prenom),
    champ('nom', 'Nom', nom),
    champ('courriel', 'Adresse courriel', propre(e.emailContact)),
    champ('pour_compte', 'Pour le compte de', pourCompte),
    champ('adresse', 'Adresse', siege.voie),
    champ('code_postal', 'Code postal', siege.codePostal),
    champ('localite', 'Localité', siege.localite),
    champ('pays', 'Pays', 'France'),
    champ('admin_nom', 'Administration concernée', adminNom),
    champ('admin_adresse', 'Adresse (administration)', mairie.voie),
    champ('admin_code_postal', 'Code postal (administration)', mairie.codePostal),
    // Localité de la mairie : l'adresse postale la donne si connue, sinon la commune (fait factuel, jamais inventé).
    champ('admin_localite', 'Localité (administration)', mairie.localite !== '' ? mairie.localite : propre(e.communeNom)),
    champ('objet_porte', 'Votre demande porte sur', objet),
    champ('documents', 'Document(s) objet de la saisine', docs),
    champ('date_demande', 'Date de la demande à l’administration', jjmmaaaa(e.envoyeeLe)),
    champ('observations', 'Observations', obs),
  ];
}

// ── Historique d'ouverture (message d'en-tête) ──────────────────────────────────
export interface HistoriqueCopiesVue {
  nbChamps: number;
  derniereLe: string | null;   // ISO de la dernière copie
  dernierAdmin: string | null; // libellé lisible du compte
  deposee: boolean;            // la saisine est-elle marquée déposée ?
}

/** Date + heure en Europe/Paris (ex. « 25 août 2026 à 21:30 ») depuis un ISO. */
function dateHeureParis(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
}

/**
 * Message d'en-tête à l'ouverture de la carte (PUR). Les boutons repartent NON marqués à chaque ouverture ; ce message dit s'il
 * existe des copies ANTÉRIEURES (combien, quand, quel compte). Seconde ligne OBLIGATOIRE : déposée ou non — c'est elle qui évite
 * le vrai doublon, la copie n'étant qu'un indice. Aucune copie antérieure → `present:false` (pas de message).
 */
export function messageHistoriqueCopies(h: HistoriqueCopiesVue): { present: boolean; entete: string; statutDepot: string } {
  if (h.nbChamps <= 0) return { present: false, entete: '', statutDepot: '' };
  const quand = h.derniereLe ? dateHeureParis(h.derniereLe) : '—';
  const qui = propre(h.dernierAdmin ?? '') !== '' ? h.dernierAdmin : 'un compte inconnu';
  const s = h.nbChamps > 1 ? 's' : '';
  const entete = `${h.nbChamps} champ${s} déjà copié${s} lors d’une ouverture précédente — dernière copie le ${quand} par ${qui}.`;
  const statutDepot = h.deposee
    ? 'Cette saisine est marquée comme DÉPOSÉE.'
    : 'Cette saisine n’est PAS marquée comme déposée. Copier n’est pas déposer : marquez-la « déposée » seulement après l’avoir réellement soumise sur le formulaire de la CADA.';
  return { present: true, entete, statutDepot };
}

/** Les clés valides (pour valider une trace de copie côté serveur). */
export const CLES_CHAMPS_CADA: readonly CleChampCada[] = [
  'civilite', 'prenom', 'nom', 'courriel', 'pour_compte', 'adresse', 'code_postal', 'localite', 'pays',
  'admin_nom', 'admin_adresse', 'admin_code_postal', 'admin_localite',
  'objet_porte', 'documents', 'date_demande', 'observations',
];
