import { Body, Controller, Post } from '@nestjs/common';
import { UserService } from './user.service';

interface CreateUserDto {
  id: string;
  email: string;
  name?: string;
}

@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * POST /api/users
   * 专门用于创建测试用户，以避免生成外键关联错误
   */
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.userService.createUser(body.id, body.email, body.name);
  }
}
