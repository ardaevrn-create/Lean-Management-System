import { execSync } from 'child_process';
import { createPrismaClient } from '../src/core/prisma/prisma.service';

/** Test veritabanına migration'ları uygular ve tüm tabloları boşaltır. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://lean:lean@localhost:5432/lean_test?schema=public';
  if (!/test/i.test(new URL(url).pathname)) throw new Error(`Refusing to clean non-test database: ${url}`);
  execSync('npx prisma migrate deploy', { cwd: `${__dirname}/..`, env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });

  const prisma = createPrismaClient(url);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  }
  await prisma.$disconnect();
}
