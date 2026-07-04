import bcrypt from 'bcryptjs';
import { prisma } from '../src/services/database/prisma';

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@amarshop.local';
const SEED_SELLER_EMAIL = process.env.SEED_SELLER_EMAIL || 'seller@amarshop.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
const SEED_SELLER_PASSWORD = process.env.SEED_SELLER_PASSWORD || 'ChangeMe123!';

async function upsertUser(input: {
  email: string;
  name: string;
  role: 'admin' | 'seller' | 'customer';
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      sellerStatus: input.role === 'seller' ? 'active' : 'active',
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      sellerStatus: input.role === 'seller' ? 'active' : 'active',
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: SEED_ADMIN_EMAIL,
    name: 'Admin User',
    role: 'admin',
    password: SEED_ADMIN_PASSWORD,
  });

  const seller = await upsertUser({
    email: SEED_SELLER_EMAIL,
    name: 'Default Seller',
    role: 'seller',
    password: SEED_SELLER_PASSWORD,
  });

  const categories = [
    { name: 'Fashion', icon: 'ShoppingBag' },
    { name: 'Electronics', icon: 'Laptop' },
    { name: 'Groceries', icon: 'Utensils' },
    { name: 'Home & Living', icon: 'Home' },
    { name: 'Beauty', icon: 'Sparkles' },
    { name: 'Baby Care', icon: 'Baby' },
    { name: 'Sports', icon: 'Bike' },
    { name: 'Art & Crafts', icon: 'Palette' },
  ];

  for (const category of categories) {
    const existingCategory = await prisma.category.findFirst({
      where: { name: category.name },
      select: { id: true },
    });

    if (existingCategory) {
      await prisma.category.update({
        where: { id: existingCategory.id },
        data: { icon: category.icon },
      });
    } else {
      await prisma.category.create({
        data: category,
      });
    }
  }

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 500,
      expiryDate: new Date('2026-12-31T23:59:59.000Z'),
    },
    create: {
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 500,
      expiryDate: new Date('2026-12-31T23:59:59.000Z'),
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'SAVE500' },
    update: {
      discountType: 'flat',
      discountValue: 500,
      minOrderValue: 5000,
      expiryDate: new Date('2026-12-31T23:59:59.000Z'),
    },
    create: {
      code: 'SAVE500',
      discountType: 'flat',
      discountValue: 500,
      minOrderValue: 5000,
      expiryDate: new Date('2026-12-31T23:59:59.000Z'),
    },
  });

  const products = [
    {
      slug: 'smartphone-x1-pro',
      name: 'Smartphone X1 Pro',
      description: 'Latest smartphone with amazing camera.',
      price: 25000,
      oldPrice: 28000,
      image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&fit=crop',
      category: 'Electronics',
      stock: 15,
      rating: 4.5,
      reviewsCount: 250,
    },
    {
      slug: 'wireless-headphones',
      name: 'Wireless Noise Cancelling Headphones',
      description: 'Pure sound experience.',
      price: 3500,
      oldPrice: 4500,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&fit=crop',
      category: 'Electronics',
      stock: 30,
      rating: 4.7,
      reviewsCount: 45,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        ...product,
        sellerId: seller.id,
      },
      create: {
        ...product,
        sellerId: seller.id,
      },
    });
  }

  await prisma.banner.upsert({
    where: { id: 'home-banner-1' },
    update: {
      title: 'New Season, New Deals',
      subtitle: 'Shop curated offers across electronics, fashion, and home.',
      image: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200&fit=crop',
      link: '/shop',
      buttonText: 'Shop Now',
      isActive: true,
    },
    create: {
      id: 'home-banner-1',
      title: 'New Season, New Deals',
      subtitle: 'Shop curated offers across electronics, fashion, and home.',
      image: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1200&fit=crop',
      link: '/shop',
      buttonText: 'Shop Now',
      isActive: true,
    },
  });

  await prisma.blogPost.upsert({
    where: { slug: 'welcome-to-commerce-os' },
    update: {
      title: 'Welcome to Commerce OS',
      content: 'This is your first seeded blog post for the production-ready commerce platform.',
      image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&fit=crop',
      authorId: admin.id,
    },
    create: {
      title: 'Welcome to Commerce OS',
      slug: 'welcome-to-commerce-os',
      content: 'This is your first seeded blog post for the production-ready commerce platform.',
      image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&fit=crop',
      authorId: admin.id,
    },
  });

  await prisma.ledgerAccount.upsert({
    where: { code: '1000' },
    update: { name: 'Cash', type: 'asset' },
    create: { code: '1000', name: 'Cash', type: 'asset' },
  });

  await prisma.ledgerAccount.upsert({
    where: { code: '4000' },
    update: { name: 'Product Revenue', type: 'revenue' },
    create: { code: '4000', name: 'Product Revenue', type: 'revenue' },
  });
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
