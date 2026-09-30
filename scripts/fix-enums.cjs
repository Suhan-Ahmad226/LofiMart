const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Drop existing lowercase enums if they exist
  const lowercaseEnums = ['userrole', 'orderstatus', 'paymentstatus', 'shipmentstatus'];
  for (const name of lowercaseEnums) {
    try {
      await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "${name}"`);
      console.log(`Dropped ${name}`);
    } catch (error) {
      console.log(`Could not drop ${name}:`, error.message);
    }
  }

  // Create properly cased enums
  const types = [
    { name: 'UserRole', values: ['customer', 'seller', 'reseller', 'admin'] },
    { name: 'OrderStatus', values: ['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned', 'return_requested', 'delivery_failed'] },
    { name: 'PaymentStatus', values: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'voided', 'unpaid'] },
    { name: 'ShipmentStatus', values: ['pending', 'processing', 'pickup_requested', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'return_requested', 'delivery_failed', 'failed'] },
  ];

  for (const type of types) {
    try {
      const valuesList = type.values.map((v) => `'${v}'`).join(', ');
      await prisma.$executeRawUnsafe(`CREATE TYPE "${type.name}" AS ENUM (${valuesList})`);
      console.log(`Created ${type.name}`);
    } catch (error) {
      console.error(`Error creating ${type.name}:`, error.message);
    }
  }

  await prisma.$disconnect();
}

main();
