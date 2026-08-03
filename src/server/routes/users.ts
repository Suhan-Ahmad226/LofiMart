import type { RouteContext } from "./context.js";
import { rateLimit } from "../../server/rateLimit.js";
import {
  profileUpdateSchema,
  uploadAssetSchema,
  notificationPreferenceSchema,
  payoutMethodSchema,
  verificationSubmissionSchema,
  privacyRequestSchema,
} from "../../modules/profile/validation.js";
import { encryptSensitiveValue } from "../../features/shared/services/security/fieldEncryption.js";
import {
  uploadDataUrlToCloudinary,
  validateUploadInput,
} from "../../features/shared/services/media/cloudinaryUpload.js";
import { createNotification } from "../../features/admin/services/engagement/gamification.js";
import { isSellerApproved, getSellerApprovalBlockedMessage } from "../../lib/sellerApproval.js";
import { revokeAllSessionsForUser } from "../../features/auth/services/sessionStore.js";
import {
  serializeNotificationPreference,
  serializeVerificationSubmission,
  serializePayoutMethod,
  serializePayoutTransaction,
  serializeAccountActionRequest,
  serializeRiskFlag,
  serializeAddress,
  serializeResellerPayout,
  serializeOrder,
  serializeOrderItem,
  getErrorMessage,
} from "./serializers.js";

