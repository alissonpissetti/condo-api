import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  sanitizePollBodyRich,
  stripPollBodyToPlainText,
} from './poll-body-sanitize';

export type MeetingMinutesGenerationContext = {
  pollTitle: string;
  pollBodyPlain: string;
  competenceDate: string;
  assemblyType: string;
  voteSummaryPlain: string;
  meetingNotes: { createdAt: string; text: string }[];
  currentMinutesPlain: string;
};

@Injectable()
export class PlanningAiService {
  private readonly logger = new Logger(PlanningAiService.name);

  constructor(private readonly config: ConfigService) {}

  async generateMeetingMinutesHtml(
    ctx: MeetingMinutesGenerationContext,
  ): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (apiKey) {
      try {
        return await this.generateWithOpenAi(ctx, apiKey);
      } catch (err) {
        this.logger.warn(
          `OpenAI indisponível; usando geração local. ${String(err)}`,
        );
      }
    }
    return this.generateDeterministicHtml(ctx);
  }

  private async generateWithOpenAi(
    ctx: MeetingMinutesGenerationContext,
    apiKey: string,
  ): Promise<string> {
    const model =
      this.config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
    const notesBlock = ctx.meetingNotes.length
      ? ctx.meetingNotes
          .map(
            (n, i) =>
              `${i + 1}. [${n.createdAt}] ${n.text.replace(/\s+/g, ' ').trim()}`,
          )
          .join('\n')
      : '(nenhuma anotação registrada)';

    const system = [
      'Você redige atas de assembleia condominial em português do Brasil.',
      'Produza HTML seguro (apenas p, h2, h3, ul, ol, li, strong, em, br) sem scripts.',
      'Integre TODAS as anotações da reunião de forma coerente e cronológica quando possível.',
      'Não invente fatos ausentes no contexto; use linguagem formal e objetiva.',
      'Inclua seções claras: abertura, ordem do dia, deliberações/ocorrências, encerramento.',
    ].join(' ');

    const user = [
      `Título da pauta: ${ctx.pollTitle}`,
      `Competência: ${ctx.competenceDate}`,
      `Tipo: ${ctx.assemblyType}`,
      '',
      '--- Pauta original ---',
      ctx.pollBodyPlain || '(sem texto)',
      '',
      '--- Anotações da reunião (fonte principal) ---',
      notesBlock,
      '',
      '--- Resultados de votação (se houver) ---',
      ctx.voteSummaryPlain || '(sem votos registrados)',
      '',
      '--- Rascunho anterior da ata (referência; pode ser reescrito) ---',
      ctx.currentMinutesPlain || '(vazio)',
      '',
      'Gere a ata final completa em HTML.',
    ].join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      throw new Error('Resposta vazia da OpenAI');
    }
    const html = sanitizePollBodyRich(raw) ?? this.generateDeterministicHtml(ctx);
    return html;
  }

  private generateDeterministicHtml(
    ctx: MeetingMinutesGenerationContext,
  ): string {
    const parts: string[] = [];
    parts.push(`<h2>Ata — ${this.escapeHtml(ctx.pollTitle)}</h2>`);
    parts.push(
      `<p><strong>Competência:</strong> ${this.escapeHtml(ctx.competenceDate)}</p>`,
    );
    if (ctx.pollBodyPlain.trim()) {
      parts.push('<h3>Pauta original</h3>');
      parts.push(
        `<p>${this.escapeHtml(ctx.pollBodyPlain).replace(/\n/g, '<br>')}</p>`,
      );
    }
    if (ctx.meetingNotes.length) {
      parts.push('<h3>Ocorrências e deliberações</h3>');
      parts.push('<ol>');
      for (const n of ctx.meetingNotes) {
        const when = new Date(n.createdAt).toLocaleString('pt-BR');
        parts.push(
          `<li><em>${this.escapeHtml(when)}</em> — ${this.escapeHtml(n.text).replace(/\n/g, '<br>')}</li>`,
        );
      }
      parts.push('</ol>');
    } else {
      parts.push('<p><em>Sem anotações registradas na reunião.</em></p>');
    }
    if (ctx.voteSummaryPlain.trim()) {
      parts.push('<h3>Resultados de votação</h3>');
      parts.push(
        `<p>${this.escapeHtml(ctx.voteSummaryPlain).replace(/\n/g, '<br>')}</p>`,
      );
    }
    parts.push('<h3>Encerramento</h3>');
    parts.push(
      '<p>Nada mais havendo a tratar, a reunião foi encerrada. A presente ata foi lavrada com base nas anotações registradas.</p>',
    );
    return parts.join('\n');
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
