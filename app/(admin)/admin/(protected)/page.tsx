import Link from 'next/link';

const MODULES = [
  { slug: '/admin/pilotage', libelle: 'Pilotage', desc: 'Supervision et pilotage du système.' },
  { slug: '/admin/statistiques', libelle: 'Statistiques', desc: 'Indicateurs et suivi d’activité.' },
  { slug: '/admin/internautes', libelle: 'Internautes', desc: 'Gestion des internautes.' },
  { slug: '/admin/curation', libelle: 'Curation', desc: 'Modération et curation des contenus.' },
  { slug: '/admin/banc-test', libelle: 'Banc de test', desc: 'Outils de test et de diagnostic.' },
] as const;

export default function AdminAccueilPage() {
  return (
    <section style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>
        Tableau de bord
      </h1>
      <p style={{ color: 'var(--color-svv-muted)', fontSize: '.9rem', margin: '0 0 16px' }}>
        Interface d’administration interne — Sans Vis-à-Vis®.
      </p>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {MODULES.map((m) => (
          <Link key={m.slug} href={m.slug} className="svv-card" style={{ textDecoration: 'none', display: 'block' }}>
            <span style={{ display: 'block', fontWeight: 700, color: 'var(--color-svv-ink)', marginBottom: 4 }}>
              {m.libelle}
            </span>
            <span style={{ display: 'block', fontSize: '.82rem', color: 'var(--color-svv-muted)' }}>{m.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
