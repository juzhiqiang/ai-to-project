import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { ChunkService } from './chunk.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingModule } from '../embedding/embedding.module';

@Module({
  imports: [PrismaModule, EmbeddingModule],
  controllers: [DocumentController],
  providers: [DocumentService, ChunkService],
  exports: [DocumentService, ChunkService],
})
export class DocumentModule {}
