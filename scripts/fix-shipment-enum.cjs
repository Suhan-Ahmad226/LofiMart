const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // Drop existing enum
    await prisma.$executeRawUnsafe('DROP TYPE IF EXISTS "ShipmentStatus"');
    console.log('Dropped ShipmentStatus');
    
    // Create with all values including ready_for_pickup and packed
    const values = ['pending', 'processing', 'pickup_requested', 'picked_up', 'ready_for_pickup', 'packed', 'out_for_delivery', 'shipped', 'delivered', 'cancelled', 'returned', 'return_requested', 'delivery_failed', 'failed'];
    const valuesList = values.map((v) => `'${v}'`).join(', ');
    await prisma.$executeRawUnsafe(`CREATE TYPE "ShipmentStatus" AS ENUM (${valuesList})`);
    console.log('Created ShipmentStatus with all values');
    
    // Alter column
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "OrderShipment" ALTER COLUMN "status" TYPE "ShipmentStatus" USING ("status"::text::"ShipmentStatus")',
    );
    console.log('Altered OrderShipment.status');
    
    // Set default
    await prisma.$executeRawUnsafe('ALTER TABLE "OrderShipment" ALTER COLUMN "status" SET DEFAULT \'processing\'::"ShipmentStatus"');
    console.log('Set default for OrderShipment.status');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
