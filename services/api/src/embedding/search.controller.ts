import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SearchService } from './search.service';
import { UserIdGuard } from '../auth/user-id.guard';
import { CurrentUser } from '../auth/current-user.decorator';

interface SearchDto {
  query: string;
  topK?: number;
}

@UseGuards(UserIdGuard)
@Controller('api/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  search(@CurrentUser() userId: string, @Body() body: SearchDto) {
    if (!body?.query || typeof body.query !== 'string') {
      throw new BadRequestException('query 不能为空');
    }
    return this.searchService.similaritySearch(body.query, userId, body.topK ?? 5);
  }
}
