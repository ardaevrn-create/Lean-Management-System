import { Prisma } from '@prisma/client';

/** tenantId kolonu olan tüm modeller şema metadata'sından otomatik bulunur. */
export const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name),
);

const WHERE_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
]);

/**
 * Tenant izolasyonu: tenant modellerindeki tüm sorgulara tenantId filtresi,
 * create işlemlerine tenantId ekler. Tenant bağlamı yoksa hata fırlatır.
 * Not: nested create'lerde tenantId servis tarafından açıkça verilmelidir.
 */
export function tenantExtension(getTenantId: () => string | undefined) {
  return Prisma.defineExtension({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const tenantId = getTenantId();
          if (!tenantId) throw new Error(`Tenant context missing for ${model}.${operation}`);
          const a = (args ?? {}) as Record<string, any>;

          if (WHERE_OPS.has(operation)) {
            a.where = { ...a.where, tenantId };
          } else if (operation === 'create') {
            a.data = { ...a.data, tenantId };
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            a.data = Array.isArray(a.data)
              ? a.data.map((d: object) => ({ ...d, tenantId }))
              : { ...a.data, tenantId };
          } else if (operation === 'upsert') {
            a.where = { ...a.where, tenantId };
            a.create = { ...a.create, tenantId };
          }
          return query(a);
        },
      },
    },
  });
}
