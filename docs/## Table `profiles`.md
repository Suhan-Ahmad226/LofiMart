## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `full_name` | `text` |  Nullable |
| `avatar_url` | `text` |  Nullable |
| `role` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `stores`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `owner_id` | `uuid` |  |
| `name` | `text` |  |
| `slug` | `text` |  Unique |
| `description` | `text` |  Nullable |
| `logo_url` | `text` |  Nullable |
| `is_verified` | `bool` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `categories`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `slug` | `text` |  Unique |
| `image_url` | `text` |  Nullable |
| `parent_id` | `uuid` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `products`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `store_id` | `uuid` |  |
| `category_id` | `uuid` |  Nullable |
| `name` | `text` |  |
| `slug` | `text` |  Unique |
| `description` | `text` |  Nullable |
| `price` | `numeric` |  |
| `original_price` | `numeric` |  Nullable |
| `images` | `_text` |  Nullable |
| `stock_quantity` | `int4` |  Nullable |
| `is_published` | `bool` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `orders`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  Nullable |
| `total_amount` | `numeric` |  |
| `status` | `text` |  Nullable |
| `shipping_address` | `jsonb` |  |
| `payment_status` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `order_items`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `order_id` | `uuid` |  |
| `product_id` | `uuid` |  Nullable |
| `quantity` | `int4` |  |
| `price_at_purchase` | `numeric` |  |

## Table `_prisma_migrations`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `varchar` | Primary |
| `checksum` | `varchar` |  |
| `finished_at` | `timestamptz` |  Nullable |
| `migration_name` | `varchar` |  |
| `logs` | `text` |  Nullable |
| `rolled_back_at` | `timestamptz` |  Nullable |
| `started_at` | `timestamptz` |  |
| `applied_steps_count` | `int4` |  |

## Table `User`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `email` | `text` |  |
| `name` | `text` |  Nullable |
| `passwordHash` | `text` |  Nullable |
| `phone` | `text` |  Nullable |
| `role` | `UserRole` |  |
| `points` | `int4` |  |
| `walletBalance` | `numeric` |  |
| `emailVerified` | `bool` |  |
| `emailVerifiedAt` | `timestamp` |  Nullable |
| `tenantId` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `sellerStatus` | `text` |  |
| `avatarUrl` | `text` |  Nullable |
| `bio` | `text` |  Nullable |
| `storeName` | `text` |  Nullable |
| `profileVisibility` | `text` |  |
| `responseTimeHours` | `int4` |  Nullable |
| `twoFactorEnabled` | `bool` |  |
| `phoneVerified` | `bool` |  |
| `phoneVerifiedAt` | `timestamp` |  Nullable |
| `isBlocked` | `bool` |  |
| `blockedAt` | `timestamp` |  Nullable |
| `blockedReason` | `text` |  Nullable |
| `deactivatedAt` | `timestamp` |  Nullable |
| `storefrontSlug` | `text` |  Nullable |
| `storefrontBannerUrl` | `text` |  Nullable |
| `storefrontHeadline` | `text` |  Nullable |
| `storefrontAccentColor` | `text` |  Nullable |
| `storefrontCustomDomain` | `text` |  Nullable |
| `storefrontPublished` | `bool` |  |
| `storefrontDomainStatus` | `text` |  Nullable |
| `storefrontDomainVerificationToken` | `text` |  Nullable |
| `storefrontDomainVerifiedAt` | `timestamp` |  Nullable |
| `alternatePhone` | `text` |  Nullable |
| `submittedForReviewAt` | `timestamp` |  Nullable |
| `approvedAt` | `timestamp` |  Nullable |
| `approvedById` | `text` |  Nullable |
| `rejectionReason` | `text` |  Nullable |
| `suspensionReason` | `text` |  Nullable |
| `telegramChatId` | `text` |  Nullable |
| `telegramLinkedAt` | `timestamp` |  Nullable |
| `refCode` | `varchar` |  Nullable |
| `referral` | `varchar` |  Nullable |
| `supabaseAuthId` | `text` |  Nullable |

