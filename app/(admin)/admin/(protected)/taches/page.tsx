import { cookies } from 'next/headers';
import { NOM_COOKIE, sessionDepuisPayload, verifierJeton } from '../../../../lib/admin/session';
import { EnTetePage } from '../_composants/EnTetePage';
import { acceptationTacheDisponible } from '../../../../lib/gestion/schema';
import { compteSelonRegle, demandeDuJeton, mesTachesRecues } from '../../../../lib/gestion/acceptationRepo';
import { MesTaches } from './MesTaches';

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — « MES TÂCHES » : LES TÂCHES QU'ON M'A CONFIÉES, ET LA RÉPONSE À UNE DEMANDE ══════
 *
 * Arno : « Les liens mènent à une page de l'application, protégée par connexion, accessible à tout compte qui remplit
 * la règle “Confiée à” MÊME SANS la tuile Gestion. Cette page ne montre que SES propres tâches. »
 *
 * `?j=<jeton>&d=accepter|refuser` — le lien du mail : la demande s'affiche, avec la décision pré-choisie ; la personne
 * CONFIRME (un simple affichage de page n'agit jamais : un antivirus de messagerie qui « visite » les liens ne doit
 * pas accepter une tâche à sa place). Un lien expiré, déjà utilisé, remplacé ou destiné à quelqu'un d'autre est
 * refusé en clair — et dans ce dernier cas, rien de la tâche n'est montré.
 */
export const dynamic = 'force-dynamic';

const INTRO = 'Les tâches qui vous sont confiées, et les demandes d’acceptation qui vous attendent.';

export default async function MesTachesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const compte = payload ? await compteSelonRegle(sessionDepuisPayload(payload).sub) : null;
  const p = await searchParams;
  const j = typeof p.j === 'string' ? p.j : null;
  const d = p.d === 'refuser' ? 'refuser' : p.d === 'accepter' ? 'accepter' : null;

  if (compte === null) {
    return (
      <section className="svv-page">
        <EnTetePage titre="Mes tâches" intro={INTRO} />
        <div className="svv-card" role="alert">
          Ce compte ne peut pas recevoir de tâche : il faut un compte actif dont l’adresse appartient à notre Workspace.
        </div>
      </section>
    );
  }
  if (!(await acceptationTacheDisponible())) {
    return (
      <section className="svv-page">
        <EnTetePage titre="Mes tâches" intro={INTRO} />
        <div className="svv-card">Les tâches ne sont pas encore installées sur ce serveur.</div>
      </section>
    );
  }
  const [taches, demande] = await Promise.all([
    mesTachesRecues(compte.id),
    j === null ? Promise.resolve(null) : demandeDuJeton(j, compte.id),
  ]);
  return (
    <section className="svv-page">
      <EnTetePage titre="Mes tâches" intro={INTRO} />
      <MesTaches nom={compte.nom} taches={taches} jeton={j} decisionProposee={d}
        demande={demande === null ? null : { tache: demande.tache, verdict: demande.verdict }} />
    </section>
  );
}
