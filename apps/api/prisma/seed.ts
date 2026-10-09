/**
 * Demo verisi: DEMO şirketi, organizasyon, personel, kullanıcılar ve örnek aksiyonlar.
 * Gerçek servisleri kullanır (iş kuralları ve denetim izi devreye girer).
 * Kullanım: pnpm --filter @lean/api seed
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SYSTEM_ROLES } from '@lean/shared';
import { AppModule } from '../src/app.module';
import { RequestContext } from '../src/common/request-context';
import { ActionsService } from '../src/core/actions/actions.service';
import { AccessService } from '../src/core/auth/access.service';
import { EmployeesService } from '../src/core/org/employees.service';
import { OrgUnitsService } from '../src/core/org/org-units.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { TenantProvisioningService } from '../src/core/tenants/tenant-provisioning.service';
import { UsersService } from '../src/core/users/users.service';
import { hashPassword } from '../src/core/auth/auth.service';
import { seedMeetings } from './seed-meetings';
import { seedKpis } from './seed-kpi';
import { seedAudits } from './seed-audits';
import { seedProblems } from './seed-problems';
import { seedStrategy } from './seed-strategy';
import { seedSuggestions } from './seed-suggestions';

const DEMO_PASSWORD = 'Demo1234!';
/** Demo yönetici şifresi (DEMO_ADMIN_PASSWORD ile değiştirilebilir) */
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'admin123';