## Table `Product`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `slug` | `text` |  |
| `description` | `text` |  Nullable |
| `price` | `numeric` |  |
| `oldPrice` | `numeric` |  Nullable |
| `image` | `text` |  Nullable |
| `model3d` | `text` |  Nullable |
| `category` | `text` |  Nullable |
| `stock` | `int4` |  |
| `tenantId` | `text` |  Nullable |
| `rating` | `float8` |  |
| `reviewsCount` | `int4` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `sellerId` | `text` |  Nullable |
| `variantOptions` | `jsonb` |  Nullable |
| `specifications` | `jsonb` |  Nullable |
| `resellerEnabled` | `bool` |  |
| `resellerBasePrice` | `numeric` |  Nullable |
| `resellerSuggestedPrice` | `numeric` |  Nullable |
| `resellerNotes` | `text` |  Nullable |
| `sku` | `text` |  Nullable |
| `galleryImages` | `jsonb` |  Nullable |
| `videoUrl` | `text` |  Nullable |
| `productStatus` | `text` |  |
| `publishedAt` | `timestamp` |  Nullable |
| `brandid` | `varchar` |  Nullable |
| `categoryid` | `varchar` |  Nullable |
| `status` | `varchar` |  Nullable |

## Table `Order`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  Nullable |
| `tenantId` | `text` |  Nullable |
| `total` | `numeric` |  |
| `status` | `OrderStatus` |  |
| `paymentMethod` | `text` |  Nullable |
| `paymentProvider` | `text` |  Nullable |
| `paymentStatus` | `PaymentStatus` |  Nullable |
| `paidAt` | `timestamp` |  Nullable |
| `failureReason` | `text` |  Nullable |
| `refCode` | `text` |  Nullable |
| `shippingAddress` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `courierProvider` | `text` |  Nullable |
| `trackingId` | `text` |  Nullable |
| `pickupRequestedAt` | `timestamp` |  Nullable |
| `pickedUpAt` | `timestamp` |  Nullable |
| `outForDeliveryAt` | `timestamp` |  Nullable |
| `deliveredAt` | `timestamp` |  Nullable |
| `deliveryFailureReason` | `text` |  Nullable |
| `shipmentMetadata` | `jsonb` |  Nullable |
| `orderCode` | `text` |  Nullable |
| `guestEmail` | `text` |  Nullable |
| `guestPhone` | `text` |  Nullable |
| `claimedAt` | `timestamp` |  Nullable |

## Table `OrderItem`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `orderId` | `text` |  |
| `productId` | `text` |  |
| `qty` | `int4` |  |
| `price` | `numeric` |  |
| `variantSummary` | `text` |  Nullable |
| `variantSku` | `text` |  Nullable |

## Table `Warehouse`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `address` | `text` |  |
| `city` | `text` |  |
| `state` | `text` |  Nullable |
| `country` | `text` |  |
| `postalCode` | `text` |  |
| `phone` | `text` |  Nullable |
| `email` | `text` |  Nullable |
| `maxItems` | `int4` |  Nullable |
| `maxWeightKg` | `float8` |  Nullable |
| `managerId` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `contactName` | `text` |  Nullable |
| `secondaryContact` | `text` |  Nullable |
| `otpNumber` | `text` |  Nullable |
| `pathaoStoreId` | `int4` |  Nullable |
| `pathaoCityId` | `int4` |  Nullable |
| `pathaoZoneId` | `int4` |  Nullable |
| `pathaoAreaId` | `int4` |  Nullable |
| `insideDhakaFee` | `numeric` |  Nullable |
| `outsideDhakaFee` | `numeric` |  Nullable |
| `insideDhakaEta` | `text` |  Nullable |
| `outsideDhakaEta` | `text` |  Nullable |
| `freeShippingThresholdOverride` | `numeric` |  Nullable |

## Table `InventoryItem`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `productId` | `text` |  |
| `warehouseId` | `text` |  |
| `quantity` | `int4` |  |
| `reserved` | `int4` |  |
| `reorderLevel` | `int4` |  |
| `restockThreshold` | `int4` |  Nullable |
| `updatedAt` | `timestamp` |  |
| `createdAt` | `timestamp` |  |

## Table `Tenant`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `slug` | `text` |  |
| `name` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Store`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `tenantId` | `text` |  |
| `name` | `text` |  |
| `domain` | `text` |  Nullable |
| `currency` | `text` |  |
| `locale` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Category`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `icon` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Subcategory`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `categoryId` | `text` |  |
| `name` | `text` |  |
| `icon` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Subsubcategory`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `subcategoryId` | `text` |  |
| `name` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Session`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tokenHash` | `text` |  |
| `expiresAt` | `timestamp` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `deviceName` | `text` |  Nullable |
| `ipAddress` | `text` |  Nullable |
| `location` | `text` |  Nullable |
| `userAgent` | `text` |  Nullable |

