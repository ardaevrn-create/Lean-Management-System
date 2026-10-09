import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join, normalize } from 'path';
import { config } from '../../config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dosya depolama soyutlaması.
 * - `disk` (varsayılan): yerel disk (UPLOAD_DIR)
 * - `db`: PostgreSQL içinde (kalıcı diski olmayan sunucusuz ortamlar, ör. Vercel)
 * Anahtar her zaman tenantId ile başlar; erişim kontrolü Attachment kaydı üzerinden yapılır.
 */
@Injectable()
export class StorageService {
  constructor(private readonly prisma: PrismaService) {}

  private get useDb() {
    return config.storageDriver === 'db';
  }

  private resolve(key: string) {
    const full = normalize(join(config.uploadDir, key));
    if (!full.startsWith(normalize(config.uploadDir))) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer) {
    if (this.useDb) {
      await this.prisma.raw.storedFile.create({ data: { key, data: new Uint8Array(data), size: data.length } });
      return;
    }
    const path = this.resolve(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    if (this.useDb) {
      const file = await this.prisma.raw.storedFile.findUniqueOrThrow({ where: { key } });
      return Buffer.from(file.data);
    }
    return fs.readFile(this.resolve(key));
  }

  async remove(key: string) {
    if (this.useDb) {
      await this.prisma.raw.storedFile.deleteMany({ where: { key } });
      return;
    }
    await fs.rm(this.resolve(key), { force: true });
  }
}
