import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MeetingMinutesGenerationContext = {
  pollTitle: string;
  pollBodyPlain: string;
  competenceDate: string;
  assemblyType: string;
  ordemDiaLines: string[];
  voteSummaryPlain: string;
  meetingNotes: { createdAt: string; text: string }[];
  currentMinutesPlain: string;
};

export type MeetingMinutesGenerationResult = {
  body: string;
  aiEnhanced: true;
};

type ChatLlmConfig = {
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
  providerLabel: string;
};

@Injectable()
export class PlanningAiService {
  private readonly logger = new Logger(PlanningAiService.name);

  constructor(private readonly config: ConfigService) {}

  async generateMeetingMinutesHtml(
    ctx: MeetingMinutesGenerationContext,
  ): Promise<MeetingMinutesGenerationResult> {
    const llm = this.resolveChatLlmConfig();
    if (!llm) {
      throw new BadRequestException(
        'A geração da ata com IA exige DEEPSEEK_API_KEY no ficheiro .env da API (recomendado) ou OPENAI_API_KEY como alternativa.',
      );
    }

    const formalDiscussions = await this.rewriteDiscussionsWithLlm(ctx, llm);
    const html = this.assembleFormalMinutesHtml(ctx, formalDiscussions);
    return { body: html, aiEnhanced: true };
  }

  private resolveChatLlmConfig(): ChatLlmConfig | null {
    const deepseekKey =
      this.config.get<string>('DEEPSEEK_API_KEY')?.trim() ||
      this.config.get<string>('DEEPSEEK_KEY')?.trim();
    if (deepseekKey) {
      const base =
        this.config.get<string>('DEEPSEEK_API_BASE_URL')?.trim() ||
        'https://api.deepseek.com';
      return {
        apiKey: deepseekKey,
        chatCompletionsUrl: this.chatCompletionsUrl(base),
        model:
          this.config.get<string>('DEEPSEEK_MINUTES_MODEL')?.trim() ||
          this.config.get<string>('DEEPSEEK_MODEL')?.trim() ||
          'deepseek-chat',
        providerLabel: 'DeepSeek',
      };
    }

    const openaiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (openaiKey) {
      const base =
        this.config.get<string>('OPENAI_API_BASE_URL')?.trim() ||
        'https://api.openai.com/v1';
      return {
        apiKey: openaiKey,
        chatCompletionsUrl: this.chatCompletionsUrl(base),
        model:
          this.config.get<string>('OPENAI_MINUTES_MODEL')?.trim() ||
          this.config.get<string>('OPENAI_MODEL')?.trim() ||
          'gpt-4o',
        providerLabel: 'OpenAI',
      };
    }

    return null;
  }

  private chatCompletionsUrl(baseUrl: string): string {
    const base = baseUrl.replace(/\/$/, '');
    if (base.endsWith('/v1')) {
      return `${base}/chat/completions`;
    }
    return `${base}/chat/completions`;
  }

  /**
   * Chamada dedicada à IA: reescreve anotações/pauta em prosa formal de «Discussões e deliberações».
   */
  private async rewriteDiscussionsWithLlm(
    ctx: MeetingMinutesGenerationContext,
    llm: ChatLlmConfig,
  ): Promise<string> {
    const notesBlock = ctx.meetingNotes.length
      ? ctx.meetingNotes
          .map(
            (n, i) =>
              `[Anotação ${i + 1}] ${n.text.replace(/\s+/g, ' ').trim()}`,
          )
          .join('\n')
      : '(nenhuma anotação registada)';

    const ordemDia = ctx.ordemDiaLines.length
      ? ctx.ordemDiaLines.join('\n')
      : `1. ${ctx.pollTitle}`;

    const system = [
      'Você é redator jurídico-administrativo de atas de assembleia de condomínio no Brasil.',
      '',
      'TAREFA ÚNICA: redigir APENAS a secção «Discussões e deliberações» da ata, em português formal brasileiro de altíssima qualidade.',
      '',
      'REGRAS ABSOLUTAS:',
      '1. PROIBIDO copiar ou colar frases das anotações ou da pauta — reescreva TUDO com suas próprias palavras.',
      '2. PROIBIDO listar anotações com data/hora ou formato de diário («às 15:30 disse-se…»).',
      '3. PROIBIDO markdown, HTML, títulos ou listas numeradas — apenas parágrafos em texto corrido.',
      '4. Tom impessoal e solene (terceira pessoa): «deliberou-se», «foi aprovado», «registrou-se», «decidiu-se».',
      '5. Ortografia, concordância, regência e pontuação impecáveis.',
      '6. Não invente nomes, valores, datas ou decisões ausentes do contexto.',
      '7. Integre naturalmente os resultados de votação, se fornecidos.',
      '8. Produza entre 2 e 8 parágrafos coesos, prontos para constar da ata assinada.',
    ].join('\n');

    const user = [
      `Título da pauta: ${ctx.pollTitle}`,
      `Tipo: ${this.assemblyTypeLabelPt(ctx.assemblyType)}`,
      `Competência: ${ctx.competenceDate}`,
      '',
      '--- Ordem do dia (contexto; não repetir como lista) ---',
      ordemDia,
      '',
      '--- Pauta original (contexto; reescrever, não copiar) ---',
      ctx.pollBodyPlain || '(sem texto)',
      '',
      '--- Anotações brutas (fonte factual; REESCREVER integralmente) ---',
      notesBlock,
      '',
      '--- Resultados de votação (incorporar na narrativa, se houver) ---',
      ctx.voteSummaryPlain || '(sem votos)',
      '',
      '--- Rascunho anterior de discussões (pode ser totalmente substituído) ---',
      this.extractPriorDiscussionsPlain(ctx.currentMinutesPlain) ||
        '(sem rascunho)',
      '',
      'Redija somente o texto da secção Discussões e deliberações, em parágrafos separados por linha em branco.',
    ].join('\n');

    const raw = await this.callChatCompletions(
      llm,
      system,
      user,
      0.2,
    );
    const paragraphs = this.normalizeDiscussionParagraphs(raw);
    if (!paragraphs.length) {
      throw new ServiceUnavailableException(
        'A IA não devolveu texto para Discussões e deliberações. Tente novamente.',
      );
    }
    return paragraphs.join('\n\n');
  }