## Table `PasswordResetToken`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `token` | `text` |  |
| `expiresAt` | `timestamp` |  |
| `used` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `EmailVerificationToken`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `token` | `text` |  |
| `expiresAt` | `timestamp` |  |
| `used` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `AuditLog`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  Nullable |
| `action` | `text` |  |
| `entityType` | `text` |  |
| `entityId` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `InventoryMovement`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `inventoryItemId` | `text` |  |
| `productId` | `text` |  |
| `warehouseId` | `text` |  |
| `type` | `text` |  |
| `quantityDelta` | `int4` |  |
| `reason` | `text` |  |
| `reference` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `StockReservation`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `productId` | `text` |  |
| `warehouseId` | `text` |  |
| `inventoryItemId` | `text` |  |
| `orderId` | `text` |  Nullable |
| `quantity` | `int4` |  |
| `status` | `text` |  |
| `expiresAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `PurchaseOrder`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `warehouseId` | `text` |  |
| `supplierName` | `text` |  |
| `status` | `text` |  |
| `currency` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `PurchaseOrderLine`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `purchaseOrderId` | `text` |  |
| `productId` | `text` |  |
| `quantity` | `int4` |  |
| `unitCost` | `numeric` |  |

## Table `PaymentTransaction`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `provider` | `text` |  |
| `paymentId` | `text` |  |
| `orderId` | `text` |  Nullable |
| `customerId` | `text` |  Nullable |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `status` | `text` |  |
| `idempotencyKey` | `text` |  |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Refund`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `transactionId` | `text` |  |
| `providerRefundId` | `text` |  |
| `amount` | `numeric` |  |
| `reason` | `text` |  Nullable |
| `status` | `text` |  |
| `createdAt` | `timestamp` |  |

## Table `Review`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `productId` | `text` |  |
| `userId` | `text` |  |
| `rating` | `int4` |  |
| `comment` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `WishlistItem`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `productId` | `text` |  |
| `createdAt` | `timestamp` |  |

## Table `Address`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `name` | `text` |  |
| `phone` | `text` |  |
| `address` | `text` |  |
| `city` | `text` |  |
| `isDefault` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `label` | `text` |  Nullable |
| `type` | `text` |  |
| `line2` | `text` |  Nullable |
| `state` | `text` |  Nullable |
| `postalCode` | `text` |  Nullable |
| `country` | `text` |  |
| `alternatePhone` | `text` |  Nullable |
| `division` | `text` |  Nullable |
| `district` | `text` |  Nullable |
| `upazila` | `text` |  Nullable |
| `house` | `text` |  Nullable |
| `road` | `text` |  Nullable |
| `village` | `text` |  Nullable |

## Table `Coupon`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `code` | `text` |  |
| `discountType` | `text` |  |
| `discountValue` | `numeric` |  |
| `minOrderValue` | `numeric` |  |
| `expiryDate` | `timestamp` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `sellerId` | `text` |  Nullable |

## Table `LedgerAccount`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `code` | `text` |  |
| `name` | `text` |  |
| `type` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `JournalEntry`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `reference` | `text` |  |
| `memo` | `text` |  Nullable |
| `currency` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `JournalLine`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `journalEntryId` | `text` |  |
| `accountId` | `text` |  |
| `debit` | `numeric` |  |
| `credit` | `numeric` |  |
| `description` | `text` |  Nullable |

## Table `Invoice`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `orderId` | `text` |  |
| `userId` | `text` |  |
| `status` | `text` |  |
| `subtotal` | `numeric` |  |
| `tax` | `numeric` |  |
| `total` | `numeric` |  |
| `dueDate` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `invoiceUrl` | `text` |  Nullable |
| `documentUrl` | `text` |  Nullable |

## Table `Expense`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `category` | `text` |  |
| `amount` | `numeric` |  |
| `vendor` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `incurredAt` | `timestamp` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `BlogPost`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `title` | `text` |  |
| `slug` | `text` |  |
| `content` | `text` |  |
| `image` | `text` |  Nullable |
| `authorId` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `excerpt` | `text` |  Nullable |
| `category` | `text` |  Nullable |
| `seoTitle` | `text` |  Nullable |
| `seoDescription` | `text` |  Nullable |
| `status` | `varchar` |  Nullable |

