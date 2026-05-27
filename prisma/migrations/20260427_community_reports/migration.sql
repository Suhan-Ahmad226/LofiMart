-- CreateTable
CREATE TABLE "public"."CommunityPostReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "moderatedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPostReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostReport_postId_userId_key" ON "public"."CommunityPostReport"("postId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPostReport_status_createdAt_idx" ON "public"."CommunityPostReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPostReport_userId_createdAt_idx" ON "public"."CommunityPostReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
