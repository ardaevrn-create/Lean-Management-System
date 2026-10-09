export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshDays: Number(process.env.JWT_REFRESH_DAYS ?? 30),
  webOrigin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  /** disk | db */
  storageDriver: process.env.STORAGE_DRIVER ?? 'disk',
  /** Vercel Cron isteklerini doğrulamak için (Authorization: Bearer <CRON_SECRET>) */
  cronSecret: process.env.CRON_SECRET ?? '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  smtpUrl: process.env.SMTP_URL ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'Lean Platform <no-reply@example.com>',
  /** Zamanlanmış işlerin çalışıp çalışmayacağı (testlerde kapatılır) */
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
};