## Table `ContactMessage`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `name` | `text` |  |
| `email` | `text` |  |
| `subject` | `text` |  |
| `message` | `text` |  |
| `status` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `Banner`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `title` | `text` |  |
| `subtitle` | `text` |  Nullable |
| `image` | `text` |  |
| `link` | `text` |  |
| `buttonText` | `text` |  |
| `isActive` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `PlatformSetting`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `key` | `text` | Primary |
| `value` | `text` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `PushSubscription`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `endpoint` | `text` |  |
| `data` | `jsonb` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `ResellerMarkup`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `resellerId` | `text` |  |
| `productId` | `text` |  |
| `markupAmount` | `numeric` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `ResellerCommission`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `resellerId` | `text` |  |
| `orderId` | `text` |  Nullable |
| `productId` | `text` |  Nullable |
| `amount` | `numeric` |  |
| `status` | `text` |  |
| `paidAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `ResellerReferral`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `resellerId` | `text` |  |
| `code` | `text` |  |
| `clicks` | `int4` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `ResellerPayout`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `resellerId` | `text` |  |
| `amount` | `numeric` |  |
| `status` | `text` |  |
| `notes` | `text` |  Nullable |
| `paidAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `UserInteraction`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  Nullable |
| `productId` | `text` |  |
| `interactionType` | `text` |  |
| `sessionId` | `text` |  Nullable |
| `deviceType` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `RecommendationAnalytic`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `recommendationId` | `text` |  |
| `userId` | `text` |  Nullable |
| `productId` | `text` |  |
| `position` | `int4` |  Nullable |
| `clicked` | `bool` |  |
| `converted` | `bool` |  |
| `createdAt` | `timestamp` |  |

