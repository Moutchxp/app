import { cookies } from 'next/headers';
import Link from 'next/link';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../lib/admin/session';
import { liensVisibles } from './menuAdmin';
import { EnTetePage } from './_composants/EnTetePage';

/**
 * Tableau de bord admin. La GRILLE de tuiles dérive de `liensVisibles` — la MÊME source que le menu latéral
 * (M3-4 Lot D) : rôle d'abord, puis permissions du JWS. Un administrateur ne perd jamais une tuile. CONFORT
 * d'affichage seulement : `proxy.ts` reste la seule autorité (il refuse un accès direct par URL).
 */
export default async function AdminAccueilPage() {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  // Le layout (protected) a déjà exigé une session valide ; défaut prudent si absente (aucune tuile).
  const session = payload ? sessionDepuisPayload(payload) : null;
  const tuiles = session ? liensVisibles(session.role, session.perms) : [];

  return (
    <section style={{ maxWidth: 720 }}>
      <EnTetePage titre="Tableau de bord" intro="Interface d’administration interne — Sans Vis-à-Vis®." />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {tuiles.map((t) => (
          <Link key={t.slug} href={t.slug} className="svv-card" style={{ textDecoration: 'none', display: 'block' }}>
            <span style={{ display: 'block', fontWeight: 700, color: 'var(--color-svv-ink)', marginBottom: 4 }}>
              {t.libelle}
            </span>
            <span style={{ display: 'block', fontSize: '.82rem', color: 'var(--color-svv-muted)' }}>{t.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
