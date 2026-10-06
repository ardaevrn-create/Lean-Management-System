import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join, normalize } from 'path';
import { config } from '../../config';

/**
 * Dosya depolama soyutlaması. Şimdilik yerel disk; bulut dağıtımında S3 uyumlu
 * implementasyon aynı arayüzle eklenecek.
 */
@Injectable()
export class StorageService {
  private resolve(key: string) {
    const full = normalize(join(config.uploadDir, key));
    if (!full.startsWith(normalize(config.uploadDir))) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer) {
    const path = this.resolve(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, data);
  }

  get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}