## Table `PriceHistory`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `productId` | `text` |  |
| `price` | `numeric` |  |
| `competitorPrices` | `jsonb` |  Nullable |
| `demandScore` | `float8` |  Nullable |
| `conversionRate` | `float8` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `PricingSuggestion`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `productId` | `text` |  |
| `suggestedPrice` | `numeric` |  |
| `minPrice` | `numeric` |  Nullable |
| `maxPrice` | `numeric` |  Nullable |
| `confidenceScore` | `float8` |  Nullable |
| `reasons` | `jsonb` |  Nullable |
| `applied` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `NotificationPreference`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `emailEnabled` | `bool` |  |
| `smsEnabled` | `bool` |  |
| `orderUpdates` | `bool` |  |
| `marketingOptIn` | `bool` |  |
| `payoutAlerts` | `bool` |  |
| `securityAlerts` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `VerificationSubmission`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `role` | `text` |  |
| `status` | `text` |  |
| `documentType` | `text` |  |
| `businessName` | `text` |  Nullable |
| `businessLicenseUrl` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `rejectionReason` | `text` |  Nullable |
| `riskScore` | `float8` |  |
| `submittedAt` | `timestamp` |  |
| `reviewedAt` | `timestamp` |  Nullable |
| `reviewedById` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `PhoneVerificationToken`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `token` | `text` |  |
| `expiresAt` | `timestamp` |  |
| `used` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `VerificationDocument`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `verificationId` | `text` |  |
| `type` | `text` |  |
| `label` | `text` |  |
| `url` | `text` |  |
| `publicId` | `text` |  Nullable |
| `mimeType` | `text` |  Nullable |
| `sizeBytes` | `int4` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `PayoutMethod`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `type` | `text` |  |
| `provider` | `text` |  |
| `accountName` | `text` |  Nullable |
| `encryptedAccountNumber` | `text` |  Nullable |
| `encryptedRoutingNumber` | `text` |  Nullable |
| `encryptedMobileNumber` | `text` |  Nullable |
| `accountLast4` | `text` |  Nullable |
| `isDefault` | `bool` |  |
| `status` | `text` |  |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `PayoutTransaction`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `payoutMethodId` | `text` |  Nullable |
| `type` | `text` |  |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `status` | `text` |  |
| `reference` | `text` |  Nullable |
| `notes` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `processedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `LoginActivity`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `sessionId` | `text` |  |
| `ipAddress` | `text` |  Nullable |
| `userAgent` | `text` |  Nullable |
| `deviceName` | `text` |  Nullable |
| `location` | `text` |  Nullable |
| `loggedInAt` | `timestamp` |  |
| `lastSeenAt` | `timestamp` |  |
| `revokedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `AccountActionRequest`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `type` | `text` |  |
| `status` | `text` |  |
| `reason` | `text` |  Nullable |
| `processedById` | `text` |  Nullable |
| `processedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `orderId` | `text` |  Nullable |
| `resolutionNote` | `text` |  Nullable |

## Table `UserRiskFlag`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `createdById` | `text` |  Nullable |
| `severity` | `text` |  |
| `reason` | `text` |  |
| `notes` | `text` |  Nullable |
| `isActive` | `bool` |  |
| `resolvedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `TenantMembership`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  |
| `role` | `text` |  |
| `isPrimary` | `bool` |  |
| `invitedById` | `text` |  Nullable |
| `acceptedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `TenantSetting`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `tenantId` | `text` |  |
| `currency` | `text` |  |
| `locale` | `text` |  |
| `freeShippingThreshold` | `numeric` |  |
| `cartRecoveryDelayMins` | `int4` |  |
| `signupBonusCoins` | `int4` |  |
| `dailyLoginBaseCoins` | `int4` |  |
| `dailyLoginMaxCoins` | `int4` |  |
| `orderCashbackBps` | `int4` |  |
| `referralInviterCoins` | `int4` |  |
| `referralInviteeCoins` | `int4` |  |
| `surpriseRewardChance` | `float8` |  |
| `spinEnabled` | `bool` |  |
| `spinDailyLimit` | `int4` |  |
| `updatedById` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `WalletTransaction`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `type` | `text` |  |
| `amount` | `numeric` |  |
| `currency` | `text` |  |
| `status` | `text` |  |
| `source` | `text` |  |
| `description` | `text` |  |
| `balanceAfter` | `numeric` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `RewardLog`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `eventType` | `text` |  |
| `coinsAmount` | `int4` |  |
| `walletAmount` | `numeric` |  |
| `discountAmount` | `numeric` |  |
| `source` | `text` |  |
| `description` | `text` |  |
| `referenceId` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `ReferralCode`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `code` | `text` |  |
| `clicks` | `int4` |  |
| `successfulReferrals` | `int4` |  |
| `earnings` | `numeric` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `ReferralAttribution`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `codeId` | `text` |  |
| `inviterId` | `text` |  |
| `inviteeId` | `text` |  Nullable |
| `orderId` | `text` |  Nullable |
| `inviteeEmail` | `text` |  Nullable |
| `status` | `text` |  |
| `rewardGrantedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `LoginStreak`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `currentStreak` | `int4` |  |
| `longestStreak` | `int4` |  |
| `lastClaimedOn` | `timestamp` |  Nullable |
| `totalClaimedCoins` | `int4` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `SpinReward`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `tenantId` | `text` |  Nullable |
| `label` | `text` |  |
| `rewardType` | `text` |  |
| `rewardValue` | `numeric` |  |
| `probability` | `float8` |  |
| `isActive` | `bool` |  |
| `displayOrder` | `int4` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `SpinHistory`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `rewardId` | `text` |  Nullable |
| `rewardLabel` | `text` |  |
| `rewardType` | `text` |  |
| `rewardValue` | `numeric` |  |
| `dateKey` | `text` |  |
| `createdAt` | `timestamp` |  |

## Table `Mission`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `tenantId` | `text` |  Nullable |
| `key` | `text` |  |
| `title` | `text` |  |
| `description` | `text` |  |
| `targetCount` | `int4` |  |
| `rewardCoins` | `int4` |  |
| `rewardWallet` | `numeric` |  |
| `isActive` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `MissionProgress`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `missionId` | `text` |  |
| `progress` | `int4` |  |
| `completedAt` | `timestamp` |  Nullable |
| `claimedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `UserNotification`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `createdById` | `text` |  Nullable |
| `type` | `text` |  |
| `title` | `text` |  |
| `message` | `text` |  |
| `actionUrl` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `readAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |

## Table `CommunityPost`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `tenantId` | `text` |  Nullable |
| `productId` | `text` |  Nullable |
| `title` | `text` |  Nullable |
| `content` | `text` |  |
| `imageUrl` | `text` |  Nullable |
| `topic` | `text` |  Nullable |
| `status` | `text` |  |
| `likesCount` | `int4` |  |
| `commentsCount` | `int4` |  |
| `moderationNote` | `text` |  Nullable |
| `moderatedAt` | `timestamp` |  Nullable |
| `moderatedById` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `CommunityPostComment`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `postId` | `text` |  |
| `userId` | `text` |  |
| `content` | `text` |  |
| `status` | `text` |  |
| `moderationNote` | `text` |  Nullable |
| `moderatedAt` | `timestamp` |  Nullable |
| `moderatedById` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `CommunityPostLike`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `postId` | `text` |  |
| `userId` | `text` |  |
| `createdAt` | `timestamp` |  |

