import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Condominium } from '../condominiums/condominium.entity';
import {
  AiDraftPollDto,
  AiDraftPollResultDto,
} from './dto/ai-draft-poll.dto';
import {
  AiMergeMeetingMinutesDto,
  AiMergeMeetingMinutesResultDto,
} from './dto/ai-merge-meeting-minutes.dto';
import { PlanningPoll } from './entities/planning-poll.entity';
import { AssemblyType } from './enums/assembly-type.enum';
import { GovernanceService } from './governance.service';
import { PlanningPollsService } from './planning-polls.service';
import { sanitizePollBodyRich } from './poll-body-sanitize';
import {
  pollHasVoting,
  sortedPollQuestions,
} from './poll-questions.util';

const SYSTEM_PROMPT = `Você é redator jurídico-administrativo especializado em assembleias de condomínio edilício no Brasil (Lei nº 4.591/1964 e prática condominial).

Objetivo: produzir PAUTA FORMAL, COMPLETA e APTA A DELIBERAÇÃO, não um resumo curto.

Estilo e extensão:
- Português do Brasil, tom solene, impessoal e técnico (terceira pessoa; evite "você", "a gente").
- O body deve ter NO MÍNIMO 450 palavras (salvo tipo "ata" com registro simples: mínimo 250 palavras).
- Frases completas; parágrafos desenvolvidos; vocabulário de assembleia ("deliberar", "homologar", "ratificar", "condôminos", "administração condominial").
- Não invente fatos, valores, nomes de empresas, datas ou cláusulas que o usuário não informou. Onde faltar dado, use formulação condicional: "conforme documentação a ser apresentada", "nos termos do orçamento apresentado", "a definir em ata".
- Não cite artigos de lei específicos se não tiver certeza; prefira "em conformidade com a legislação aplicável e a convenção do condomínio".

HTML do body (obrigatório usar estas seções com <h3>):
Para assemblyType "ordinary" ou "election":
  <h3>1. Objeto da deliberação</h3>
  <h3>2. Contexto e antecedentes</h3>
  <h3>3. Exposição dos fatos</h3>
  <h3>4. Fundamentação e justificativa</h3>
  <h3>5. Proposta submetida à assembleia</h3>
  <h3>6. Impacto financeiro, contratual e operacional</h3> (se não houver impacto financeiro, explique por que a matéria é administrativa/operacional)
  <h3>7. Documentação de apoio</h3>
  <h3>8. Questão a ser submetida ao voto</h3> (redija a pergunta formal que os condôminos deliberarão)
Use também <p>, <strong>, <ul>, <li>, <ol> quando couber. Sem scripts, imagens ou links.

Para assemblyType "ata":
  <h3>1. Identificação da reunião/assembleia</h3>
  <h3>2. Pauta dos assuntos tratados</h3>
  <h3>3. Síntese das discussões</h3>
  <h3>4. Encaminhamentos e conclusões</h3>
  <h3>5. Observações para registro</h3>

assemblyType:
- "ordinary": deliberação com voto (contratos, obras, aprovações, alterações de regra interna etc.).
- "election": eleição de pessoas/cargos (síndico, conselho etc.).
- "ata": registro de reunião sem votação no sistema.

Deliberações (campo questions):
- Uma pauta pode ter VÁRIAS deliberações independentes (cada uma com enunciado, opções e modo de voto).
- "ata": questions = [] (sem votação no sistema).
- Cada item em questions: { "title": "enunciado formal", "allowMultiple": false, "options": ["...", "..."] }.
- "election": allowMultiple = false em cada deliberação; options = nomes de candidatos.
- "ordinary": allowMultiple = true SOMENTE se aquela deliberação específica permitir várias marcações; na dúvida, false.
  Opções formais sugeridas por deliberação:
  - "Aprovar a proposta na forma apresentada"
  - "Reprovar a proposta"
  - "Abster-se da deliberação"
  (mínimo 2 opções por deliberação, máximo 6)
- Se o pedido do síndico mencionar vários assuntos distintos, crie uma deliberação (question) para cada um.

title: até 120 caracteres; título geral da pauta/assembleia (não repita cada deliberação).

Responda SOMENTE com JSON válido, sem markdown, no formato:
{"title":"...","body":"<h3>1. Objeto...</h3><p>...</p>...","assemblyType":"ordinary|election|ata","questions":[{"title":"...","allowMultiple":false,"options":["..."]}]}`;