async function main() {
  process.env.SCHEDULER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const ctx = app.get(RequestContext);

  if (await prisma.raw.tenant.findUnique({ where: { code: 'DEMO' } })) {
    // Mevcut demoda yönetici şifresini güncel demo şifresine eşitle (yeniden dağıtımda geçerli olur)
    const demo = await prisma.raw.tenant.findUniqueOrThrow({ where: { code: 'DEMO' } });
    await prisma.raw.user.updateMany({
      where: { tenantId: demo.id, username: 'admin' },
      data: { passwordHash: await hashPassword(ADMIN_PASSWORD), mustChangePassword: false, isActive: true },
    });
    console.log(`DEMO şirketi zaten var, seed atlandı. Yönetici şifresi: admin / ${ADMIN_PASSWORD}`);
    await app.close();
    return;
  }

  const { tenant, admin } = await app.get(TenantProvisioningService).provision({
    code: 'DEMO', name: 'Demo Üretim A.Ş.', adminUsername: 'admin', adminPassword: ADMIN_PASSWORD,
    adminFullName: 'Sistem Yöneticisi', adminEmail: 'admin@demo.local', isPlatformAdmin: true,
  });

  await ctx.runForTenant(tenant.id, async () => {
    const assignments = await app.get(AccessService).loadAssignments(admin.id, tenant.id);
    ctx.setUser({
      id: admin.id, tenantId: tenant.id, username: admin.username, fullName: admin.fullName, employeeId: null,
      isPlatformAdmin: true, isApiKey: false, mustChangePassword: false,
      permissions: new Set(assignments.flatMap((a) => a.permissions)), assignments,
    });

    const org = app.get(OrgUnitsService);
    const root = await prisma.db.orgUnit.findFirstOrThrow({ where: { parentId: null } });
    const unit = (name: string, code: string, type: Parameters<OrgUnitsService['create']>[0]['type'], parentId: string) =>
      org.create({ name, code, type, parentId });

    const fabrika = await unit('Gebze Fabrikası', 'GBZ', 'SITE', root.id);
    const uretim = await unit('Üretim Direktörlüğü', 'URT', 'DIRECTORATE', fabrika.id);
    const hat1 = await unit('Montaj Hattı 1', 'URT-H1', 'LINE', uretim.id);
    const hat2 = await unit('Montaj Hattı 2', 'URT-H2', 'LINE', uretim.id);
    const kalite = await unit('Kalite Müdürlüğü', 'KAL', 'DEPARTMENT', fabrika.id);
    const bakim = await unit('Bakım Müdürlüğü', 'BKM', 'DEPARTMENT', fabrika.id);
    const ik = await unit('İnsan Kaynakları', 'IK', 'DEPARTMENT', root.id);

    const employees = app.get(EmployeesService);
    const emp = (employeeNo: string, firstName: string, lastName: string, title: string, orgUnitId: string, managerId?: string) =>
      employees.create({ employeeNo, firstName, lastName, title, orgUnitId, managerId, createUser: true });

    const gm = await emp('1001', 'Mehmet', 'Kaya', 'Fabrika Müdürü', fabrika.id);
    const urtDir = await emp('1002', 'Zeynep', 'Demir', 'Üretim Direktörü', uretim.id, gm.id);
    const kalMud = await emp('1003', 'Ali', 'Çelik', 'Kalite Müdürü', kalite.id, gm.id);
    const bkmMud = await emp('1004', 'Elif', 'Şahin', 'Bakım Müdürü', bakim.id, gm.id);
    const sef1 = await emp('2001', 'Burak', 'Yıldız', 'Hat Şefi', hat1.id, urtDir.id);
    const sef2 = await emp('2002', 'Selin', 'Aydın', 'Hat Şefi', hat2.id, urtDir.id);
    const op1 = await emp('3001', 'Hasan', 'Öztürk', 'Operatör', hat1.id, sef1.id);
    const op2 = await emp('3002', 'Fatma', 'Arslan', 'Operatör', hat1.id, sef1.id);
    const op3 = await emp('3003', 'Murat', 'Koç', 'Operatör', hat2.id, sef2.id);
    await emp('4001', 'Deniz', 'Kurt', 'İK Uzmanı', ik.id, gm.id);

    // Birim yöneticileri
    for (const [u, e] of [[fabrika, gm], [uretim, urtDir], [kalite, kalMud], [bakim, bkmMud], [hat1, sef1], [hat2, sef2]] as const) {
      await org.update(u.id, { managerEmployeeId: e.id });
    }

    // Demo şifreleri ve roller
    const users = await prisma.db.user.findMany({ where: { employeeId: { not: null } }, include: { employee: true } });
    const roles = Object.fromEntries((await prisma.db.role.findMany()).map((r) => [r.code, r.id]));
    const usersSvc = app.get(UsersService);
    const roleMap: Record<string, { code: string; orgUnitId?: string }[]> = {
      '1001': [{ code: SYSTEM_ROLES.EXECUTIVE }],
      '1002': [{ code: SYSTEM_ROLES.MANAGER, orgUnitId: uretim.id }, { code: SYSTEM_ROLES.KPI_OWNER }],
      '1003': [{ code: SYSTEM_ROLES.QUALITY_COORDINATOR }, { code: SYSTEM_ROLES.MANAGER, orgUnitId: kalite.id }],
      '1004': [{ code: SYSTEM_ROLES.MANAGER, orgUnitId: bakim.id }, { code: SYSTEM_ROLES.AUDITOR }],
      '2001': [{ code: SYSTEM_ROLES.MANAGER, orgUnitId: hat1.id }, { code: SYSTEM_ROLES.KPI_OWNER }],
      '2002': [{ code: SYSTEM_ROLES.MANAGER, orgUnitId: hat2.id }, { code: SYSTEM_ROLES.KPI_OWNER }],
    };
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const byNo: Record<string, string> = {};
    for (const u of users) {
      byNo[u.employee!.employeeNo] = u.id;
      await prisma.db.user.update({ where: { id: u.id }, data: { passwordHash, mustChangePassword: false } });
      const extra = roleMap[u.employee!.employeeNo] ?? [];
      await usersSvc.setRoles(u.id, [{ roleId: roles[SYSTEM_ROLES.EMPLOYEE] }, ...extra.map((r) => ({ roleId: roles[r.code], orgUnitId: r.orgUnitId }))]);
    }

    // Örnek aksiyonlar
    const actions = app.get(ActionsService);
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    await actions.create({ title: 'Hat 1 emniyet bariyeri sensör kalibrasyonu', ownerId: byNo['2001'], dueDate: day(-5), priority: 'HIGH', sourceLabel: 'Haftalık üretim toplantısı' });
    await actions.create({ title: 'Tork anahtarlarının kalibrasyon planının güncellenmesi', ownerId: byNo['1003'], dueDate: day(10), priority: 'MEDIUM' });
    await actions.create({ title: 'Hat 2 duruş kayıtlarının dijitalleştirilmesi', ownerId: byNo['2002'], supporterIds: [byNo['3003']], dueDate: day(3), priority: 'MEDIUM' });
    await actions.create({ title: 'Kompresör hava kaçağı tespiti ve giderilmesi', ownerId: byNo['1004'], dueDate: day(-1), priority: 'CRITICAL', sourceLabel: 'TPM denetimi' });
    await actions.create({ title: 'Operatör iş güvenliği eğitimi katılımı', ownerId: byNo['3001'], dueDate: day(14), priority: 'LOW' });
    await actions.create({ title: '5S etiketlerinin yenilenmesi', ownerId: byNo['3002'], dueDate: day(7), priority: 'LOW' });

    await seedMeetings(app, { byNo, units: { fabrika: fabrika.id, uretim: uretim.id, hat1: hat1.id, kalite: kalite.id } });
    // KPI demo verisi (tanım, hedef, değer, sapma + aksiyon, bilerek eksik girişler)
    await seedKpis(app, { byNo, units: { hat1: hat1.id, hat2: hat2.id, kalite: kalite.id }, day });
    await seedProblems(app, { byNo });
    // Stratejik plan + Hoshin demo verisi (KPI kodlarına bağlıdır)
    await seedStrategy(app, { byNo, day });
    await seedAudits(app, { byNo, units: { hat1: hat1.id, hat2: hat2.id, kalite: kalite.id, bakim: bakim.id, ik: ik.id } });
    await seedSuggestions(app, { byNo });
  });

  console.log('Seed tamamlandı.');
  console.log('  Şirket kodu: DEMO');
  console.log(`  Yönetici   : admin / ${ADMIN_PASSWORD}`);
  console.log(`  Personel   : sicil no (ör. 1002, 2001, 3001) / ${DEMO_PASSWORD}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
