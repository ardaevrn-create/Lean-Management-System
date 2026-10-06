import { Global, Module } from '@nestjs/common';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from './prisma.service';
import { SequenceService } from './sequence.service';

@Global()
@Module({
  providers: [PrismaService, SequenceService, RequestContext],
  exports: [PrismaService, SequenceService, RequestContext],
})
export class PrismaModule {}