const MEETING_MERGE_SYSTEM_PROMPT = `Você auxilia o síndico a redigir o RASCUNHO DE ATA de assembleia/reunião de condomínio edilício no Brasil, durante a reunião em tempo real.

O síndico digita anotações soltas e informais. Você deve MESCLAR cada nova anotação ao rascunho HTML existente, formatando de forma amigável, clara e profissional (português do Brasil, terceira pessoa, tom de ata).

Regras:
- Preserve o conteúdo já redigido; integre a nova informação sem apagar fatos anteriores, salvo correção explícita na nova anotação.
- Organize o texto com seções <h3> quando fizer sentido:
  <h3>1. Identificação da reunião/assembleia</h3>
  <h3>2. Pauta dos assuntos tratados</h3>
  <h3>3. Síntese das discussões</h3>
  <h3>4. Deliberações e encaminhamentos</h3>
  <h3>5. Observações para registro</h3>
- Use <p>, <ul>, <li>, <ol>, <strong> conforme necessário. Sem scripts, imagens ou links.
- Não invente nomes, valores, datas ou decisões que não constem do rascunho ou da nova anotação.
- Se o rascunho estiver vazio, inicie a estrutura a partir da primeira anotação.
- Texto legível para impressão posterior; parágrafos curtos e objetivos.

Votos (campo votes):
- Se a anotação pedir para REGISTAR ou ALTERAR votos de unidades (ex.: "apt 101 aprovou deliberação 1", "unidade 202 reprovou item 2", "101 votou a favor na primeira"), extraia em votes.
- Use os índices 1-based do catálogo de deliberações e opções fornecido pelo utilizador.
- unitIdentifier: texto da unidade tal como no catálogo (ex. "101", "Bloco A - 201").
- selections: lista de {questionIndex, optionIndex} para cada deliberação mencionada na anotação.
- Sinónimos: "aprovar"/"a favor"/"sim" → opção de aprovação; "reprovar"/"contra"/"não" → reprovação; "abster" → abstenção.
- Se a anotação não contiver instruções de voto, votes = [].
- Não invente votos que não estejam na anotação.

Responda SOMENTE com JSON válido, sem markdown:
{"body":"<html>...</html>","votes":[{"unitIdentifier":"101","selections":[{"questionIndex":1,"optionIndex":1}]}]}`;

/** Texto mínimo (sem tags) para considerar a redação suficientemente completa. */
const MIN_BODY_PLAIN_LEN = 380;
const MIN_BODY_PLAIN_LEN_ATA = 200;

type DeepSeekChatResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

type RawAiDraft = {
  title?: unknown;
  body?: unknown;
  assemblyType?: unknown;
  allowMultiple?: unknown;
  options?: unknown;
  questions?: unknown;
};

type RawMeetingMerge = {
  body?: unknown;
  votes?: unknown;
};

type RawAiMeetingVote = {
  unitIdentifier?: unknown;
  selections?: unknown;
};

type RawAiMeetingVoteSelection = {
  questionIndex?: unknown;
  optionIndex?: unknown;
};

@Injectable()
export class PollAiDraftService {
  constructor(
    private readonly config: ConfigService,
    private readonly governance: GovernanceService,
    private readonly polls: PlanningPollsService,
    @InjectRepository(Condominium)
    private readonly condominiumRepo: Repository<Condominium>,
    @InjectRepository(PlanningPoll)
    private readonly pollRepo: Repository<PlanningPoll>,
  ) {}

