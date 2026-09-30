const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const types = [
    {
      name: 'UserRole',
      values: ['customer', 'seller', 'reseller', 'admin'],
    },
    {
      name: 'OrderStatus',
      values: ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned', 'return_requested', 'delivery_failed'],
    },
    {
      name: 'PaymentStatus',
      values: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'voided', 'unpaid'],
    },
    {
      name: 'ShipmentStatus',
      values: ['pending', 'processing', 'pickup_requested', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'return_requested', 'delivery_failed', 'failed'],
    },
  ];

  for (const type of types) {
    try {
      const valuesList = type.values.map((v) => `'${v}'`).join(', ');
      await prisma.$executeRawUnsafe(`CREATE TYPE ${type.name} AS ENUM (${valuesList})`);
      console.log(`Created ${type.name}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`${type.name} already exists`);
      } else {
        console.error(`Error creating ${type.name}:`, error.message);
      }
    }
  }

  await prisma.$disconnect();
}

main();
