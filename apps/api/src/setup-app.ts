import { INestApplication, ValidationPipe } from '@nestjs/common';
import { config } from './config';

/** main.ts ve e2e testlerinin paylaştığı uygulama ayarları. */
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.enableShutdownHooks();
}
