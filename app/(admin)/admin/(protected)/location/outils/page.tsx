import { redirect } from 'next/navigation';
import { accesLocation, REFUS_LOCATION } from '../acces';
import { EcranOutils } from '../EcransLocation';
import { adressePageDepuisModale } from '../parametresAdresse';

/**
 * TUILE LOCATION — ③ « Outils de suivi » (refonte de l'accueil, 17/10/2026) : honoraires (administrateurs) et la suite.
 * 🔴 Arno (25/10/2026) — une ANCIENNE adresse de la modale « Paramètres Location » (`?parametres=…&apporteur=…&panneau=…`) mène à la page
 * équivalente (`/admin/location/outils/parametres?onglet=…`) : aucun lien cassé.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ancienne = adressePageDepuisModale(await searchParams);
  if (ancienne !== null) redirect(ancienne);
  const { autorise, administrateur } = await accesLocation();
  return (
    <section className="gst-page">
      {autorise ? <EcranOutils administrateur={administrateur} /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_LOCATION}</div>}
    </section>
  );
}
