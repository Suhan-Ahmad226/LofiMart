import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Deletion Instructions | LofiMart',
  description: 'Instructions for requesting deletion of personal data from LofiMart.',
  robots: {
    index: true,
    follow: true,
  },
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
          <header className="border-b border-border pb-6">
            <p className="text-sm font-medium text-muted-foreground">LofiMart</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Data Deletion Instructions
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              How to request deletion of your LofiMart account and personal data.
            </p>
          </header>

          <div className="prose prose-sm mt-8 max-w-none dark:prose-invert">
            <section>
              <h2>Request data deletion</h2>
              <p>
                You can request deletion of your LofiMart account and associated
                personal data at any time.
              </p>
              <ol>
                <li>
                  Sign in to your LofiMart account and open your account/profile
                  settings.
                </li>
                <li>
                  Use the account deletion or privacy request option and submit
                  the request.
                </li>
                <li>
                  If you cannot access your account, contact LofiMart support
                  using the contact information published on our website and
                  include the email address or phone number associated with your
                  account.
                </li>
              </ol>
            </section>

            <section>
              <h2>Facebook / Meta connection</h2>
              <p>
                If you connected a Facebook Page or Facebook account to LofiMart,
                you may also disconnect that connection from the relevant
                LofiMart account settings. A Meta/Facebook data deletion request
                does not require you to continue using the Facebook connection.
              </p>
              <p>
                LofiMart processes deletion requests for data that it controls
                in accordance with its applicable privacy and legal obligations.
              </p>
            </section>

            <section>
              <h2>What may be deleted</h2>
              <p>
                Depending on the request and applicable legal requirements, this
                may include your LofiMart profile information, account
                preferences, connected social-account information, and other
                personal data that is not required to be retained.
              </p>
            </section>

            <section>
              <h2>Information that may be retained</h2>
              <p>
                Some information may need to be retained for a limited period
                when required for legal, accounting, fraud-prevention, security,
                dispute-resolution, or transaction-record obligations. When
                retention is required, the information will be retained only as
                permitted or required by applicable law.
              </p>
            </section>

            <section>
              <h2>Need help?</h2>
              <p>
                If you cannot submit a deletion request from your account,
                contact LofiMart support through the contact channel provided on
                the LofiMart website. For faster processing, include the account
                email/phone and explain that you are requesting personal-data
                deletion.
              </p>
            </section>

            <section>
              <h2>Important</h2>
              <p>
                Do not send passwords, access tokens, Facebook Page access
                tokens, or other authentication secrets in a deletion request.
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
