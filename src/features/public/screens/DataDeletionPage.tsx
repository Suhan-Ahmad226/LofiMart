import React from 'react';

export const DataDeletionPage = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-20 space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold font-display">Facebook Data Deletion</h1>
        <p className="text-gray-500">LofiMart Social Automation</p>
      </div>

      <div className="prose prose-slate max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Request deletion of your Facebook-related data</h2>
          <p className="text-gray-600">
            If you connected your Facebook account or Facebook Page to LofiMart for Social
            Automation, you can request deletion of the Facebook-related data associated with
            your LofiMart account.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">How to disconnect Facebook</h2>
          <ol className="list-decimal pl-6 space-y-2 text-gray-600">
            <li>Sign in to your LofiMart account.</li>
            <li>Open Seller Dashboard and go to Social Automation.</li>
            <li>Disconnect the connected Facebook Page.</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">How to request deletion</h2>
          <p className="text-gray-600">
            Submit a privacy or account deletion request through the privacy controls available
            in your LofiMart account. Your request can include deletion of Facebook-related
            Social Automation data.
          </p>
          <p className="text-gray-600">
            You may also revoke LofiMart&apos;s access from your Facebook account settings.
            Revoking access prevents LofiMart from continuing to use the Facebook connection.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">What we delete</h2>
          <p className="text-gray-600">
            Where applicable, we delete stored Facebook access credentials, connected Page
            information, and Social Automation records associated with the deletion request,
            subject to information we are legally required to retain.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Processing</h2>
          <p className="text-gray-600">
            We process deletion requests according to our Privacy Policy and applicable
            requirements. If we need additional information to verify the request, we will
            request it before processing the deletion.
          </p>
        </section>
      </div>
    </div>
  );
};
