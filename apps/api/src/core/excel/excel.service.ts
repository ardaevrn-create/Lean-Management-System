import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';

export interface ExcelColumn<T> {
  header: string;
  key: string;
  width?: number;
  value: (row: T) => string | number | Date | boolean | null | undefined;
}

/** Excel dışa aktarım yardımcıları (tüm listelerde kullanılır). */
@Injectable()
export class ExcelService {
  async build<T>(sheetName: string, columns: ExcelColumn<T>[], rows: T[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName.slice(0, 31));
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) {
      ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(row) ?? null])));
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  send(res: Response, fileName: string, buffer: Buffer) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buffer);
  }
}
