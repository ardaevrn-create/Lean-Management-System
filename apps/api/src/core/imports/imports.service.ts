import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type {
  ImportCommitResult, ImportPreview, ImportRowError, ImportTypeInfo, ImportValidationResult,
} from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../auth/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { coerce } from './coerce';
import { ImportRegistry } from './import-registry';
import type { Importer, ParsedRow } from './importer';
import { normalizeHeader, parseSpreadsheet } from './spreadsheet-parser';

type StoredRow = { rowNumber: number; data: Record<string, unknown> };
type Mapping = Record<string, string | null>;

@Injectable()
export class ImportsService {
  constructor(
    private readonly registry: ImportRegistry,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
  ) {}

  types(): ImportTypeInfo[] {
    return this.registry
      .all()
      .filter((i) => this.access.has(i.permission))
      .map((i) => ({ type: i.type, label: i.label, columns: i.columns }));
  }

  async template(type: string): Promise<Buffer> {
    const importer = this.importer(type);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Veri');
    ws.columns = importer.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(14, c.label.length + 4) }));
    ws.getRow(1).font = { bold: true };
    importer.columns.forEach((c, i) => {
      const cell = ws.getRow(1).getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FFFDE68A' : 'FFE5E7EB' } };
      if (c.description) cell.note = c.description;
    });
    for (const sample of importer.sampleRows ?? []) ws.addRow(sample);
    const help = wb.addWorksheet('Açıklama');
    help.columns = [{ header: 'Kolon', width: 24 }, { header: 'Zorunlu', width: 10 }, { header: 'Tip', width: 10 }, { header: 'Açıklama', width: 70 }];
    help.getRow(1).font = { bold: true };
    for (const c of importer.columns) help.addRow([c.label, c.required ? 'Evet' : 'Hayır', c.type, c.description ?? '']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async upload(type: string, fileName: string, buffer: Buffer): Promise<ImportPreview> {
    const importer = this.importer(type);
    const sheet = await parseSpreadsheet(fileName, buffer);
    if (!sheet.rows.length) throw new BusinessException('EMPTY_FILE', 'Dosyada veri satırı yok');
    const job = await this.prisma.db.importJob.create({
      data: {
        tenantId: this.ctx.tenantId,
        type,
        fileName,
        headers: sheet.headers,
        rows: sheet.rows as unknown as Prisma.InputJsonValue,
        totalRows: sheet.rows.length,
        createdById: this.ctx.userId,
      },
    });
    return {
      jobId: job.id,
      type,
      fileName,
      headers: sheet.headers,
      sampleRows: sheet.rows.slice(0, 10).map((r) => r.data),
      totalRows: sheet.rows.length,
      suggestedMapping: this.suggestMapping(importer, sheet.headers),
    };
  }

  async validate(jobId: string, mapping: Mapping): Promise<ImportValidationResult> {
    const { importer, job } = await this.loadJob(jobId);
    const { valid, errors } = await this.prepare(importer, job.rows as unknown as StoredRow[], mapping);
    const failedRows = new Set(errors.map((e) => e.row));
    return {
      totalRows: job.totalRows,
      validRows: valid.filter((r) => !failedRows.has(r.rowNumber)).length,
      errorRows: failedRows.size,
      errors: errors.slice(0, 1000),
    };
  }

  async commit(jobId: string, mapping: Mapping): Promise<ImportCommitResult> {
    const { importer, job } = await this.loadJob(jobId);
    if (job.status === 'COMMITTED') throw new BusinessException('ALREADY_COMMITTED', 'Bu dosya zaten içe aktarıldı');
    const { valid, errors } = await this.prepare(importer, job.rows as unknown as StoredRow[], mapping);
    const failed = new Set(errors.map((e) => e.row));
    const toCommit = valid.filter((r) => !failed.has(r.rowNumber));
    const commitErrors = toCommit.length ? await importer.commit(toCommit) : [];
    const allErrors = [...errors, ...commitErrors];
    const errorRows = new Set(allErrors.map((e) => e.row)).size;
    const result = { totalRows: job.totalRows, successRows: job.totalRows - errorRows, errorRows, errors: allErrors.slice(0, 1000) };
    await this.prisma.db.importJob.update({
      where: { id: job.id },
      data: {
        status: 'COMMITTED',
        successRows: result.successRows,
        errorRows: result.errorRows,
        errors: result.errors as unknown as Prisma.InputJsonValue,
        committedAt: new Date(),
        rows: [], // ham veriyi saklamaya gerek yok
      },
    });
    return result;
  }

  private importer(type: string): Importer {
    const importer = this.registry.get(type);
    if (!importer) throw new NotFoundException(`Unknown import type: ${type}`);
    if (!this.access.has(importer.permission)) throw new ForbiddenException();
    return importer;
  }

  private async loadJob(jobId: string) {
    const job = await this.prisma.db.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.createdById !== this.ctx.userId) throw new NotFoundException('Import job not found');
    return { job, importer: this.importer(job.type) };
  }

  private suggestMapping(importer: Importer, headers: string[]): Mapping {
    const normalized = headers.map((h) => ({ h, n: normalizeHeader(h) }));
    return Object.fromEntries(
      importer.columns.map((c) => {
        const candidates = [normalizeHeader(c.label), normalizeHeader(c.key)];
        const match = normalized.find((x) => candidates.includes(x.n))
          ?? normalized.find((x) => candidates.some((cand) => x.n.includes(cand) || cand.includes(x.n)) && x.n.length > 2);
        return [c.key, match?.h ?? null];
      }),
    );
  }

  /** Kolon eşleştirme + tip dönüşümü + zorunlu alan + importer kuralları. */
  private async prepare(importer: Importer, rows: StoredRow[], mapping: Mapping) {
    const errors: ImportRowError[] = [];
    const missing = importer.columns.filter((c) => c.required && !mapping[c.key]);
    if (missing.length) {
      throw new BusinessException('MAPPING_INCOMPLETE', `Zorunlu kolonlar eşleştirilmedi: ${missing.map((c) => c.label).join(', ')}`);
    }
    const valid: ParsedRow[] = [];
    for (const row of rows) {
      const values: ParsedRow['values'] = {};
      let rowOk = true;
      for (const col of importer.columns) {
        const header = mapping[col.key];
        const result = coerce(header ? row.data[header] : null, col);
        if ('error' in result) {
          errors.push({ row: row.rowNumber, column: col.label, message: result.error });
          rowOk = false;
        } else values[col.key] = result.value;
      }
      if (rowOk) valid.push({ rowNumber: row.rowNumber, values });
    }
    errors.push(...(await importer.validate(valid)));
    return { valid, errors };
  }
}