## Table `CommunityPostReport`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `postId` | `text` |  |
| `userId` | `text` |  |
| `reason` | `text` |  |
| `details` | `text` |  Nullable |
| `status` | `text` |  |
| `moderatedAt` | `timestamp` |  Nullable |
| `moderatedById` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `OrderShipment`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `orderId` | `text` |  |
| `sellerId` | `text` |  |
| `warehouseId` | `text` |  Nullable |
| `status` | `ShipmentStatus` |  |
| `total` | `numeric` |  |
| `itemCount` | `int4` |  |
| `courierProvider` | `text` |  Nullable |
| `trackingId` | `text` |  Nullable |
| `pickupRequestedAt` | `timestamp` |  Nullable |
| `pickedUpAt` | `timestamp` |  Nullable |
| `outForDeliveryAt` | `timestamp` |  Nullable |
| `deliveredAt` | `timestamp` |  Nullable |
| `deliveryFailureReason` | `text` |  Nullable |
| `shipmentMetadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `OrderShipmentItem`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `shipmentId` | `text` |  |
| `orderItemId` | `text` |  |
| `productId` | `text` |  |
| `qty` | `int4` |  |
| `price` | `numeric` |  |
| `createdAt` | `timestamp` |  |

## Table `FlashSaleCampaign`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `title` | `text` |  |
| `slug` | `text` |  |
| `description` | `text` |  Nullable |
| `bannerImage` | `text` |  Nullable |
| `startsAt` | `timestamp` |  |
| `endsAt` | `timestamp` |  |
| `status` | `text` |  |
| `createdById` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `FlashSaleEntry`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `campaignId` | `text` |  |
| `sellerId` | `text` |  |
| `productId` | `text` |  |
| `salePrice` | `numeric` |  |
| `allocatedStock` | `int4` |  |
| `status` | `text` |  |
| `note` | `text` |  Nullable |
| `reviewedById` | `text` |  Nullable |
| `reviewedAt` | `timestamp` |  Nullable |
| `rejectionReason` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `SocialAccount`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `sellerId` | `text` |  |
| `platform` | `SocialPlatform` |  |
| `accountId` | `text` |  Nullable |
| `accountName` | `text` |  Nullable |
| `encryptedAccessToken` | `text` |  Nullable |
| `tokenExpiresAt` | `timestamp` |  Nullable |
| `status` | `SocialAccountStatus` |  |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `SocialAutomationSetting`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `sellerId` | `text` |  |
| `platform` | `SocialPlatform` |  |
| `language` | `text` |  |
| `tone` | `text` |  |
| `captionLength` | `text` |  |
| `hashtags` | `text` |  |
| `ctaEnabled` | `bool` |  |
| `aiCaptionEnabled` | `bool` |  |
| `defaultIntervalDays` | `int4` |  |
| `defaultPostingTime` | `text` |  |
| `defaultDurationMode` | `text` |  |
| `defaultMaxPosts` | `int4` |  Nullable |
| `defaultEndAt` | `timestamp` |  Nullable |
| `generateNewCaptionEveryTime` | `bool` |  |
| `useLatestProductData` | `bool` |  |
| `skipOutOfStock` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `SocialPost`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `sellerId` | `text` |  |
| `productId` | `text` |  |
| `platform` | `SocialPlatform` |  |
| `caption` | `text` |  Nullable |
| `mediaUrl` | `text` |  Nullable |
| `status` | `SocialPostStatus` |  |
| `scheduledAt` | `timestamp` |  Nullable |
| `publishedAt` | `timestamp` |  Nullable |
| `externalPostId` | `text` |  Nullable |
| `errorMessage` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `idempotencyKey` | `text` |  Nullable |
| `automationId` | `text` |  Nullable |

## Table `SocialPostTarget`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `socialPostId` | `text` |  |
| `socialAccountId` | `text` |  |
| `platform` | `SocialPlatform` |  |
| `status` | `SocialPostStatus` |  |
| `externalPostId` | `text` |  Nullable |
| `publishedAt` | `timestamp` |  Nullable |
| `errorMessage` | `text` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Table `SocialPostAutomation`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `sellerId` | `text` |  |
| `productId` | `text` |  |
| `platform` | `SocialPlatform` |  |
| `intervalDays` | `int4` |  |
| `startAt` | `timestamp` |  |
| `nextRunAt` | `timestamp` |  |
| `endAt` | `timestamp` |  Nullable |
| `maxPosts` | `int4` |  Nullable |
| `postsCreated` | `int4` |  |
| `status` | `SocialAutomationStatus` |  |
| `caption` | `text` |  Nullable |
| `generateNewCaption` | `bool` |  |
| `useLatestProductData` | `bool` |  |
| `skipOutOfStock` | `bool` |  |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `idempotencyKey` | `text` |  Nullable |
| `lastRunAt` | `timestamp` |  Nullable |
| `lastStatus` | `text` |  Nullable |
| `lastError` | `text` |  Nullable |
| `attempts` | `int4` |  |
| `claimedAt` | `timestamp` |  Nullable |
| `claimExpiresAt` | `timestamp` |  Nullable |
| `claimNonce` | `text` |  Nullable |
| `pauseReason` | `text` |  Nullable |

## Table `OAuthState`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `sellerId` | `text` |  |
| `provider` | `SocialPlatform` |  |
| `state` | `text` |  |
| `expiresAt` | `timestamp` |  |
| `usedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `encryptedAccessToken` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |

