import { EnTetePage } from '../_composants/EnTetePage';
import { accesMonEspace, REFUS_MON_ESPACE, salutation } from './acces';

/**
 * Tuile « MON ESPACE » (Arno, 02/11/2026) — l'espace personnel de chaque collaborateur : ses ventes, ses compromis en cours, ses
 * chiffres (plan en lots : docs/PLAN_MON_ESPACE.md). LOT 1 : le droit et la tuile ; la page dit qu'elle est en construction au lieu
 * de simuler des écrans qui n'existent pas encore. TUILE GARDÉE par `perm_mon_espace` (migration 448).
 */
export default async function MonEspacePage() {
  const { autorise, prenom } = await accesMonEspace();
  return (
    <section className="gst-page">
      <EnTetePage titre="Mon espace" intro="Mes ventes, mes compromis en cours et mes chiffres." />
      {autorise ? (
        <div className="svv-card" data-mon-espace>
          <p style={{ margin: '0 0 .6rem', fontWeight: 700 }}>{salutation(prenom)}</p>
          <p style={{ margin: 0, color: 'var(--color-svv-muted)' }}>
            En construction : vos ventes, vos compromis en cours et vos statistiques arrivent ici lot par lot.
          </p>
        </div>
      ) : (
        <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>{REFUS_MON_ESPACE}</div>
      )}
    </section>
  );
}
