ALTER TABLE "public"."User"
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "storeName" TEXT,
  ADD COLUMN "profileVisibility" TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN "responseTimeHours" INTEGER,
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "blockedAt" TIMESTAMP(3),
  ADD COLUMN "blockedReason" TEXT,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

ALTER TABLE "public"."Session"
  ADD COLUMN "deviceName" TEXT,
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "userAgent" TEXT;

ALTER TABLE "public"."Address"
  ADD COLUMN "label" TEXT,
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'shipping',
  ADD COLUMN "line2" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Bangladesh';

CREATE TABLE "public"."NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "orderUpdates" BOOLEAN NOT NULL DEFAULT true,
  "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  "payoutAlerts" BOOLEAN NOT NULL DEFAULT true,
  "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "public"."NotificationPreference"("userId");

CREATE TABLE "public"."VerificationSubmission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "documentType" TEXT NOT NULL DEFAULT 'nid',
  "businessName" TEXT,
  "businessLicenseUrl" TEXT,
  "notes" TEXT,
  "rejectionReason" TEXT,
  "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerificationSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationSubmission_userId_key" ON "public"."VerificationSubmission"("userId");

CREATE TABLE "public"."PhoneVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneVerificationToken_token_key" ON "public"."PhoneVerificationToken"("token");

CREATE TABLE "public"."VerificationDocument" (
  "id" TEXT NOT NULL,
  "verificationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PayoutMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accountName" TEXT,
  "encryptedAccountNumber" TEXT,
  "encryptedRoutingNumber" TEXT,
  "encryptedMobileNumber" TEXT,
  "accountLast4" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PayoutTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payoutMethodId" TEXT,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reference" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."LoginActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "deviceName" TEXT,
  "location" TEXT,
  "loggedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginActivity_userId_sessionId_key" ON "public"."LoginActivity"("userId", "sessionId");

CREATE TABLE "public"."AccountActionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "processedById" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountActionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."UserRiskFlag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdById" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserRiskFlag_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."VerificationSubmission"
  ADD CONSTRAINT "VerificationSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."VerificationSubmission"
  ADD CONSTRAINT "VerificationSubmission_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."PhoneVerificationToken"
  ADD CONSTRAINT "PhoneVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."VerificationDocument"
  ADD CONSTRAINT "VerificationDocument_verificationId_fkey"
  FOREIGN KEY ("verificationId") REFERENCES "public"."VerificationSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."PayoutMethod"
  ADD CONSTRAINT "PayoutMethod_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."PayoutTransaction"
  ADD CONSTRAINT "PayoutTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."PayoutTransaction"
  ADD CONSTRAINT "PayoutTransaction_payoutMethodId_fkey"
  FOREIGN KEY ("payoutMethodId") REFERENCES "public"."PayoutMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."LoginActivity"
  ADD CONSTRAINT "LoginActivity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AccountActionRequest"
  ADD CONSTRAINT "AccountActionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AccountActionRequest"
  ADD CONSTRAINT "AccountActionRequest_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."UserRiskFlag"
  ADD CONSTRAINT "UserRiskFlag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."UserRiskFlag"
  ADD CONSTRAINT "UserRiskFlag_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
