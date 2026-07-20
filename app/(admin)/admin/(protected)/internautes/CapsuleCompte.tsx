/**
 * Capsule de STATUT « Compte vs One-shot » (peaufinage admin). Axe DIFFÉRENT du consentement (F1/F2/F3) : indique
 * UNIQUEMENT si l'internaute possède un compte (une ligne `internaute_auth` existe pour lui). VERT = « Compte » ;
 * GRIS = « One-shot ». Charte SVAV (vert/gris, aucun orange). Composant PUR (aucun état, aucun effet) → testable en Node.
 */
export function CapsuleCompte({ aUnCompte }: { aUnCompte: boolean }) {
  const couleurs = aUnCompte
    ? { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }
    : { background: '#eef0f3', color: 'var(--color-svv-muted)' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '.68rem',
        fontWeight: 800,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...couleurs,
      }}
    >
      {aUnCompte ? 'Compte' : 'One-shot'}
    </span>
  );
}
