/**
 * NOM-1 — RÉSOLUTION PURE du NOM D'AFFICHAGE d'un corps de bâtiment d'un permis. C'est le SEUL endroit qui décide d'un nom.
 *
 * PRIORITÉ (règle d'Arno) :
 *   1. `repere` — le nom LU dans les documents officiels (plans de masse, coupes, Cerfa), écrit par l'extraction. PRIME toujours.
 *      🔴 `repere` est aussi la CLÉ DE RÉCONCILIATION de l'extraction (ecritureLots) : on ne l'invente JAMAIS, on ne fait que le LIRE.
 *   2. `nomRepli` — le nom de REPLI MAISON, code court stable stocké dans permis_corps_batiment.nom_repli (migration 168) : 'BP' (un
 *      seul corps sans nom → « bâtiment en projet », sans numéro) ou 'BP{rang}' (« bâtiment en projet {rang} », rang = position du corps
 *      dans le permis). Attribué UNE fois (stabilité), jamais recalculé.
 *   3. `bâtiment ${corpsId}` — DERNIER RECOURS, uniquement quand ni repere ni nomRepli (migration 168 non appliquée / corps pas encore
 *      passé par l'attribution) : l'ancien comportement, pour ne jamais rien casser.
 * PUR (aucune I/O). L'attribution du code de repli (impure) vit dans caracteristiquesRepo (attribuerNomsRepli).
 */

/** NOM-1 — code de repli → libellé long. 'BP' → « bâtiment en projet » ; 'BP{n}' → « bâtiment en projet {n} ». null / format inattendu
 *  → null / la chaîne telle quelle (jamais un crash). PUR. */
export function libelleNomRepli(code: string | null | undefined): string | null {
  if (!code) return null;
  const m = /^BP([0-9]*)$/.exec(code);
  if (!m) return code; // format inattendu : on rend le code brut plutôt que d'inventer (jamais d'erreur)
  return m[1] ? `bâtiment en projet ${m[1]}` : 'bâtiment en projet';
}

/** NOM-1 — CODE de repli à ATTRIBUER à un corps anonyme. `rang` = position 1-based du corps dans le permis ; `nombreCorps` = total.
 *  Un permis à UN SEUL corps → 'BP' (sans numéro, règle 3). Sinon 'BP{rang}' (la numérotation suit le RANG DU CORPS, règle 2). PUR. */
export function codeRepli(rang: number, nombreCorps: number): string {
  return nombreCorps <= 1 ? 'BP' : `BP${rang}`;
}

/** NOM-1 / NOM-2 — DÉCISION PURE des codes de repli à poser : un corps SANS `repere` (document) ET SANS `nom_repli` déjà attribué reçoit
 *  'BP{rang}' (rang = position par ordre `id`, tous corps confondus). Un nom déjà attribué N'est PAS recalculé (stabilité) ; on n'écrit
 *  JAMAIS dans `repere`. `corps` DOIT être ordonné par `id` (le rang en dépend). PUR (aucune I/O) — partagé par l'attribution auto et le rattrapage. */
export interface ActionNomRepli { corpsId: number; code: string }
export function actionsNomsRepli(corps: readonly { id: number; repere: string | null; nomRepli: string | null }[]): ActionNomRepli[] {
  const total = corps.length;
  const out: ActionNomRepli[] = [];
  corps.forEach((c, i) => {
    if (c.repere !== null && c.repere.trim() !== '') return; // nom du document → pas de repli
    if (c.nomRepli !== null) return;                          // déjà attribué → stabilité
    out.push({ corpsId: c.id, code: codeRepli(i + 1, total) });
  });
  return out;
}

/**
 * NOM-1 — NOM D'AFFICHAGE d'un corps : `repere` (document) → `nomRepli` (repli maison) → `bâtiment ${corpsId}` (dernier recours). PUR.
 */
export function nomAffichageCorps(corps: { repere: string | null; nomRepli?: string | null; corpsId: number }): string {
  const rep = corps.repere?.trim();
  if (rep) return rep;
  const repli = libelleNomRepli(corps.nomRepli);
  if (repli) return repli;
  return `bâtiment ${corps.corpsId}`;
}

/**
 * NOM-3 — NOM D'AFFICHAGE d'une EMPRISE. `base` = nom du CORPS rattaché (nomAffichageCorps : repère document → repli maison → « bâtiment <id> »),
 * COMPLÉTÉ de « (numéro) » UNIQUEMENT si ce corps porte PLUSIEURS emprises (le nom du corps seul créerait sinon des doublons). Le numéro est le
 * n° STABLE de création (jamais réattribué) ; à défaut (migration 212 non appliquée → `numero` NULL), un rang DÉTERMINISTE par id sert de repli.
 * ⚠️ Un nom d'emprise commence TOUJOURS par le nom de son corps → il ne peut JAMAIS désigner un AUTRE bâtiment à l'écran (aucune collision
 * inter-bâtiments, même si deux corps anonymes coexistent). PUR (aucune I/O). `emprisesMemeCorps` inclut l'emprise elle-même.
 */
export function nomAffichageEmprise(
  emprise: { id: number; numero?: number | null },
  corps: { repere: string | null; nomRepli?: string | null; corpsId: number } | null,
  emprisesMemeCorps: readonly { id: number; numero?: number | null }[],
): string {
  const base = corps ? nomAffichageCorps(corps) : 'bâtiment en projet';
  if (emprisesMemeCorps.length <= 1) return base;
  const rang = emprise.numero ?? emprisesMemeCorps.filter((x) => x.id <= emprise.id).length; // repli déterministe (par id) si numéro absent
  return `${base} (${rang})`;
}

/**
 * NOM-3 — RÉSOLVEUR prêt à l'emploi : rend une fonction `(emprise) => nom` à partir des bâtiments (repère/repli par corpsId) et de TOUTES les
 * emprises du dossier (pour compter les emprises d'un même corps). PUR (mémoïse la table corps + regroupe par corps à la construction).
 */
export function resolveurNomEmprise(
  batiments: readonly { corpsId: number; repere: string | null; nomRepli?: string | null }[],
  emprises: readonly { id: number; corpsId: number | null; numero?: number | null }[],
): (e: { id: number; corpsId: number | null; numero?: number | null }) => string {
  const corpsParId = new Map(batiments.map((b) => [b.corpsId, b]));
  return (e) => {
    const c = e.corpsId !== null ? corpsParId.get(e.corpsId) : undefined;
    const memeCorps = emprises.filter((x) => x.corpsId === e.corpsId);
    return nomAffichageEmprise(e, c ? { repere: c.repere, nomRepli: c.nomRepli, corpsId: c.corpsId } : null, memeCorps);
  };
}
