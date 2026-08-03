'use client';

"use client";

import { useEffect } from 'react';
import { useNavigate } from '../../../../lib/navigation';

export default function Page() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/account/settings?section=addresses', { replace: true });
  }, [navigate]);

  return null;
}
