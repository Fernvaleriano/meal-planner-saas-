import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portal component that renders children at document body level.
 * This fixes mobile Safari crashes caused by nested modals/overlays.
 */
function Portal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}

export default Portal;
