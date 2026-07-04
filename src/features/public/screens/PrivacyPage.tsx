import React from 'react';

export const PrivacyPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-20 space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold font-display">Privacy Policy</h1>
        <p className="text-gray-500">Last updated: March 07, 2026</p>
      </div>

      <div className="prose prose-slate max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">1. Information We Collect</h2>
          <p className="text-gray-600">
            We collect information you provide directly to us, such as when you create an account, make a purchase, or contact support. This includes your name, email, phone number, and shipping address.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">2. How We Use Your Information</h2>
          <p className="text-gray-600">
            We use your information to process orders, provide customer support, and send you updates about your purchases. We may also use it to improve our services and for marketing purposes with your consent.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">3. Data Security</h2>
          <p className="text-gray-600">
            We implement industry-standard security measures to protect your personal data. Your payment information is encrypted and processed by secure third-party payment gateways.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">4. Your Rights</h2>
          <p className="text-gray-600">
            You have the right to access, correct, or delete your personal information at any time through your account settings or by contacting our support team.
          </p>
        </section>
      </div>
    </div>
  );
};
