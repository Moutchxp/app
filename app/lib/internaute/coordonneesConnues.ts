/**
 * Coordonnées DÉJÀ CONNUES d'un internaute CONNECTÉ, pour la page de demande de certificat (lot COORDONNEES-CONNU,
 * décisions d'Arno du 16/10/2026 : 1a, 2a, 3a). Module PUR (aucun accès base) → importable par le client ET le serveur.
 *
 *  - Connecté, tout est connu → rappel « Vos coordonnées » + « Modifier » (prénom/nom seulement : e-mail et téléphone
 *    gardent le cadenas de l'espace client). Rien n'est redemandé.
 *  - Il manque prénom, nom ou téléphone → on ne demande QUE ce qui manque (obligatoire reste obligatoire). À l'envoi,
 *    le compte est complété — CASES VIDES SEULEMENT, jamais d'écrasement, jamais l'e-mail — et seulement si la session
 *    correspond au dossier (cf. `champsVidesACompleter`, appelé par la route d'ingestion).
 *  - Adresse de RÉSIDENCE : elle n'est pas sur le compte. On propose la dernière adresse de résidence que l'internaute
 *    a LUI-MÊME saisie (réponse « Non » à « Le bien analysé est-il votre résidence principale ? »). Jamais une adresse
 *    ANALYSÉE (règle 4 : on ne remplit jamais l'une avec l'autre).
 *  - Consentements : une finalité accordée, non retirée, sur la version COURANTE du texte, n'est pas redemandée.
 *    Jamais accordée, retirée, ou texte changé depuis → reste proposée, décochée, non imposée.
 *  - Non connecté : `null` → rien ne change.
 */
import type { CleFinalite } from './textesConsentement';

export interface CoordonneesConnues {
  prenom: string | null;
  nom: string | null;
  email: string | null;
  telephone: string | null;
  /** Finalités accordées et toujours valables (non retirées, texte courant) — à ne pas redemander. */
  consentementsValables: CleFinalite[];
  /** Dernière adresse de résidence SAISIE par l'internaute (jamais une adresse analysée), ou null. */
  derniereResidence: string | null;
}

export type ChampIdentite = 'prenom' | 'nom' | 'telephone';

const FINALITES: readonly CleFinalite[] = ['recontact_interne', 'email_marketing', 'retargeting_tiers'];

export function estRenseigne(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Champs d'identité absents du compte (l'e-mail d'un compte est toujours présent : c'est son identifiant). */
export function champsIdentiteManquants(c: Pick<CoordonneesConnues, 'prenom' | 'nom' | 'telephone'>): ChampIdentite[] {
  return (['prenom', 'nom', 'telephone'] as const).filter((k) => !estRenseigne(c[k]));
}

/**
 * Patch de COMPLÉTION du compte : uniquement les champs VIDES sur le compte et renseignés dans la saisie. Jamais l'e-mail,
 * jamais un champ déjà rempli (aucun écrasement). `{}` si rien à compléter.
 */
export function champsVidesACompleter(
  compte: Pick<CoordonneesConnues, 'prenom' | 'nom' | 'telephone'>,
  saisie: { prenom?: string | null; nom?: string | null; telephone?: string | null },
): Partial<Record<ChampIdentite, string>> {
  const patch: Partial<Record<ChampIdentite, string>> = {};
  for (const k of champsIdentiteManquants(compte)) {
    const v = saisie[k];
    if (estRenseigne(v)) patch[k] = v.trim();
  }
  return patch;
}

/** La finalité est-elle déjà accordée et valable sur le compte ? (non connecté → false : rien ne change) */
export function consentementDejaValable(c: CoordonneesConnues | null, finalite: CleFinalite): boolean {
  return c !== null && c.consentementsValables.includes(finalite);
}

/** Lecture DÉFENSIVE de la réponse de GET /api/internaute/coordonnees. Non connecté / réponse illisible → null. */
export function lireReponseCoordonnees(data: unknown): CoordonneesConnues | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.connecte !== true) return null;
  const texte = (v: unknown) => (estRenseigne(v) ? v.trim() : null);
  const consentements = Array.isArray(d.consentementsValables)
    ? (d.consentementsValables.filter((f) => FINALITES.includes(f as CleFinalite)) as CleFinalite[])
    : [];
  return {
    prenom: texte(d.prenom),
    nom: texte(d.nom),
    email: texte(d.email),
    telephone: texte(d.telephone),
    consentementsValables: consentements,
    derniereResidence: texte(d.derniereResidence),
  };
}

/**
 * Ligne de journal de `GET /api/internaute/coordonnees` — JAMAIS de donnée personnelle (ni id, ni e-mail, ni IP, ni
 * l'agent utilisateur brut) : l'issue, la présence du cookie de session et le TYPE d'appareil. « iphone-appli » = ouvert
 * depuis l'écran d'accueil (l'agent utilisateur d'iOS y perd le mot « Safari/ ») : ce mode a ses propres cookies, distincts
 * de ceux de Safari — un internaute connecté dans Safari n'y est pas connecté.
 */
export function ligneDiagnosticCoordonnees(issue: 'reconnu' | 'non_reconnu' | 'erreur', cookie: boolean, agent: string | null): string {
  const ua = agent ?? '';
  const ios = /iPhone|iPad|iPod/.test(ua);
  const appareil = ios ? (/Safari\//.test(ua) ? 'iphone-safari' : 'iphone-appli') : /Android/.test(ua) ? 'android' : 'autre';
  return `[coordonnees] ${issue} cookie=${cookie ? 'present' : 'absent'} appareil=${appareil}`;
}
