import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EnConstruction } from '../EnConstruction';
import { ARIANE, FilAriane } from '../FilAriane';

/** 🔴 LOT DX (Arno, 01/11/2026) — « Location » (sous « Location & Gestion ») : en construction — construite au prochain lot. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Location" intro="Les honoraires de location : baux signés, propriétaire et locataire, par mois et par année." retour="/admin/transaction/location-gestion">
        <FilAriane etapes={ARIANE.location} /></EnTetePage>
      {autorise ? <EnConstruction /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
