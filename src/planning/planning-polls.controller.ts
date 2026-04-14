import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreatePlanningPollDto } from './dto/create-planning-poll.dto';
import { DecidePollDto } from './dto/decide-poll.dto';
import { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollsService } from './planning-polls.service';

@ApiTags('Planejamento — pautas')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/planning/polls')
@UseGuards(JwtAuthGuard)
export class PlanningPollsController {
  constructor(private readonly polls: PlanningPollsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar pautas' })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.polls.list(condominiumId, userId);
  }

  @Get('my-units')
  @ApiOperation({ summary: 'Unidades em que o utilizador pode votar' })
  myUnits(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.polls.myVotableUnits(condominiumId, userId);
  }

  @Get(':pollId')
  @ApiOperation({ summary: 'Detalhe da pauta' })
  getOne(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.getOne(condominiumId, pollId, userId);
  }

  @Get(':pollId/results')
  @ApiOperation({ summary: 'Resultados agregados (gestão)' })
  results(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.results(condominiumId, pollId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar pauta (rascunho)' })
  create(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Body() dto: CreatePlanningPollDto,
  ) {
    return this.polls.create(condominiumId, userId, dto);
  }

  @Patch(':pollId')
  @ApiOperation({ summary: 'Atualizar pauta' })
  update(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: UpdatePlanningPollDto,
  ) {
    return this.polls.update(condominiumId, pollId, userId, dto);
  }

  @Post(':pollId/open')
  @ApiOperation({ summary: 'Abrir votação' })
  open(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.open(condominiumId, pollId, userId);
  }

  @Post(':pollId/close')
  @ApiOperation({ summary: 'Encerrar votação' })
  close(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.close(condominiumId, pollId, userId);
  }

  @Post(':pollId/decide')
  @ApiOperation({ summary: 'Registar decisão (opção vencedora)' })
  decide(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() body: DecidePollDto,
  ) {
    return this.polls.decide(condominiumId, pollId, userId, body.optionId);
  }

  @Post(':pollId/votes')
  @ApiOperation({ summary: 'Votar (uma opção por unidade)' })
  vote(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: CastVoteDto,
  ) {
    return this.polls.castVote(condominiumId, pollId, userId, dto);
  }
}
