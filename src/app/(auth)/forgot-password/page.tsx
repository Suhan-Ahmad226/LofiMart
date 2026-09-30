'use client';

import { Suspense } from 'react';
import { ForgotPasswordPage } from '../../../features/auth/screens/ForgotPasswordPage';

export default function ForgotPasswordRoute() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordPage />
    </Suspense>
  );
}