export function registerUserRoutes(ctx: RouteContext): void {
  const {
    app,
    prisma,
    authenticateToken,
    ensureNotificationPreference,
    markLoginActivitiesRevoked,
    getActiveAdminUsers,
    logServerError,
    serializeUser,
  } = ctx;

  const handleAuditLog = async (
    userId: string | null | undefined,
    action: string,
    entityType: string,
    entityId?: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    await ctx.handleAuditLog({ userId: userId ?? undefined, action, entityType, entityId: entityId ?? undefined, metadata });
  };

  app.get("/api/users/profile", authenticateToken, async (req: any, res) => {
    try {
      const userId = String(req.user.id);
      const [user, notificationPreference, verificationSubmission, payoutMethods, payoutTransactions, actionRequests, riskFlags, addresses] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        ensureNotificationPreference(userId),
        prisma.verificationSubmission.findUnique({
          where: { userId },
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
            documents: true,
          },
        }),
        prisma.payoutMethod.findMany({
          where: { userId },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
        prisma.payoutTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.accountActionRequest.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.userRiskFlag.findMany({
          where: { userId, isActive: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.address.findMany({
          where: { userId },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
      ]);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        user: serializeUser(user),
        notification_preferences: serializeNotificationPreference(notificationPreference),
        verification: serializeVerificationSubmission(verificationSubmission),
        payout_methods: payoutMethods.map(serializePayoutMethod),
        transaction_history: payoutTransactions.map(serializePayoutTransaction),
        privacy_requests: actionRequests.map(serializeAccountActionRequest),
        risk_flags: req.user.role === "admin" ? riskFlags.map(serializeRiskFlag) : [],
        addresses: addresses.map(serializeAddress),
      });
    } catch (error) {
      logServerError("load profile", error, { userId: String(req.user.id) });
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  app.patch("/api/users/profile", authenticateToken, async (req: any, res) => {
    const parsed = profileUpdateSchema.safeParse({
      ...req.body,
      response_time_hours:
        req.body?.response_time_hours === null || typeof req.body?.response_time_hours === "undefined"
          ? undefined
          : Number(req.body.response_time_hours),
    });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid profile payload" });
    }

    const userId = String(req.user.id);
    const payload = parsed.data;

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name: payload.name,
          phone: payload.phone || null,
          alternatePhone: payload.alternate_phone || null,
          bio: payload.bio || null,
          storeName: payload.store_name || null,
          profileVisibility: payload.profile_visibility ?? undefined,
          responseTimeHours: payload.response_time_hours ?? null,
        },
      });

      await handleAuditLog(userId, "profile.updated", "user", userId, {
        profile_visibility: updatedUser.profileVisibility,
      });

      res.json({ success: true, user: serializeUser(updatedUser) });
    } catch (error) {
      logServerError("update profile", error, { userId });
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/users/profile/avatar", authenticateToken, rateLimit("profile-avatar", 15, 60_000), async (req: any, res) => {
    try {
      const parsed = uploadAssetSchema.safeParse({
        data_url: req.body?.data_url,
        mime_type: req.body?.mime_type,
        size_bytes: Number(req.body?.size_bytes),
      });

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid upload payload" });
      }

      validateUploadInput({
        dataUrl: parsed.data.data_url,
        mimeType: parsed.data.mime_type,
        sizeBytes: parsed.data.size_bytes,
      });

      const uploaded = await uploadDataUrlToCloudinary({
        dataUrl: parsed.data.data_url,
        folder: "amarshop/profiles",
        publicIdPrefix: `avatar-${req.user.id}`,
      });

      const updatedUser = await prisma.user.update({
        where: { id: String(req.user.id) },
        data: { avatarUrl: uploaded.url },
      });

      await handleAuditLog(String(req.user.id), "profile.avatar.updated", "user", String(req.user.id), {
        public_id: uploaded.publicId,
      });

      res.json({ success: true, avatar_url: updatedUser.avatarUrl, user: serializeUser(updatedUser) });
    } catch (error: any) {
      const message = getErrorMessage(error);
      logServerError("upload profile avatar", error, { userId: String(req.user.id) });
      const status = message.toLowerCase().includes("invalid") || message.toLowerCase().includes("too large") ? 400 : 500;
      res.status(status).json({ error: message || "Failed to upload avatar" });
    }
  });

  app.get("/api/users/preferences", authenticateToken, async (req: any, res) => {
    const preference = await ensureNotificationPreference(String(req.user.id));
    res.json(serializeNotificationPreference(preference));
  });

  app.patch("/api/users/preferences", authenticateToken, async (req: any, res) => {
    const parsed = notificationPreferenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid preferences payload" });
    }

    const updated = await prisma.notificationPreference.upsert({
      where: { userId: String(req.user.id) },
      update: {
        emailEnabled: parsed.data.email_enabled,
        smsEnabled: parsed.data.sms_enabled,
        orderUpdates: parsed.data.order_updates,
        marketingOptIn: parsed.data.marketing_opt_in,
        payoutAlerts: parsed.data.payout_alerts,
        securityAlerts: parsed.data.security_alerts,
      },
      create: {
        userId: String(req.user.id),
        emailEnabled: parsed.data.email_enabled,
        smsEnabled: parsed.data.sms_enabled,
        orderUpdates: parsed.data.order_updates,
        marketingOptIn: parsed.data.marketing_opt_in,
        payoutAlerts: parsed.data.payout_alerts,
        securityAlerts: parsed.data.security_alerts,
      },
    });

    await handleAuditLog(String(req.user.id), "profile.preferences.updated", "notification_preference", updated.id);
    res.json({ success: true, preferences: serializeNotificationPreference(updated) });
  });

  app.get("/api/users/payout-methods", authenticateToken, async (req: any, res) => {
    const methods = await prisma.payoutMethod.findMany({
      where: { userId: String(req.user.id) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    res.json(methods.map(serializePayoutMethod));
  });

  app.post("/api/users/payout-methods", authenticateToken, async (req: any, res) => {
    const parsed = payoutMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payout method payload" });
    }

    const userId = String(req.user.id);
    const data = parsed.data;

    if (!["seller", "reseller", "admin"].includes(String(req.user.role))) {
      return res.status(403).json({ error: "Payout methods are only available for seller and reseller accounts" });
    }

    const created = await prisma.$transaction(async (tx: any) => {
      if (data.is_default) {
        await tx.payoutMethod.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      return tx.payoutMethod.create({
        data: {
          userId,
          type: data.type,
          provider: data.provider,
          accountName: data.account_name || null,
          encryptedAccountNumber: data.account_number ? encryptSensitiveValue(data.account_number) : null,
          encryptedRoutingNumber: data.routing_number ? encryptSensitiveValue(data.routing_number) : null,
          encryptedMobileNumber: data.mobile_number ? encryptSensitiveValue(data.mobile_number) : null,
          accountLast4: (data.account_number || data.mobile_number || "").replace(/\D+/g, "").slice(-4) || null,
          isDefault: data.is_default,
          metadata: data.metadata || undefined,
        },
      });
    });

    await handleAuditLog(userId, "payout_method.created", "payout_method", created.id, { provider: created.provider, type: created.type });
    res.json({ success: true, payout_method: serializePayoutMethod(created) });
  });

  app.patch("/api/users/payout-methods/:id/default", authenticateToken, async (req: any, res) => {
    const method = await prisma.payoutMethod.findFirst({
      where: { id: req.params.id, userId: String(req.user.id) },
    });
    if (!method) return res.status(404).json({ error: "Payout method not found" });

    await prisma.$transaction([
      prisma.payoutMethod.updateMany({
        where: { userId: String(req.user.id) },
        data: { isDefault: false },
      }),
      prisma.payoutMethod.update({
        where: { id: method.id },
        data: { isDefault: true },
      }),
    ]);

    await handleAuditLog(String(req.user.id), "payout_method.default_changed", "payout_method", method.id);
    res.json({ success: true });
  });

  app.delete("/api/users/payout-methods/:id", authenticateToken, async (req: any, res) => {
    const method = await prisma.payoutMethod.findFirst({
      where: { id: req.params.id, userId: String(req.user.id) },
    });
    if (!method) return res.status(404).json({ error: "Payout method not found" });

    await prisma.payoutMethod.delete({ where: { id: method.id } });
    await handleAuditLog(String(req.user.id), "payout_method.deleted", "payout_method", method.id);
    res.json({ success: true });
  });

  app.get("/api/users/transactions", authenticateToken, async (req: any, res) => {
    const [transactions, resellerPayouts] = await Promise.all([
      prisma.payoutTransaction.findMany({
        where: { userId: String(req.user.id) },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      req.user.role === "reseller"
        ? prisma.resellerPayout.findMany({
            where: { resellerId: String(req.user.id) },
            orderBy: { createdAt: "desc" },
            take: 25,
          })
        : Promise.resolve([] as any[]),
    ]);

    res.json({
      transactions: transactions.map(serializePayoutTransaction),
      reseller_payouts: resellerPayouts.map(serializeResellerPayout),
    });
  });

  app.post("/api/users/payout-request", authenticateToken, async (req: any, res) => {
    if (!["seller", "reseller"].includes(String(req.user.role))) {
      return res.status(403).json({ error: "Only seller and reseller accounts can request payouts" });
    }

    if (String(req.user.role) === "seller") {
      const seller = await prisma.user.findUnique({
        where: { id: String(req.user.id) },
        select: { sellerStatus: true },
      });
      if (!isSellerApproved(seller?.sellerStatus)) {
        return res.status(403).json({ error: getSellerApprovalBlockedMessage("payout_withdrawal", seller?.sellerStatus) });
      }
    }

    const amount = Number(req.body?.amount);
    const payoutMethodId = typeof req.body?.payout_method_id === "string" ? req.body.payout_method_id : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "A valid payout amount is required" });
    }

    let payoutMethod = null;
    if (payoutMethodId) {
      payoutMethod = await prisma.payoutMethod.findFirst({
        where: { id: payoutMethodId, userId: String(req.user.id) },
      });
      if (!payoutMethod) {
        return res.status(404).json({ error: "Payout method not found" });
      }
    }

    const transaction = await prisma.payoutTransaction.create({
      data: {
        userId: String(req.user.id),
        payoutMethodId: payoutMethod?.id ?? null,
        type: "payout_request",
        amount,
        currency: "BDT",
        status: "pending",
        notes,
      },
    });

    const requester = await prisma.user.findUnique({
      where: { id: String(req.user.id) },
      select: { id: true, name: true, email: true, tenantId: true },
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: requester?.tenantId ?? null,
          createdById: String(req.user.id),
          type: "payout",
          title: "New payout request",
          message: `${requester?.name || requester?.email || "A seller"} requested a payout of ${amount.toLocaleString()} BDT.`,
          actionUrl: `/admin/payments?search=${encodeURIComponent(transaction.id)}&payout=${transaction.id}`,
          metadata: {
            payoutTransactionId: transaction.id,
            requesterId: requester?.id ?? String(req.user.id),
            requesterEmail: requester?.email ?? null,
            amount,
          },
        }),
      ),
    );

    await handleAuditLog(String(req.user.id), "payout.requested", "payout_transaction", transaction.id, { amount });
    res.json({ success: true, transaction: serializePayoutTransaction(transaction) });
  });

  app.get("/api/users/verification", authenticateToken, async (req: any, res) => {
    const submission = await prisma.verificationSubmission.findUnique({
      where: { userId: String(req.user.id) },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
        documents: true,
      },
    });

    res.json(serializeVerificationSubmission(submission));
  });

  app.post("/api/users/verification", authenticateToken, rateLimit("kyc-submit", 10, 60_000), async (req: any, res) => {
    if (!["seller", "reseller"].includes(String(req.user.role))) {
      return res.status(403).json({ error: "KYC submission is only available for seller and reseller accounts" });
    }

    const parsed = verificationSubmissionSchema.safeParse({
      ...req.body,
      documents: req.body?.documents,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid verification payload" });
    }

    try {
      const uploads = await Promise.all(
        Object.entries(parsed.data.documents).map(async ([key, file]) => {
          if (!file) return null;
          validateUploadInput({
            dataUrl: file.data_url,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
          });

          const uploaded = await uploadDataUrlToCloudinary({
            dataUrl: file.data_url,
            folder: "amarshop/kyc",
            publicIdPrefix: `${req.user.id}-${key}`,
            resourceType: file.mime_type === "application/pdf" ? "raw" : "auto",
          });

          return {
            type: key,
            label: key.replace(/_/g, " "),
            url: uploaded.url,
            publicId: uploaded.publicId,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
          };
        }),
      );

      const filteredUploads = uploads.filter(Boolean) as Array<Record<string, unknown>>;

      const submission = await prisma.$transaction(async (tx: any) => {
        const existing = await tx.verificationSubmission.findUnique({
          where: { userId: String(req.user.id) },
          include: { documents: true },
        });

        if (existing) {
          await tx.verificationDocument.deleteMany({ where: { verificationId: existing.id } });
        }

        return tx.verificationSubmission.upsert({
          where: { userId: String(req.user.id) },
          update: {
            role: String(req.user.role),
            documentType: parsed.data.document_type,
            businessName: parsed.data.business_name || null,
            businessLicenseUrl: filteredUploads.find((item) => item.type === "business_license")?.url as string | undefined,
            notes: parsed.data.notes || null,
            status: "pending",
            rejectionReason: null,
            submittedAt: new Date(),
            reviewedAt: null,
            reviewedById: null,
            documents: {
              create: filteredUploads.map((item) => ({
                type: String(item.type),
                label: String(item.label),
                url: String(item.url),
                publicId: item.publicId ? String(item.publicId) : null,
                mimeType: item.mimeType ? String(item.mimeType) : null,
                sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
              })),
            },
          },
          create: {
            userId: String(req.user.id),
            role: String(req.user.role),
            documentType: parsed.data.document_type,
            businessName: parsed.data.business_name || null,
            businessLicenseUrl: filteredUploads.find((item) => item.type === "business_license")?.url as string | undefined,
            notes: parsed.data.notes || null,
            status: "pending",
            documents: {
              create: filteredUploads.map((item) => ({
                type: String(item.type),
                label: String(item.label),
                url: String(item.url),
                publicId: item.publicId ? String(item.publicId) : null,
                mimeType: item.mimeType ? String(item.mimeType) : null,
                sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
              })),
            },
          },
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
            documents: true,
          },
        });
      });

      await handleAuditLog(String(req.user.id), "kyc.submitted", "verification_submission", submission.id, {
        document_type: submission.documentType,
      });

      const currentUser = await prisma.user.findUnique({
        where: { id: String(req.user.id) },
        select: { id: true, name: true, email: true, tenantId: true, role: true },
      });
      const admins = await getActiveAdminUsers();
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            tenantId: currentUser?.tenantId ?? null,
            createdById: String(req.user.id),
            type: "verification",
            title: "New KYC submission",
            message: `${currentUser?.name || currentUser?.email || "A user"} submitted ${String(currentUser?.role || req.user.role)} verification for review.`,
            actionUrl: `/admin/users?search=${encodeURIComponent(currentUser?.email || currentUser?.name || submission.id)}&user=${encodeURIComponent(currentUser?.id || String(req.user.id))}`,
            metadata: {
              verificationId: submission.id,
              userId: currentUser?.id ?? String(req.user.id),
              userEmail: currentUser?.email ?? null,
              role: currentUser?.role ?? String(req.user.role),
            },
          }),
        ),
      );

      res.json({ success: true, verification: serializeVerificationSubmission(submission) });
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message || "Failed to submit verification" });
    }
  });

  app.get("/api/users/privacy/export", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const [user, orders, transactions, addresses, notificationPreference] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { items: true } }),
      prisma.payoutTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      prisma.address.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      ensureNotificationPreference(userId),
    ]);

    res.json({
      exported_at: new Date().toISOString(),
      user: user ? serializeUser(user) : null,
      addresses: addresses.map(serializeAddress),
      orders: orders.map((order: any) => ({ ...serializeOrder(order), items: order.items.map(serializeOrderItem) })),
      transactions: transactions.map(serializePayoutTransaction),
      notification_preferences: serializeNotificationPreference(notificationPreference),
    });
  });

  app.post("/api/users/privacy/request", authenticateToken, async (req: any, res) => {
    const parsed = privacyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid privacy request" });
    }

    const request = await prisma.accountActionRequest.create({
      data: {
        userId: String(req.user.id),
        type: parsed.data.type,
        reason: parsed.data.reason || null,
      },
    });

    if (parsed.data.type === "deactivate") {
      await prisma.user.update({
        where: { id: String(req.user.id) },
        data: { deactivatedAt: new Date() },
      });
      await revokeAllSessionsForUser(req.user.id);
      await markLoginActivitiesRevoked(String(req.user.id));
    }

    const requester = await prisma.user.findUnique({
      where: { id: String(req.user.id) },
      select: { id: true, name: true, email: true, tenantId: true },
    });
    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: requester?.tenantId ?? null,
          createdById: String(req.user.id),
          type: "account_action",
          title: "New account action request",
          message: `${requester?.name || requester?.email || "A user"} submitted a ${String(request.type).replaceAll("_", " ")} request.`,
          actionUrl: `/admin/users?search=${encodeURIComponent(requester?.email || requester?.name || request.id)}&user=${encodeURIComponent(requester?.id || String(req.user.id))}`,
          metadata: {
            requestId: request.id,
            userId: requester?.id ?? String(req.user.id),
            userEmail: requester?.email ?? null,
            type: request.type,
          },
        }),
      ),
    );

    await handleAuditLog(String(req.user.id), "privacy.request_created", "account_action_request", request.id, { type: request.type });
    res.json({ success: true, request: serializeAccountActionRequest(request) });
  });
}
