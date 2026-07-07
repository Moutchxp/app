'use client';

import dynamic from 'next/dynamic';

/**
 * Page `/admin/curation` — carte de curation patrimoine.
 *
 * La carte Leaflet est chargée UNIQUEMENT côté client (`ssr: false`, pattern `origine/page.tsx`) :
 * `leaflet` touche `window` et ne doit jamais s'exécuter au rendu serveur. La garde d'accès admin
 * (`proxy.ts` + session) est assurée par le layout `(protected)` ; les écritures passent par les
 * endpoints `/api/admin/curation/*` (server-only).
 */
const CurationCarte = dynamic(() => import('./CurationCarte'), {
  ssr: false,
  loading: () => (
    <p style={{ padding: '1rem', color: 'var(--color-svv-muted)', fontSize: '.9rem' }}>
      Chargement de la carte…
    </p>
  ),
});

export default function CurationPage() {
  return <CurationCarte />;
}
