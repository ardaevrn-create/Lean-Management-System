import type { ImportColumn, ImportRowError, PermissionCode } from '@lean/shared';

/** Kolon tiplerine göre dönüştürülmüş satır; anahtar = kolon key'i. */
export type ImportRow = Record<string, string | number | boolean | Date | null>;

export interface ParsedRow {
  /** Excel'deki satır numarası (başlık = 1) */
  rowNumber: number;
  values: ImportRow;
}

/**
 * Bir içe aktarma tipi. Modüller kendi importer'larını ImportRegistry'ye kaydeder.
 * Çerçeve; dosya okuma, kolon eşleştirme, tip dönüşümü ve zorunlu alan kontrolünü yapar.
 * Importer yalnız alan kurallarını (ör. birim kodu var mı) ve kaydetmeyi uygular.
 */
export interface Importer {
  type: string;
  label: string;
  permission: PermissionCode;
  columns: ImportColumn[];
  /** Şablona eklenecek örnek satır(lar) */
  sampleRows?: Record<string, unknown>[];
  /** Alan kuralları; hatasız satırlar commit'e gider */
  validate(rows: ParsedRow[]): Promise<ImportRowError[]>;
  /** Geçerli satırları kaydeder; satır bazlı hataları döndürür */
  commit(rows: ParsedRow[]): Promise<ImportRowError[]>;
}
