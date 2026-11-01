import { EnTetePage } from '../../_composants/EnTetePage';
import { accesTransaction, REFUS_TRANSACTION } from '../acces';
import { EcranSociete } from '../EcransTransaction';
import { ARIANE, FilAriane, TITRE_FUSION_VENTE } from '../FilAriane';

/**
 * 🔴 LOT DM (Arno, 31/10/2026) — « FUSION VENTE CRITERIMMO & MACJ » (ex-« FUSION CRITERIMMO & MACJ », renommée le 01/11/2026) : le MÊME écran que CRITERIMMO et MACJ (`EcranSociete`), sur le périmètre « les deux
 * sociétés » : chaque vente une fois (une vente partagée : ses honoraires totaux ; l'inter-cabinet entre nos sociétés est interne au groupe).
 */
export default async function Page() {
  const { autorise } = await accesTransaction();
  return (
    <section className="gst-page">
      <EnTetePage titre={TITRE_FUSION_VENTE} intro="Les ventes et compromis des deux sociétés réunis : chaque vente une fois, l’inter-cabinet entre elles interne au groupe." retour="/admin/transaction/ventes">
        <FilAriane etapes={ARIANE.fusion} /></EnTetePage>
      {autorise ? <EcranSociete societe="tous" /> : <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_TRANSACTION}</div>}
    </section>
  );
}
