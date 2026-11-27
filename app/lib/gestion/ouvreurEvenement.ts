/**
 * ══ 🔴🔴 QUI A OUVERT L'ÉVÉNEMENT (Arno, 27/11/2026, 09h48). MODULE PUR — LA SEULE RÈGLE, pour la liste, la fiche, la frise et le filtre. ══
 *
 * « taguer l'ouverture de nouveaux événements avec le nom de l'utilisateur qui l'a ouvert ou initié (en se référant au propriétaire de la session
 * qui a ouvert l'événement). »
 *
 * D'OÙ VIENT LA DONNÉE : à la création, le serveur écrit déjà l'utilisateur de la SESSION (`auteurDeLaRequete`, jamais une valeur envoyée par
 * l'écran) dans `gestion_evenement.ouvert_par` / `ouvert_par_libelle`, et la création entre au journal (« ouverture », sans valeur d'avant). Un
 * événement ancien sans auteur est retrouvé par ce journal ; sinon il est « non renseigné ». Rien n'est inventé ni réécrit.
 *   · utilisateur : le compte retrouvé (par son n°, sinon par son identifiant quand le libellé est une adresse mail) → « Prénom NOM »
 *     (nomCollaborateur, la règle de d1d501cd) ; sinon le libellé écrit à la création (l'adresse mail en dernier recours) ;
 *   · automatique : aucun compte, et un auteur d'automate (relève, script, reprise…) — « ouvert automatiquement » ;
 *   · non renseigné : ni compte, ni libellé utilisable.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (l'écran l'importe).
 */
import { nomCollaborateur } from '../location/texteCompteRendu';

export type OuvreurEvenement =
  | { sorte: 'utilisateur'; cle: string; nom: string }
  | { sorte: 'automatique'; cle: 'auto' }
  | { sorte: 'non_renseigne'; cle: 'nr' };

/** Les auteurs d'automates (aucun compte derrière) : la relève de mail, un script, une reprise, le démon. */
const AUTEUR_AUTOMATIQUE = /^(automatique|relève|releve|démon|demon|script|reprise|gestion-continu|système|systeme)\b/i;
/** Un libellé qui ne nomme personne. */
const LIBELLES_VIDES = new Set(['', 'inconnu']);

export const MOT_OUVERT_AUTOMATIQUEMENT = 'Ouvert automatiquement';
export const MOT_NON_RENSEIGNE = 'non renseigné';

/** L'auteur de l'ouverture, depuis ce que la base a gardé (colonne de l'événement, sinon le journal de sa création, et le compte retrouvé). PUR. */
export function ouvreurDe(r: { id: number | string | null; libelle: string | null; prenom: string | null; nom: string | null }): OuvreurEvenement {
  const libelle = (r.libelle ?? '').replace(/\s+/g, ' ').trim();
  const id = r.id === null || r.id === undefined || r.id === '' ? null : Number(r.id);
  if (id === null && libelle !== '' && AUTEUR_AUTOMATIQUE.test(libelle)) return { sorte: 'automatique', cle: 'auto' };
  const nom = nomCollaborateur(r) || (LIBELLES_VIDES.has(libelle.toLowerCase()) ? '' : libelle);
  if (nom === '') return { sorte: 'non_renseigne', cle: 'nr' };
  return { sorte: 'utilisateur', cle: id !== null ? `u${id}` : `l:${libelle.toLowerCase()}`, nom };
}

/** « ouvert par Arnaud JOREL » / « ouvert automatiquement » / « ouvert par : non renseigné » — en-tête et liste. PUR. */
export function texteOuvertPar(o: OuvreurEvenement | null | undefined): string {
  if (o === null || o === undefined || o.sorte === 'non_renseigne') return `ouvert par : ${MOT_NON_RENSEIGNE}`;
  return o.sorte === 'automatique' ? MOT_OUVERT_AUTOMATIQUEMENT.toLowerCase() : `ouvert par ${o.nom}`;
}

/** Sous la carte « Ouverture » de la frise : « Ouvert par Arnaud JOREL le 23/09/2026 ». `jour` = JJ/MM/AAAA (ou vide). PUR. */
export function texteOuvertureFrise(o: OuvreurEvenement | null | undefined, jour: string): string {
  const le = jour === '' ? '' : ` le ${jour}`;
  if (o === null || o === undefined || o.sorte === 'non_renseigne') return `Ouvert${le} — par : ${MOT_NON_RENSEIGNE}`;
  return o.sorte === 'automatique' ? `${MOT_OUVERT_AUTOMATIQUEMENT}${le}` : `Ouvert par ${o.nom}${le}`;
}

/* ── Le filtre « OUVERT PAR » (Arno, 27/11/2026, point 3) ─────────────────────────────────────────────────────────────────────────────── */
export const OUVREUR_TOUS = 'ouvert-tous';
export const cleFiltreOuvreur = (o: Pick<OuvreurEvenement, 'cle'>): string => `ouvert:${o.cle}`;
export const estCleOuvreur = (cle: string): boolean => cle.startsWith('ouvert:');

/** Les boutons : un par utilisateur ayant ouvert au moins un événement (par nom), puis « Automatique » et « Non renseigné ». PUR. */
export function boutonsOuvreurs(ouvreurs: readonly (OuvreurEvenement | null | undefined)[]): { cle: string; mot: string; n: number }[] {
  const parCle = new Map<string, { cle: string; mot: string; n: number }>();
  let auto = 0; let nr = 0;
  for (const o of ouvreurs) {
    if (o === null || o === undefined || o.sorte === 'non_renseigne') { nr += 1; continue; }
    if (o.sorte === 'automatique') { auto += 1; continue; }
    const k = cleFiltreOuvreur(o);
    const b = parCle.get(k) ?? { cle: k, mot: o.nom, n: 0 };
    b.n += 1; parCle.set(k, b);
  }
  return [...[...parCle.values()].sort((a, b) => a.mot.localeCompare(b.mot, 'fr', { sensitivity: 'base' })),
    { cle: 'ouvert:auto', mot: 'Automatique', n: auto }, { cle: 'ouvert:nr', mot: 'Non renseigné', n: nr }];
}
