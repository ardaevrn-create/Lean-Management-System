import { Injectable } from '@nestjs/common';
import type { Importer } from './importer';

@Injectable()
export class ImportRegistry {
  private readonly importers = new Map<string, Importer>();

  register(importer: Importer) {
    this.importers.set(importer.type, importer);
  }

  get(type: string) {
    return this.importers.get(type);
  }

  all() {
    return [...this.importers.values()];
  }
}