## Table `SocialAutomationRun`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `automationId` | `text` |  |
| `sellerId` | `text` |  |
| `productId` | `text` |  |
| `socialPostId` | `text` |  Nullable |
| `idempotencyKey` | `text` |  |
| `status` | `SocialAutomationRunStatus` |  |
| `startedAt` | `timestamp` |  |
| `completedAt` | `timestamp` |  Nullable |
| `externalPostId` | `text` |  Nullable |
| `errorCode` | `text` |  Nullable |
| `errorMessage` | `text` |  Nullable |
| `attempts` | `int4` |  |
| `cycleNumber` | `int4` |  |

## Table `OtpChallenge`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  Nullable |
| `purpose` | `text` |  |
| `channel` | `text` |  |
| `identifier` | `text` |  |
| `pinHash` | `text` |  |
| `attempts` | `int4` |  |
| `maxAttempts` | `int4` |  |
| `expiresAt` | `timestamp` |  |
| `resendAt` | `timestamp` |  |
| `used` | `bool` |  |
| `usedAt` | `timestamp` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |
| `scope` | `text` |  Nullable |

## Table `ProviderAccount`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `text` | Primary |
| `userId` | `text` |  |
| `provider` | `text` |  |
| `providerAccountId` | `text` |  |
| `providerEmail` | `text` |  Nullable |
| `providerEmailVerified` | `bool` |  |
| `providerUsername` | `text` |  Nullable |
| `providerAvatarUrl` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `createdAt` | `timestamp` |  |
| `updatedAt` | `timestamp` |  |

## Custom Types / Enums

### `role`

`customer` | `seller` | `reseller` | `admin`

### `productstatus`

`draft` | `published` | `archived`

### `sellerstatus`

`draft` | `pending_review` | `under_review` | `approved` | `rejected` | `suspended`

### `coupontype`

`percentage` | `flat`

### `couponscope`

`platform` | `seller`

### `flashsalestatus`

`draft` | `active` | `completed` | `cancelled`

### `reviewstatus`

`pending` | `approved` | `rejected`

### `reportstatus`

`pending` | `reviewed` | `dismissed`

### `poststatus`

`draft` | `published` | `archived`

### `payoutstatus`

`pending` | `paid` | `failed` | `cancelled`

### `payoutmethod`

`bank` | `bkash` | `nagad` | `payoneer` | `rocket`

### `addresstype`

`shipping` | `billing` | `pickup`

### `verificationstatus`

`pending` | `verified` | `rejected`

### `inventorymovementtype`

`purchase` | `sale` | `adjustment` | `return` | `reservation` | `stock_restore` | `transfer_in` | `transfer_out`

### `notificationtype`

`order` | `payment` | `shipment` | `review` | `system` | `promotion` | `referral`

### `notificationchannel`

`in_app` | `email` | `sms` | `telegram` | `push`

### `missiontype`

`login` | `order` | `review` | `share` | `referral`

### `missionstatus`

`active` | `completed` | `claimed`

### `gamificationtransactiontype`

`login` | `order_referral` | `signup_referral` | `order_complete` | `review` | `spin` | `mission_referral` | `admin_adjustment` | `payout` | `refund`

### `contentpageslug`

