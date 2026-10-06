import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://lean:lean@localhost:5432/lean_test?schema=public';
process.env.SCHEDULER_ENABLED = 'false';
process.env.UPLOAD_DIR = '/tmp/lean-test-uploads';

export async function createTestApp(): Promise<INestApplication> {
  // Ortam değişkenleri ayarlandıktan sonra yükle
  const { AppModule } = await import('../src/app.module');
  const { setupApp } = await import('../src/setup-app');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return app;
}

export async function login(app: INestApplication, tenantCode: string, username: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ tenantCode, username, password }).expect(200);
  return res.body.accessToken;
}

/** Yetkili istek yardımcıları */
export function client(app: INestApplication, token: string) {
  const server = app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => auth(request(server).get(`/api/v1${url}`)),
    post: (url: string, body?: object) => (body ? auth(request(server).post(`/api/v1${url}`)).send(body) : auth(request(server).post(`/api/v1${url}`))),
    patch: (url: string, body: object) => auth(request(server).patch(`/api/v1${url}`)).send(body),
    put: (url: string, body: object) => auth(request(server).put(`/api/v1${url}`)).send(body),
    del: (url: string) => auth(request(server).delete(`/api/v1${url}`)),
  };
}
