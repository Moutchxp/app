/**
 * ══ 🔴🔴 LA PRÉ-VISITE — LA MINUTERIE DU SERVEUR WEB (Arno, 10/11/2026) ═══════════════════════════════════════════════════════════
 *
 * Arno : « Envois automatiques : minuterie dans le serveur web toutes les 5 minutes, même transport et même verrou recette que les autres
 * mails Location. Jamais d'envoi depuis le démon. »
 *
 *   · LANCÉE PAR `demarrageNode.ts` (runtime Node, `instrumentation.ts`), APRÈS la pose du verrou de la recette : en recette, le `fetch`
 *     global est déjà enveloppé quand la première passe part — les mails vont dans la boîte de test, aucun ne part ;
 *   · une passe toutes les 5 minutes (la première une minute après le démarrage) ; jamais deux passes à la fois ;
 *   · UNE seule minuterie par processus (rechargement à chaud du serveur de développement compris) ;
 *   · JAMAIS sous les tests ; jamais d'exception qui remonte : une passe en échec est dite au journal du serveur, la suivante réessaie.
 */

export const INTERVALLE_PREVISITE_MS = 5 * 60_000;
export const PREMIERE_PASSE_MS = 60_000;

const POSEE = Symbol.for('svav.previsite.minuterie');
const drapeaux = globalThis as unknown as Record<symbol, unknown>;

export interface DepsMinuterie {
  env: Record<string, string | undefined>;
  passe?: () => Promise<{ alertes: number; invitations: number; echecs: number; recapitulatif: boolean } | null>;
  programmer?: (f: () => void, ms: number) => { unref?: () => void };
  differer?: (f: () => void, ms: number) => { unref?: () => void };
  journal?: (l: string) => void;
}

/** Lance la minuterie (idempotent). Rend `true` si elle vient d'être lancée. */
export function demarrerMinuteriePrevisite(d: DepsMinuterie): boolean {
  if (d.env.VITEST || d.env.NODE_ENV === 'test') return false;
  if (drapeaux[POSEE]) return false;
  drapeaux[POSEE] = true;
  const journal = d.journal ?? ((l: string) => console.log(l));
  const passe = d.passe ?? (async () => (await import('./previsiteAuto')).passePrevisite());
  let enCours = false;
  const tour = (): void => {
    if (enCours) return;
    enCours = true;
    passe()
      .then((p) => {
        if (p !== null && (p.alertes > 0 || p.invitations > 0 || p.echecs > 0)) {
          journal(`[pré-visite] ${p.recapitulatif ? `récapitulatif des ${p.alertes} préavis en retard envoyé` : `${p.alertes} alerte(s) envoyée(s)`}, `
            + `${p.invitations} invitation(s) au compte rendu, ${p.echecs} échec(s) (réessayés à la passe suivante)`);
        }
      })
      .catch((e: unknown) => journal(`[pré-visite] passe impossible : ${(e as Error)?.message ?? 'erreur'}`))
      .finally(() => { enCours = false; });
  };
  (d.differer ?? setTimeout)(tour, PREMIERE_PASSE_MS).unref?.();
  (d.programmer ?? setInterval)(tour, INTERVALLE_PREVISITE_MS).unref?.();
  return true;
}

/** Pour les épreuves seulement : oublier la minuterie posée. */
export function oublierMinuteriePrevisite(): void { delete drapeaux[POSEE]; }
