import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingService } from './embedding.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [EmbeddingService, SearchService],
  exports: [EmbeddingService, SearchService],
})
export class EmbeddingModule {}
