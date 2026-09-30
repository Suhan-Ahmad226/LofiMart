'use client';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '480px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 700, marginBottom: '12px', color: '#0f172a' }}>404</h1>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Page not found</h2>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            borderRadius: '8px',
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
