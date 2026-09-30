const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRawUnsafe("SELECT typname FROM pg_type WHERE typname IN ('UserRole', 'OrderStatus', 'PaymentStatus', 'ShipmentStatus')");
    console.log('Exact enum types:', result);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
