'use client';

import { useEffect, useState } from 'react';

/**
 * Surveille les réponses de l'API admin et affiche un message dédié quand un accès a été RÉVOQUÉ pendant
 * la session (compte désactivé ou permission retirée → 403 `{ erreur: 'ACCES_REVOQUE' }` posé par le garde
 * serveur `exigerCompteActif`, M3-0).
 *
 * PLACEMENT MINIMAL (justifié) : il n'existe aucun helper `fetch` commun côté admin — 18 appels sont
 * dispersés dans 5 fichiers (dont des fichiers carto sensibles). Plutôt que modifier chaque site d'appel,
 * ce composant est monté UNE fois dans le layout protégé et enveloppe `window.fetch` : il couvre tous les
 * appels admin existants ET futurs, sans toucher aux pages. La sécurité elle-même est 100 % serveur
 * (le 403 bloque l'écriture quoi qu'il arrive) ; ce watcher n'est qu'un confort d'UI.
 */
export function RevocationWatcher() {
  const [revoque, setRevoque] = useState(false);

  useEffect(() => {
    const fetchOriginal = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const reponse = await fetchOriginal(...args);
      // On n'inspecte QUE les 403 de l'API admin ; on clone pour ne pas consommer le flux du vrai appelant.
      if (reponse.status === 403) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request | URL).toString();
        if (url.includes('/api/admin/')) {
          try {
            const corps = await reponse.clone().json();
            if (corps?.erreur === 'ACCES_REVOQUE') setRevoque(true);
          } catch {
            /* corps non-JSON : on ignore, réponse rendue telle quelle */
          }
        }
      }
      return reponse;
    };
    return () => {
      window.fetch = fetchOriginal;
    };
  }, []);

  if (!revoque) return null;

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="svv-revoque-titre" className="svv-revoque-overlay">
      <style>{CSS}</style>
      <div className="svv-revoque-carte">
        <h2 id="svv-revoque-titre" className="svv-revoque-titre">
          Vos droits d’accès ont été modifiés
        </h2>
        <p className="svv-revoque-texte">Reconnectez-vous pour continuer.</p>
        <a href="/admin/login" className="svv-btn svv-btn-primary svv-revoque-lien">
          Se reconnecter
        </a>
      </div>
    </div>
  );
}

const CSS = `
.svv-revoque-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
  padding:1.5rem;background:rgba(20,20,20,.55)}
.svv-revoque-carte{width:100%;max-width:360px;background:#fff;border:1px solid var(--color-svv-line);
  border-radius:.9rem;padding:1.25rem;box-shadow:0 8px 30px rgba(0,0,0,.18)}
.svv-revoque-titre{margin:0 0 6px;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.svv-revoque-texte{margin:0 0 16px;font-size:.9rem;color:var(--color-svv-muted)}
.svv-revoque-lien{display:inline-flex;align-items:center;justify-content:center;min-height:44px;width:100%}
`;
