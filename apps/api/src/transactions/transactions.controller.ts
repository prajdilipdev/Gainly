import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import {
  CreateTransactionDto,
  ListTransactionsQueryDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('portfolios/:portfolioId/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  list(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactionsService.list(userId, portfolioId, query);
  }

  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(userId, portfolioId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(userId, portfolioId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser('sub') userId: string,
    @Param('portfolioId', ParseUUIDPipe) portfolioId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.remove(userId, portfolioId, id);
  }
}