  private assembleFormalMinutesHtml(
    ctx: MeetingMinutesGenerationContext,
    formalDiscussionsPlain: string,
  ): string {
    const assemblyLabel = this.assemblyTypeLabelPt(ctx.assemblyType);
    const competenceBr = this.formatCompetenceDatePt(ctx.competenceDate);
    const parts: string[] = [];

    parts.push(
      `<h2>Ata de ${this.escapeHtml(assemblyLabel)} — ${this.escapeHtml(ctx.pollTitle)}</h2>`,
    );
    parts.push(
      `<p>Aos ${this.escapeHtml(competenceBr)}, reuniu-se o condomínio em ${this.escapeHtml(assemblyLabel.toLowerCase())}, conforme convocação e ordem do dia abaixo, sob a presidência do síndico, com a participação dos condôminos presentes.</p>`,
    );

    parts.push('<h3>Ordem do dia</h3>');
    if (ctx.ordemDiaLines.length) {
      parts.push('<ol>');
      for (const line of ctx.ordemDiaLines) {
        const item = line.replace(/^\d+\.\s*/, '').trim();
        parts.push(`<li>${this.escapeHtml(item)}</li>`);
      }
      parts.push('</ol>');
    } else {
      parts.push(`<p>${this.escapeHtml(ctx.pollTitle)}.</p>`);
    }

    parts.push('<h3>Discussões e deliberações</h3>');
    for (const para of formalDiscussionsPlain.split(/\n{2,}/)) {
      const t = para.trim();
      if (t) {
        parts.push(`<p>${this.escapeHtml(t).replace(/\n/g, '<br>')}</p>`);
      }
    }

    if (ctx.voteSummaryPlain.trim()) {
      parts.push('<h3>Resultados da votação</h3>');
      parts.push(
        `<p>${this.escapeHtml(this.summarizeVotesFormal(ctx.voteSummaryPlain)).replace(/\n/g, '<br>')}</p>`,
      );
    }

    parts.push('<h3>Encerramento</h3>');
    parts.push(
      '<p>Nada mais havendo a tratar, a reunião foi encerrada. Lavrou-se a presente ata, que, depois de lida e achada conforme, segue assinada pelos presentes na forma da lei e da convenção do condomínio.</p>',
    );

    return parts.join('\n');
  }

  private summarizeVotesFormal(voteSummaryPlain: string): string {
    const lines = voteSummaryPlain
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      return '';
    }
    return `Conforme apuração registada no sistema, ${lines.join('; ')}.`;
  }

  private extractPriorDiscussionsPlain(currentMinutesPlain: string): string {
    const t = currentMinutesPlain.trim();
    if (!t) {
      return '';
    }
    const markers = [
      /discuss[oõ]es\s+e\s+delibera[cç][oõ]es/i,
      /resultados\s+da\s+vota[cç][aã]o/i,
      /encerramento/i,
    ];
    const lower = t.toLowerCase();
    let start = -1;
    for (const re of markers) {
      const m = lower.match(re);
      if (m?.index !== undefined) {
        start = m.index + m[0].length;
        break;
      }
    }
    if (start < 0) {
      return t;
    }
    let end = t.length;
    for (const re of markers.slice(1)) {
      const rest = t.slice(start);
      const m = rest.toLowerCase().match(re);
      if (m?.index !== undefined && m.index > 0) {
        end = start + m.index;
        break;
      }
    }
    return t.slice(start, end).trim();
  }

  private normalizeDiscussionParagraphs(raw: string): string[] {
    let t = raw.trim();
    t = t.replace(/^```(?:text|markdown)?\s*/i, '').replace(/```\s*$/i, '');
    t = t.replace(/<[^>]+>/g, ' ');
    t = t.replace(/\r\n/g, '\n');
    const blocks = t
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 20);
    return blocks;
  }

  private async callChatCompletions(
    llm: ChatLlmConfig,
    system: string,
    user: string,
    temperature: number,
  ): Promise<string> {
    const res = await fetch(llm.chatCompletionsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: llm.model,
        temperature,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.warn(
        `${llm.providerLabel} HTTP ${res.status}: ${errText.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException(
        `Não foi possível contactar a IA (${llm.providerLabel}) para formalizar a ata. Verifique a chave e o modelo no .env e tente novamente.`,
      );
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      throw new ServiceUnavailableException('Resposta vazia da IA.');
    }
    return content;
  }

  private assemblyTypeLabelPt(assemblyType: string): string {
    switch (assemblyType) {
      case 'extraordinary':
        return 'Assembleia Geral Extraordinária';
      case 'election':
        return 'Assembleia de Eleição';
      case 'ata':
        return 'Reunião de Registro de Ata';
      case 'ordinary':
      default:
        return 'Assembleia Geral Ordinária';
    }
  }

  private formatCompetenceDatePt(ymd: string): string {
    const head = (ymd ?? '').trim().slice(0, 10);
    const m = head.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return '___ de _____________ de ______';
    }
    const months = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ];
    const day = Number(m[3]);
    const monthIdx = Number(m[2]) - 1;
    const year = m[1];
    const month = months[monthIdx] ?? '_________';
    return `${day} dias do mês de ${month} de ${year}`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