`about` | `contact` | `privacy_policy` | `terms_of_service` | `shipping_policy` | `return_policy` | `faq` | `blog`

### `settinggroup`

`payment` | `shipping` | `tax` | `notification` | `gamification` | `seo` | `general` | `content`

### `settingvaluetype`

`string` | `number` | `boolean` | `json`

### `auditaction`

`create` | `update` | `delete` | `login` | `logout` | `approve` | `reject` | `block` | `unblock`

### `markuptype`

`percentage` | `fixed`

### `wallettransactiontype`

`sale` | `payout` | `adjustment` | `refund` | `fee` | `commission`

### `commentstatus`

`visible` | `hidden` | `reported`

### `blogstatus`

`draft` | `published` | `archived`

### `currency`

`BDT` | `USD` | `EUR` | `GBP`

### `ordersource`

`web` | `mobile_app` | `admin_pos` | `affiliate`

### `flashsaleentrystatus`

`pending` | `active`

### `verificationtype`

`identity` | `business` | `seller`

### `stockstatus`

`in_stock` | `out_of_stock` | `limited`

### `discounttype`

`percentage` | `fixed`

### `refundreason`

`defective_item` | `wrong_item` | `not_as_described` | `changed_mind` | `other`

### `bannerposition`

`hero` | `category` | `sidebar` | `footer`

### `courierstatus`

`pending` | `assigned` | `picked_up` | `in_transit` | `out_for_delivery` | `delivered` | `failed` | `returned` | `cancelled`

### `webhookstatus`

`pending` | `processed` | `failed`

### `mediafolder`

`products` | `users` | `categories` | `blog` | `community` | `banners` | `other`

### `UserRole`

`customer` | `seller` | `reseller` | `admin`

### `OrderStatus`

`pending` | `processing` | `confirmed` | `shipped` | `delivered` | `cancelled` | `returned` | `return_requested` | `delivery_failed` | `packed` | `ready_for_pickup` | `pickup_requested` | `picked_up` | `in_transit` | `out_for_delivery`

### `PaymentStatus`

`pending` | `paid` | `failed` | `refunded` | `partially_refunded` | `voided` | `unpaid`

### `ShipmentStatus`

`pending` | `processing` | `pickup_requested` | `picked_up` | `ready_for_pickup` | `packed` | `out_for_delivery` | `shipped` | `delivered` | `cancelled` | `returned` | `return_requested` | `delivery_failed` | `failed` | `in_transit`

### `SocialPlatform`

`facebook`

### `SocialAccountStatus`

`CONNECTED` | `DISCONNECTED` | `EXPIRED` | `ERROR`

### `SocialPostStatus`

`DRAFT` | `SCHEDULED` | `PUBLISHING` | `PUBLISHED` | `FAILED` | `CANCELLED`

### `SocialAutomationStatus`

`ACTIVE` | `PAUSED` | `COMPLETED` | `CANCELLED` | `FAILED`

### `SocialAutomationRunStatus`

`PENDING` | `CLAIMED` | `PUBLISHING` | `PUBLISHED` | `FAILED` | `CANCELLED`

## RLS Policies

### `profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can select own profile` | SELECT | authenticated | PERMISSIVE | `(( SELECT auth.uid() AS uid) = id)` | — |
| `Users can update own profile` | UPDATE | authenticated | PERMISSIVE | `(( SELECT auth.uid() AS uid) = id)` | `(( SELECT auth.uid() AS uid) = id)` |

### `stores`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Sellers can manage own stores` | ALL | authenticated | PERMISSIVE | `(( SELECT auth.uid() AS uid) = owner_id)` | `(( SELECT auth.uid() AS uid) = owner_id)` |

### `products`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Published products are viewable by everyone` | SELECT | public | PERMISSIVE | `(is_published = true)` | — |
| `Sellers can manage own products` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM stores   WHERE ((stores.id = products.store_id) AND (stores.owner_id = ( SELECT auth.uid() AS uid)))))` | `(EXISTS ( SELECT 1    FROM stores   WHERE ((stores.id = products.store_id) AND (stores.owner_id = ( SELECT auth.uid() AS uid)))))` |

### `orders`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can manage own orders` | ALL | authenticated | PERMISSIVE | `(( SELECT auth.uid() AS uid) = user_id)` | `(( SELECT auth.uid() AS uid) = user_id)` |

### `order_items`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users can manage own order items` | ALL | authenticated | PERMISSIVE | `(EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_items.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))` | `(EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_items.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))` |

