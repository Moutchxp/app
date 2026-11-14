import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * ══ 🔴🔴 LE PÉRIMÈTRE D'UN PRÉAVIS DE TEST (Arno, 14/11/2026) — LE VERROU DES MAILS ════════════════════════════════════════════════════════
 * Tout geste qui touche un préavis de test (route, minuterie de la pré-visite) s'exécute DANS son périmètre : `avecPerimetreTest`. Le
 * transport des mails (`transportParDefaut`, seul canal des mails de la Location et des tâches) relit ce périmètre AU MOMENT D'ENVOYER :
 *   · chaque destinataire (À, Cc, Cci) qui n'est pas l'adresse du créateur est RETIRÉ — partenaires, clients, collègues, gestion@ ;
 *   · plus personne : le mail NE PART PAS (refus dit, journalisé comme un échec) ;
 *   · l'objet porte « [TEST] » : impossible de le confondre avec un vrai mail.
 * Le périmètre suit tout le travail asynchrone du geste (AsyncLocalStorage) : un mail envoyé plus tard dans la même requête, une tâche, une
 * relance… restent dans le périmètre. ⚠️ AUCUN IMPORT QUI TIRE `pg` (le transport le lit sans base).
 */
export interface PerimetreTest { testId: number; createurEmail: string }

const stockage = new AsyncLocalStorage<PerimetreTest>();

/** Le périmètre de test du geste en cours, ou null (geste ordinaire). */
export const perimetreCourant = (): PerimetreTest | null => stockage.getStore() ?? null;

/** Exécute `f` dans le périmètre d'un test (null : tel quel). Un périmètre déjà posé n'est jamais remplacé par un autre test. */
export function avecPerimetreTest<T>(p: PerimetreTest | null, f: () => T): T {
  if (p === null) return f();
  const deja = perimetreCourant();
  if (deja !== null && deja.testId !== p.testId) throw new Error('Deux préavis de test dans un même geste : refusé.');
  return stockage.run(p, f);
}

/** Exécute `f` HORS de tout périmètre (une passe générale déclenchée depuis un geste de test : chaque ligne y reprend SON périmètre). */
export const horsPerimetre = <T>(f: () => T): T => stockage.exit(f);

export const MARQUE_OBJET_TEST = '[TEST]';
const norm = (x: string): string => x.trim().toLowerCase();
/** L'adresse nue d'un destinataire écrit « Nom <a@b> » ou « a@b ». PUR. */
export const adresseNue = (x: string): string => norm(/<([^>]+)>/.exec(x)?.[1] ?? x);

export type FiltrageTest<M> = { ok: true; message: M; retires: number } | { ok: false; motif: string };

/**
 * Le message tel qu'il peut partir dans le périmètre d'un test : seuls les destinataires égaux à l'adresse du créateur restent ; aucun : refus.
 * L'objet est marqué « [TEST] ». PUR.
 */
export function filtrerPourTest<M extends { a: readonly string[]; cc: readonly string[]; cci: readonly string[]; objet: string }>(m: M, p: PerimetreTest): FiltrageTest<M> {
  const createur = norm(p.createurEmail);
  const garde = (xs: readonly string[]) => xs.filter((x) => adresseNue(x) === createur);
  const a = garde(m.a); const cc = garde(m.cc); const cci = garde(m.cci);
  const vus = new Set<string>();
  const unique = (xs: string[]) => xs.filter((x) => { const k = adresseNue(x); if (vus.has(k)) return false; vus.add(k); return true; });
  const a2 = unique(a); const cc2 = unique(cc); const cci2 = unique(cci);
  const retires = m.a.length + m.cc.length + m.cci.length - (a2.length + cc2.length + cci2.length);
  if (a2.length + cc2.length + cci2.length === 0) {
    return { ok: false, motif: `Préavis de test : ce mail ne part qu’à l’adresse du créateur du test (${p.createurEmail}), qui n’en était pas destinataire — rien n’est parti.` };
  }
  // le créateur seul, en destinataire principal (jamais en copie cachée d'un mail adressé à personne)
  const principal = a2.length > 0 ? a2 : [...cc2, ...cci2].slice(0, 1);
  const objet = m.objet.startsWith(MARQUE_OBJET_TEST) ? m.objet : `${MARQUE_OBJET_TEST} ${m.objet}`;
  return { ok: true, message: { ...m, a: principal, cc: [], cci: [], objet }, retires };
}
