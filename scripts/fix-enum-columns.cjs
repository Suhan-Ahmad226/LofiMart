const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const alters = [
    { table: 'User', column: 'role', type: 'UserRole', default: "'customer'" },
    { table: 'Order', column: 'status', type: 'OrderStatus', default: "'processing'" },
    { table: 'OrderShipment', column: 'status', type: 'ShipmentStatus', default: "'processing'" },
  ];

  for (const alter of alters) {
    try {
      // Drop default
      await prisma.$executeRawUnsafe(`ALTER TABLE "${alter.table}" ALTER COLUMN "${alter.column}" DROP DEFAULT`);
      console.log(`Dropped default for ${alter.table}.${alter.column}`);
      
      // Alter column type
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${alter.table}" ALTER COLUMN "${alter.column}" TYPE "${alter.type}" USING ("${alter.column}"::text::"${alter.type}")`,
      );
      console.log(`Altered ${alter.table}.${alter.column} to ${alter.type}`);
      
      // Re-add default with proper type
      await prisma.$executeRawUnsafe(`ALTER TABLE "${alter.table}" ALTER COLUMN "${alter.column}" SET DEFAULT ${alter.default}::"${alter.type}"`);
      console.log(`Set default for ${alter.table}.${alter.column}`);
    } catch (error) {
      console.error(`Error altering ${alter.table}.${alter.column}:`, error.message);
    }
  }

  await prisma.$disconnect();
}

main();
