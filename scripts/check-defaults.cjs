const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = ['User', 'Order', 'OrderShipment'];
  
  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`
        SELECT column_name, column_default 
        FROM information_schema.columns 
        WHERE table_name = '${table}' 
        AND column_default IS NOT NULL
      `);
      console.log(`${table} defaults:`, result);
    } catch (error) {
      console.error(`Error checking ${table}:`, error.message);
    }
  }

  await prisma.$disconnect();
}

main();
