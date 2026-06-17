import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CastVoteDto } from './dto/cast-vote.dto';
import { CreatePlanningPollDto } from './dto/create-planning-poll.dto';
import { CreateMeetingNoteDto } from './dto/create-meeting-note.dto';
import { DecidePollDto } from './dto/decide-poll.dto';
import { GenerateMeetingMinutesDto } from './dto/generate-meeting-minutes.dto';
import { ListPlanningPollsQueryDto } from './dto/list-planning-polls.query.dto';
import { RegisterAbstentionDto } from './dto/register-abstention.dto';
import { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollsService } from './planning-polls.service';

@ApiTags('Planejamento — pautas')
@ApiBearerAuth('JWT')
@Controller('condominiums/:condominiumId/planning/polls')
@UseGuards(JwtAuthGuard)
export class PlanningPollsController {
  constructor(private readonly polls: PlanningPollsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar pautas',
    description:
      'Ordenação: data de competência (decrescente), depois data de registro. Sem «q»: filtra por data de registro (padrão últimos 30 dias). Com «q»: busca por título e ignora datas. Máximo 100 itens.',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'registeredFrom', required: false })
  @ApiQuery({ name: 'registeredTo', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'includeMyVotes', required: false })
  list(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Query() query: ListPlanningPollsQueryDto,
  ) {
    return this.polls.list(condominiumId, userId, query);
  }

  @Get('my-units')
  @ApiOperation({ summary: 'Unidades em que o usuário pode votar' })
  myUnits(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
  ) {
    return this.polls.myVotableUnits(condominiumId, userId);
  }

  @Get(':pollId/attachments/:attachmentId/file')
  @ApiOperation({ summary: 'Descarregar anexo da pauta' })
  @ApiParam({ name: 'attachmentId' })
  async downloadAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, contentType, filename } =
      await this.polls.getAttachmentFile(
        condominiumId,
        pollId,
        attachmentId,
        userId,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return new StreamableFile(buffer);
  }

  @Post(':pollId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  @ApiOperation({
    summary:
      'Anexar ficheiro à pauta (síndico/titular), em qualquer estado, incl. após encerrar ou decidir. ' +
      'Formatos: PDF, imagem, Word, texto ou áudio Opus / Ogg (ex.: .opus do WhatsApp).',
  })
  @ApiParam({ name: 'pollId' })
  uploadAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo ausente.');
    }
    return this.polls.addAttachment(condominiumId, pollId, userId, file);
  }

  @Delete(':pollId/attachments/:attachmentId')
  @ApiOperation({ summary: 'Remover anexo da pauta' })
  removeAttachment(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.polls.removeAttachment(
      condominiumId,
      pollId,
      attachmentId,
      userId,
    );
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

  @Get(':pollId/my-votes')
  @ApiOperation({
    summary: 'Votos das unidades do utilizador nesta pauta',
    description:
      'Por unidade em que o utilizador pode intervir, as opções atualmente registadas (mesmo se outro representante tiver submetido).',
  })
  myVotesInPoll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.getMyUnitVotesInPoll(condominiumId, pollId, userId);
  }

  @Get(':pollId/units/:unitId/vote')
  @ApiOperation({
    summary: 'Voto registado de uma unidade (para edição)',
    description:
      'Titular ou síndico podem consultar o voto de uma unidade ao intervir em seu nome, sem expor a lista completa.',
  })
  unitVoteInPoll(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    return this.polls.getUnitVoteInPoll(
      condominiumId,
      pollId,
      userId,
      unitId,
    );
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
  @ApiOperation({
    summary: 'Atualizar pauta',
    description:
      'Em rascunho: pode alterar `assemblyType` (ordinária, eleição ou Ata), `allowMultiple` e substituir `options`. Tipo «Ata» remove opções; ao sair de «Ata», envie pelo menos duas opções.',
  })
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

  @Post(':pollId/finalize-ata')
  @ApiOperation({
    summary:
      'Concluir pauta tipo «Ata» (sem opções de voto): marca como decidida após encerramento.',
  })
  finalizeAta(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.finalizeAtaPoll(condominiumId, pollId, userId);
  }

  @Post(':pollId/decide')
  @ApiOperation({ summary: 'Registrar decisão (opção vencedora)' })
  decide(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() body: DecidePollDto,
  ) {
    return this.polls.decide(
      condominiumId,
      pollId,
      userId,
      body.questionId,
      body.optionId,
    );
  }

  @Post(':pollId/meeting-notes')
  @ApiOperation({
    summary: 'Registrar anotação de contexto para a ata',
    description:
      'Titular ou síndico. Pode ser usada fora ou dentro do modo reunião; todas as anotações entram no contexto da geração da ata com IA.',
  })
  @ApiParam({ name: 'pollId', format: 'uuid' })
  addMeetingNote(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() body: CreateMeetingNoteDto,
  ) {
    return this.polls.addMeetingNote(condominiumId, pollId, userId, body);
  }

  @Get(':pollId/meeting-notes')
  @ApiOperation({
    summary: 'Listar anotações de contexto para a ata',
  })
  @ApiParam({ name: 'pollId', format: 'uuid' })
  listMeetingNotes(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    return this.polls.listMeetingNotes(condominiumId, pollId, userId);
  }

  @Post(':pollId/meeting-minutes/generate')
  @ApiOperation({
    summary:
      'Gerar ou regerar a ata final com IA a partir de todas as anotações e do contexto da pauta',
    description:
      'Obrigatório DEEPSEEK_API_KEY na API (ou OPENAI_API_KEY). A secção Discussões e deliberações é integralmente reescrita em português formal.',
  })
  @ApiParam({ name: 'pollId', format: 'uuid' })
  generateMeetingMinutes(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() body: GenerateMeetingMinutesDto,
  ) {
    return this.polls.generateMeetingMinutes(
      condominiumId,
      pollId,
      userId,
      body,
    );
  }

  @Post(':pollId/votes')
  @ApiOperation({
    summary: 'Votar por unidade',
    description:
      'Envie `optionIds`: um UUID para escolha única, ou vários se a pauta tiver `allowMultiple`.',
  })
  vote(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: CastVoteDto,
  ) {
    return this.polls.castVote(condominiumId, pollId, userId, dto);
  }

  @Post(':pollId/abstentions')
  @ApiOperation({
    summary: 'Registrar abstenção de unidade (após encerrar votação)',
    description:
      'Titular ou síndico registam abstenção por deliberação e unidade, só com a pauta encerrada.',
  })
  registerAbstention(
    @CurrentUser() userId: string,
    @Param('condominiumId', ParseUUIDPipe) condominiumId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: RegisterAbstentionDto,
  ) {
    return this.polls.registerAbstention(condominiumId, pollId, userId, dto);
  }
}