  async generateDraft(
    condominiumId: string,
    userId: string,
    dto: AiDraftPollDto,
  ): Promise<AiDraftPollResultDto> {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);

    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Assistente de IA não configurado (DEEPSEEK_API_KEY).',
      );
    }

    const condo = await this.condominiumRepo.findOne({
      where: { id: condominiumId },
      select: ['id', 'name'],
    });
    const condoName = condo?.name?.trim() || 'condomínio';

    const baseUrl =
      this.config.get<string>('DEEPSEEK_API_BASE_URL')?.trim() ||
      'https://api.deepseek.com';
    const model =
      this.config.get<string>('DEEPSEEK_MODEL')?.trim() || 'deepseek-chat';

    const userContent = [
      `Condomínio: ${condoName}`,
      dto.assemblyType
        ? `Tipo de assembleia solicitado: ${dto.assemblyType}`
        : 'Tipo de assembleia: inferir pelo texto.',
      '',
      'Instrução: elabore pauta FORMAL e COMPLETA, com todas as seções obrigatórias do system prompt.',
      'Desenvolva cada seção com parágrafos detalhados; não entregue texto telegráfico.',
      '',
      'Informações fornecidas pelo síndico:',
      dto.brief.trim(),
    ].join('\n');

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    let parsed = await this.requestDraftJson(
      baseUrl,
      apiKey,
      model,
      messages,
    );

    const assemblyType = this.resolveAssemblyType(
      parsed.assemblyType,
      dto.assemblyType,
    );
    const minLen =
      assemblyType === AssemblyType.Ata
        ? MIN_BODY_PLAIN_LEN_ATA
        : MIN_BODY_PLAIN_LEN;
    const plainLen = this.plainTextLength(String(parsed.body ?? ''));

    if (plainLen < minLen) {
      messages.push({
        role: 'assistant',
        content: JSON.stringify(parsed),
      });
      messages.push({
        role: 'user',
        content:
          'A redação anterior ficou curta e informal demais para uma assembleia condominial. ' +
          'Reescreva o JSON completo com tom solene, todas as seções <h3> obrigatórias e corpo ' +
          `com pelo menos ${assemblyType === AssemblyType.Ata ? 250 : 450} palavras no campo body. ` +
          'Mantenha apenas fatos fornecidos pelo síndico; não invente dados.',
      });
      parsed = await this.requestDraftJson(baseUrl, apiKey, model, messages);
    }

    return this.normalizeDraft(parsed, dto.assemblyType);
  }

  async mergeMeetingMinutesNote(
    condominiumId: string,
    pollId: string,
    userId: string,
    dto: AiMergeMeetingMinutesDto,
  ): Promise<AiMergeMeetingMinutesResultDto> {
    await this.governance.assertSyndicOrOwner(condominiumId, userId);

    const poll = await this.pollRepo.findOne({
      where: { id: pollId, condominiumId },
      relations: { condominium: true, questions: { options: true } },
    });
    if (!poll) {
      throw new NotFoundException('Pauta não encontrada.');
    }
    sortedPollQuestions(poll);

    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Assistente de IA não configurado (DEEPSEEK_API_KEY).',
      );
    }

    const condoName =
      poll.condominium?.name?.trim() ||
      (
        await this.condominiumRepo.findOne({
          where: { id: condominiumId },
          select: ['name'],
        })
      )?.name?.trim() ||
      'condomínio';

    const baseUrl =
      this.config.get<string>('DEEPSEEK_API_BASE_URL')?.trim() ||
      'https://api.deepseek.com';
    const model =
      this.config.get<string>('DEEPSEEK_MODEL')?.trim() || 'deepseek-chat';

    const currentHtml = String(dto.currentBodyHtml ?? '').trim();
    const note = dto.note.trim();
    const competence = String(poll.competenceDate ?? '').trim().slice(0, 10);

    const votingCatalog = pollHasVoting(poll)
      ? await this.buildMeetingVoteCatalog(condominiumId, userId, poll)
      : '';

    const userContent = [
      `Condomínio: ${condoName}`,
      `Título da pauta/reunião: ${poll.title}`,
      `Tipo de assembleia: ${poll.assemblyType}`,
      competence ? `Data de competência: ${competence}` : '',
      '',
      votingCatalog,
      'Rascunho actual da ata (HTML; pode estar vazio):',
      currentHtml || '(vazio)',
      '',
      'Nova anotação informal do síndico (incorporar ao rascunho e, se houver, executar votos):',
      note,
      '',
      'Formate a nova informação de modo amigável e mescle no rascunho completo.',
    ]
      .filter(Boolean)
      .join('\n');

    const parsed = await this.requestDraftJson(
      baseUrl,
      apiKey,
      model,
      [
        { role: 'system', content: MEETING_MERGE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      0.18,
      3072,
    );

    const body = sanitizePollBodyRich(
      (parsed as RawMeetingMerge).body == null
        ? null
        : String((parsed as RawMeetingMerge).body),
    );
    if (!body?.trim()) {
      throw new BadRequestException(
        'A IA não gerou conteúdo para o rascunho da ata.',
      );
    }

    const voteEntries = this.normalizeMeetingVoteEntries(
      (parsed as RawMeetingMerge).votes,
    );
    const votesApplied =
      voteEntries.length > 0
        ? await this.polls.applyAiMeetingVotes(
            condominiumId,
            pollId,
            userId,
            voteEntries,
          )
        : undefined;

    return { body, ...(votesApplied?.length ? { votesApplied } : {}) };
  }

  private async buildMeetingVoteCatalog(
    condominiumId: string,
    userId: string,
    poll: PlanningPoll,
  ): Promise<string> {
    const questions = sortedPollQuestions(poll);
    const units = await this.polls.myVotableUnits(condominiumId, userId);
    const lines: string[] = [
      'Catálogo para registo de votos (índices 1-based):',
      '',
      'Deliberações:',
    ];
    questions.forEach((q, qi) => {
      const opts = q.options ?? [];
      const optText = opts
        .map((o, oi) => `${oi + 1}) ${o.label}`)
        .join('; ');
      lines.push(`${qi + 1}. «${q.title}» — opções: ${optText}`);
    });
    lines.push('');
    lines.push(
      'Unidades (use o identificador exacto em unitIdentifier; entre parênteses o responsável):',
      units
        .map((u) =>
          u.responsibleName?.trim()
            ? `${u.identifier} (${u.responsibleName.trim()})`
            : u.identifier,
        )
        .join(', ') || '(nenhuma)',
    );
    lines.push('');
    return lines.join('\n');
  }

  private normalizeMeetingVoteEntries(
    raw: unknown,
  ): {
    unitIdentifier: string;
    selections: { questionIndex: number; optionIndex: number }[];
  }[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: {
      unitIdentifier: string;
      selections: { questionIndex: number; optionIndex: number }[];
    }[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const row = item as RawAiMeetingVote;
      const unitIdentifier = String(row.unitIdentifier ?? '').trim();
      if (!unitIdentifier) {
        continue;
      }
      const selections: { questionIndex: number; optionIndex: number }[] = [];
      if (Array.isArray(row.selections)) {
        for (const sel of row.selections) {
          if (!sel || typeof sel !== 'object') {
            continue;
          }
          const s = sel as RawAiMeetingVoteSelection;
          const questionIndex = Number(s.questionIndex);
          const optionIndex = Number(s.optionIndex);
          if (
            !Number.isFinite(questionIndex) ||
            !Number.isFinite(optionIndex) ||
            questionIndex < 1 ||
            optionIndex < 1
          ) {
            continue;
          }
          selections.push({
            questionIndex: Math.trunc(questionIndex),
            optionIndex: Math.trunc(optionIndex),
          });
        }
      }
      if (selections.length === 0) {
        continue;
      }
      out.push({ unitIdentifier, selections });
    }
    return out;
  }

  private async requestDraftJson(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[],
    temperature = 0.22,
    maxTokens = 4096,
  ): Promise<RawAiDraft> {
    const controller = new AbortController();
    const timeoutMs = Number(
      this.config.get<string>('DEEPSEEK_TIMEOUT_MS') ?? 90_000,
    );
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Tempo esgotado ao contactar a IA.'
          : 'Falha de rede ao contactar a IA.';
      throw new BadGatewayException(msg);
    } finally {
      clearTimeout(timer);
    }

    const payload = (await response.json()) as DeepSeekChatResponse;
    if (!response.ok) {
      const detail =
        payload.error?.message ||
        `Resposta HTTP ${response.status} da IA.`;
      throw new BadGatewayException(detail);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new BadGatewayException('A IA não devolveu conteúdo.');
    }

    try {
      return this.parseJsonObject(content) as RawAiDraft;
    } catch {
      throw new BadGatewayException(
        'Resposta da IA em formato inválido. Tente novamente.',
      );
    }
  }

  private plainTextLength(html: string): number {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim().length;
  }

  private parseJsonObject(text: string): unknown {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    const raw = fenced ? fenced[1].trim() : trimmed;
    return JSON.parse(raw);
  }

  private normalizeDraft(
    raw: RawAiDraft,
    requestedType?: AssemblyType,
  ): AiDraftPollResultDto {
    const title = String(raw.title ?? '').trim();
    if (!title) {
      throw new BadRequestException('A IA não gerou um título.');
    }
    if (title.length > 512) {
      throw new BadRequestException('Título gerado excede o limite.');
    }

    const assemblyType = this.resolveAssemblyType(raw.assemblyType, requestedType);
    const body = sanitizePollBodyRich(
      raw.body == null ? null : String(raw.body),
    );

    const questions = this.normalizeQuestions(
      raw,
      assemblyType,
      title,
      raw.allowMultiple === true,
    );

    return {
      title,
      body,
      assemblyType,
      questions,
    };
  }

  private normalizeQuestions(
    raw: RawAiDraft,
    assemblyType: AssemblyType,
    pollTitle: string,
    legacyAllowMultiple: boolean,
  ): AiDraftPollResultDto['questions'] {
    if (assemblyType === AssemblyType.Ata) {
      return [];
    }

    const rawRecord = raw as Record<string, unknown>;
    const rawQuestions = Array.isArray(raw.questions)
      ? raw.questions
      : Array.isArray(rawRecord.deliberations)
        ? rawRecord.deliberations
        : Array.isArray(rawRecord.deliberacoes)
          ? rawRecord.deliberacoes
          : null;
    if (rawQuestions?.length) {
      const out: AiDraftPollResultDto['questions'] = [];
      for (let i = 0; i < rawQuestions.length; i++) {
        const item = rawQuestions[i] as Record<string, unknown>;
        const qTitle =
          String(item.title ?? item.question ?? item.enunciado ?? '').trim() ||
          `${pollTitle} — item ${i + 1}`;
        let allowMultiple = item.allowMultiple === true;
        if (assemblyType === AssemblyType.Election) {
          allowMultiple = false;
        }
        const options = this.normalizeOptionLabels(
          item.options ?? item.choices ?? item.alternatives,
        );
        if (options.length < 2) {
          throw new BadRequestException(
            `A IA não gerou opções suficientes na deliberação «${qTitle}».`,
          );
        }
        out.push({
          title: qTitle.slice(0, 512),
          allowMultiple,
          options: options.slice(0, 24),
        });
      }
      if (out.length > 24) {
        return out.slice(0, 24);
      }
      return out;
    }

    const options = this.normalizeOptionLabels(raw.options);
    if (options.length < 2) {
      throw new BadRequestException(
        'A IA não gerou deliberações com opções suficientes. Tente descrever melhor o assunto.',
      );
    }
    let allowMultiple = legacyAllowMultiple;
    if (assemblyType === AssemblyType.Election) {
      allowMultiple = false;
    }
    return [
      {
        title: pollTitle.slice(0, 512),
        allowMultiple,
        options: options.slice(0, 24),
      },
    ];
  }

  private resolveAssemblyType(
    raw: unknown,
    requested?: AssemblyType,
  ): AssemblyType {
    if (requested) {
      return requested;
    }
    const s = String(raw ?? '').trim();
    if (s === AssemblyType.Election) return AssemblyType.Election;
    if (s === AssemblyType.Ata) return AssemblyType.Ata;
    return AssemblyType.Ordinary;
  }

  private normalizeOptionLabels(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: string[] = [];
    for (const item of raw) {
      const label = this.extractOptionLabel(item);
      if (!label) continue;
      if (label.length > 512) continue;
      out.push(label);
    }
    return out;
  }

  private extractOptionLabel(item: unknown): string {
    if (typeof item === 'string') {
      return item.trim();
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      for (const key of ['label', 'text', 'name', 'value', 'title']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) {
          return v.trim();
        }
      }
    }
    const s = String(item ?? '').trim();
    return s === '[object Object]' ? '' : s;
  }
}
