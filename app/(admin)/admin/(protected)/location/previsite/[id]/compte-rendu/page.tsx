import { accesLocation, identifiantPage, REFUS_LOCATION } from '../../../acces';
import { LienRetour } from '../../../../_composants/EnTetePage';
import { PageCompteRendu } from '../../../PageCompteRendu';

/**
 * TUILE LOCATION — 🔴 Arno (15/11/2026, 5e retour du test iPhone) : le formulaire « Compte rendu pré-visite » est une PAGE à part entière.
 * Deux pages ne sont jamais visibles en même temps : rien de la page Location n'est monté ici. `[id]` = une occupation du préavis (celle du
 * lien des mails). Le « ← Retour » et « Annuler » ramènent à la page d'origine (la Location, sur le bon préavis).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { autorise } = await accesLocation();
  const id = identifiantPage((await params).id);
  return (
    <section className="gst-page">
      {!autorise ? <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>
        : id === null ? <><LienRetour href="/admin/location" /><div className="svv-card">Adresse incomplète : identifiant manquant.</div></>
          : <PageCompteRendu occupationId={id} />}
    </section>
  );
}
