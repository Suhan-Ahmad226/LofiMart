import React from 'react';

export const TermsPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-20 space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold font-display">Terms of Service</h1>
        <p className="text-gray-500">Last updated: March 07, 2026</p>
      </div>

      <div className="prose prose-slate max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">1. Acceptance of Terms</h2>
          <p className="text-gray-600">
            By accessing and using LofiMart, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">2. User Accounts</h2>
          <p className="text-gray-600">
            You are responsible for maintaining the confidentiality of your account credentials. Any activity under your account is your responsibility. You must be at least 18 years old to create an account.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">3. Marketplace Rules</h2>
          <p className="text-gray-600">
            LofiMart acts as a marketplace. While we verify sellers, we are not directly responsible for the quality of products sold by third-party vendors. However, we offer a comprehensive return policy for your protection.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">4. Payments & Refunds</h2>
          <p className="text-gray-600">
            Payments are processed securely. Refunds are issued according to our Return Policy, typically within 7-10 business days of a successful return verification.
          </p>
        </section>
      </div>
    </div>
  );
};
