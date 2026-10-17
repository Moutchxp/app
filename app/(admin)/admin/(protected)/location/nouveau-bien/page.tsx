import { accesLocation, identifiantPage, REFUS_LOCATION } from '../acces';
import { CreationBien } from '../CreationBien';

/** TUILE LOCATION — « Ajouter un nouveau bien » (formulaire complet). `?proprietaires=1,2` : propriétaires déjà rattachés. */
export default async function Page({ searchParams }: { searchParams: Promise<{ proprietaires?: string }> }) {
  const { autorise } = await accesLocation();
  if (!autorise) return <section className="gst-page"><div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div></section>;
  const ids = ((await searchParams).proprietaires ?? '').split(',').map((x) => identifiantPage(x.trim())).filter((x): x is number => x !== null).slice(0, 12);
  return (
    <section className="gst-page">
      <CreationBien proprietairesInitiaux={ids} />
    </section>
  );
}
