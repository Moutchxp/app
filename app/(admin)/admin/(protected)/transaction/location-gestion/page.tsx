import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { AccueilLocationGestion } from '../EcransTransaction';
import { ARIANE, FilAriane } from '../FilAriane';

/** 🔴 LOT DX (Arno, 01/11/2026) — « Location & Gestion » : la Location, la Gestion (la page existante) et leur FUSION — trois cases de même taille. */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre="Location & Gestion" intro="Le chiffre d’affaires de la location et de la gestion : chaque activité, puis les deux réunies." retour="/admin/transaction">
        <FilAriane etapes={ARIANE.locationGestion} /></EnTetePage>
      {autorise ? <AccueilLocationGestion /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
