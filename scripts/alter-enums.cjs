const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = [
    { table: 'User', column: 'role', type: 'UserRole' },
    { table: 'Order', column: 'status', type: 'OrderStatus' },
    { table: 'Order', column: 'paymentStatus', type: 'PaymentStatus' },
    { table: 'OrderShipment', column: 'status', type: 'ShipmentStatus' },
  ];

  for (const alter of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${alter.table}" ALTER COLUMN "${alter.column}" TYPE "${alter.type}" USING ("${alter.column}"::text::"${alter.type}")`,
      );
      console.log(`Altered ${alter.table}.${alter.column} to ${alter.type}`);
    } catch (error) {
      console.error(`Error altering ${alter.table}.${alter.column}:`, error.message);
    }
  }

  await prisma.$disconnect();
}

main();
