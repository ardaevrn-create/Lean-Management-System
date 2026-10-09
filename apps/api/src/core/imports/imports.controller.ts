import { BadRequestException, Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';
import type { Response } from 'express';
import { config } from '../../config';
import { ExcelService } from '../excel/excel.service';
import { ImportsService } from './imports.service';

class UploadDto {
  @ApiProperty({ example: 'employees' }) @IsString() type: string;
}

class MappingDto {
  @ApiProperty({ description: 'İçe aktarma kolon anahtarı → Excel başlığı' }) @IsObject() mapping: Record<string, string | null>;
}

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService, private readonly excel: ExcelService) {}

  @Get('types')
  types() {
    return this.imports.types();
  }

  @Get('types/:type/template')
  async template(@Param('type') type: string, @Res() res: Response) {
    this.excel.send(res, `sablon-${type}.xlsx`, await this.imports.template(type));
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadDto) {
    if (!file) throw new BadRequestException('file is required');
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.imports.upload(dto.type, fileName, file.buffer);
  }

  @Post(':jobId/validate')
  validate(@Param('jobId') jobId: string, @Body() dto: MappingDto) {
    return this.imports.validate(jobId, dto.mapping);
  }

  @Post(':jobId/commit')
  commit(@Param('jobId') jobId: string, @Body() dto: MappingDto) {
    return this.imports.commit(jobId, dto.mapping);
  }
}
