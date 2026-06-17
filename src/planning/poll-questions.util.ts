import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreatePlanningPollDto } from './dto/create-planning-poll.dto';
import type { PlanningPollQuestionInputDto } from './dto/create-planning-poll.dto';
import type { UpdatePlanningPollDto } from './dto/update-planning-poll.dto';
import { PlanningPollOption } from './entities/planning-poll-option.entity';
import { PlanningPollQuestion } from './entities/planning-poll-question.entity';
import { PlanningPoll } from './entities/planning-poll.entity';
import { AssemblyType } from './enums/assembly-type.enum';

export type ResolvedQuestionInput = {
  title: string;
  allowMultiple: boolean;
  options: { label: string }[];
};

export function sortedPollQuestions(poll: PlanningPoll): PlanningPollQuestion[] {
  const qs = [...(poll.questions ?? [])];
  qs.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const q of qs) {
    if (q.options?.length) {
      q.options.sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }
  return qs;
}

export function allPollOptions(poll: PlanningPoll): PlanningPollOption[] {
  return sortedPollQuestions(poll).flatMap((q) => q.options ?? []);
}

export function pollHasVoting(poll: PlanningPoll): boolean {
  return allPollOptions(poll).length > 0;
}

export function resolveQuestionInputsFromCreate(
  dto: CreatePlanningPollDto,
): ResolvedQuestionInput[] {
  if (dto.assemblyType === AssemblyType.Ata) {
    return [];
  }
  if (dto.questions?.length) {
    return normalizeQuestionInputs(dto.questions, dto.assemblyType);
  }
  if (dto.options?.length) {
    const allowMultiple = dto.allowMultiple ?? false;
    return normalizeQuestionInputs(
      [
        {
          title: dto.title.trim(),
          allowMultiple,
          options: dto.options,
        },
      ],
      dto.assemblyType,
    );
  }
  throw new BadRequestException(
    'Indique pelo menos uma deliberação em «questions» (ou «options» legado).',
  );
}

export function resolveQuestionInputsFromUpdate(
  dto: UpdatePlanningPollDto,
  poll: PlanningPoll,
  nextAssembly: AssemblyType,
): ResolvedQuestionInput[] | null {
  if (dto.questions !== undefined) {
    if (nextAssembly === AssemblyType.Ata) {
      if (dto.questions.length > 0) {
        throw new BadRequestException(
          'Pauta «Ata» não admite deliberações com voto no sistema.',
        );
      }
      return [];
    }
    return normalizeQuestionInputs(dto.questions, nextAssembly);
  }
  if (dto.options !== undefined) {
    if (nextAssembly === AssemblyType.Ata) {
      if (dto.options.length > 0) {
        throw new BadRequestException(
          'Pauta «Ata» não admite opções de voto no sistema.',
        );
      }
      return [];
    }
    const allowMultiple = dto.allowMultiple ?? poll.allowMultiple;
    return normalizeQuestionInputs(
      [
        {
          title: poll.title,
          allowMultiple,
          options: dto.options,
        },
      ],
      nextAssembly,
    );
  }
  return null;
}

function normalizeQuestionInputs(
  raw: PlanningPollQuestionInputDto[],
  assemblyType: AssemblyType,
): ResolvedQuestionInput[] {
  if (raw.length === 0) {
    throw new BadRequestException('Indique pelo menos uma deliberação.');
  }
  if (raw.length > 24) {
    throw new BadRequestException('Máximo de 24 deliberações por pauta.');
  }
  const out: ResolvedQuestionInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i];
    const title = q.title?.trim();
    if (!title) {
      throw new BadRequestException(
        `Deliberação ${i + 1}: indique o enunciado (título).`,
      );
    }
    const labels = (q.options ?? [])
      .map((o) => o.label.trim())
      .filter(Boolean);
    if (labels.length < 2) {
      throw new BadRequestException(
        `Deliberação «${title}»: indique pelo menos duas opções.`,
      );
    }
    if (labels.length > 24) {
      throw new BadRequestException(
        `Deliberação «${title}»: máximo de 24 opções.`,
      );
    }
    let allowMultiple = q.allowMultiple ?? false;
    if (
      assemblyType === AssemblyType.Election ||
      assemblyType === AssemblyType.Ata
    ) {
      allowMultiple = false;
    }
    if (assemblyType === AssemblyType.Election && allowMultiple) {
      throw new BadRequestException(
        'Eleições utilizam escolha única por unidade em cada deliberação.',
      );
    }
    out.push({
      title,
      allowMultiple,
      options: labels.map((label) => ({ label })),
    });
  }
  return out;
}

export function buildQuestionEntities(
  pollId: string,
  inputs: ResolvedQuestionInput[],
): PlanningPollQuestion[] {
  return inputs.map((q, qi) => {
    const questionId = randomUUID();
    return {
      id: questionId,
      pollId,
      title: q.title,
      sortOrder: qi,
      allowMultiple: q.allowMultiple,
      decidedOptionId: null,
      options: q.options.map((o, oi) =>
        ({
          id: randomUUID(),
          pollId,
          questionId,
          label: o.label,
          sortOrder: oi,
        }) satisfies Partial<PlanningPollOption> as PlanningPollOption,
      ),
    } satisfies Partial<PlanningPollQuestion> as PlanningPollQuestion;
  });
}

export function allQuestionsDecided(poll: PlanningPoll): boolean {
  const qs = sortedPollQuestions(poll);
  if (qs.length === 0) {
    return false;
  }
  return qs.every((q) => !!q.decidedOptionId);
}

/** Itens numerados para «Ordem do dia» em atas e PDF. */
export function buildPollOrdemDiaLines(poll: PlanningPoll): string[] {
  if (poll.assemblyType === AssemblyType.Ata) {
    return [`1. ${poll.title}`];
  }
  const out: string[] = [];
  const questions = sortedPollQuestions(poll);
  if (questions.length > 1) {
    let i = 1;
    for (const q of questions) {
      out.push(`${i}. ${q.title}`);
      i += 1;
    }
    return out;
  }
  if (questions.length === 1) {
    const opts = [...(questions[0].options ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    if (opts.length > 0) {
      let i = 1;
      for (const o of opts) {
        out.push(`${i}. ${o.label}`);
        i += 1;
      }
      return out;
    }
    return [`1. ${questions[0].title}`];
  }
  return [`1. ${poll.title}`];
}
