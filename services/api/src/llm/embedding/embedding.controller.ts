import { Body, Controller, Post } from '@nestjs/common';
import { VectorStoreDocumentInput, VectorStoreService } from './vector-store.service';

interface StoreDocumentsDto {
  documents: VectorStoreDocumentInput[];
}

interface SearchDocumentsDto {
  query: string;
  topK: number;
}

@Controller('api/embedding')
export class EmbeddingController {
  constructor(private readonly vectorStoreService: VectorStoreService) {}

  @Post('store')
  store(@Body() body: StoreDocumentsDto) {
    return this.vectorStoreService.addDocuments(body.documents);
  }

  @Post('search')
  search(@Body() body: SearchDocumentsDto) {
    return this.vectorStoreService.similaritySearch(body.query, body.topK);
  }
}
