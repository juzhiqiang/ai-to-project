import { Injectable } from '@nestjs/common';
import { OrchestratorService, type OrchestratorResult } from './agents/orchestrator.service';
import { FilesystemService, type FileWriteResult } from './filesystem/filesystem.service';
import { RunnableMemoryService, type MemoryMessage } from './memory/runnable-memory.service';

export interface AdvancedAnalysisResult {
  sessionId: string;
  input: string;
  context: string;
  orchestration: OrchestratorResult;
  ticket: FileWriteResult | null;
  memory: {
    appended: boolean;
  };
  report: string;
}

@Injectable()
export class AdvancedAnalysisService {
  constructor(
    private readonly memoryService: RunnableMemoryService,
    private readonly orchestratorService: OrchestratorService,
    private readonly filesystemService: FilesystemService,
  ) {}

  async analyze(sessionId: string, input: string): Promise<AdvancedAnalysisResult> {
    const history = await this.memoryService.getHistory(sessionId);
    const context = buildAnalysisContext(history, input);
    const orchestration = await this.orchestratorService.orchestrate(context);
    const report = buildFinalReport(orchestration);
    const ticket = await this.writeTicketIfReady(sessionId, orchestration, report);

    await this.memoryService.appendMessage(sessionId, input, report);

    return {
      sessionId,
      input,
      context,
      orchestration,
      ticket,
      memory: {
        appended: true,
      },
      report,
    };
  }

  private async writeTicketIfReady(sessionId: string, orchestration: OrchestratorResult, report: string) {
    if (orchestration.mode !== 'completed' || !report) {
      return null;
    }

    const ticketPath = buildTicketPath(sessionId, orchestration);

    return this.filesystemService.writeFile(ticketPath, report);
  }
}

function buildAnalysisContext(history: MemoryMessage[], input: string) {
  const historyContext = history.length > 0 ? history.map(formatHistoryMessage).join('\n') : '无历史上下文';

  return ['历史上下文：', historyContext, '', '当前输入：', input].join('\n');
}

function formatHistoryMessage(message: MemoryMessage) {
  return `${message.type}: ${message.content}`;
}

function buildFinalReport(orchestration: OrchestratorResult) {
  if (orchestration.mode === 'clarification') {
    return `请补充信息：${orchestration.clarificationQuestions.join('；')}`;
  }

  if (orchestration.mode === 'fallback') {
    return '系统暂时无法完成自动分析，已转人工复核。';
  }

  return orchestration.report;
}

function buildTicketPath(sessionId: string, orchestration: OrchestratorResult) {
  const orderId = extractOrderId(orchestration);
  const fileStem = sanitizePathSegment(orderId ?? sessionId);

  return `tickets/${fileStem}-analysis.md`;
}

function extractOrderId(orchestration: OrchestratorResult) {
  const extractStep = orchestration.steps.find((step) => step.agent === 'extractAgent');

  if (!extractStep) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stripJsonFence(extractStep.output)) as unknown;

    if (parsed && typeof parsed === 'object' && 'orderId' in parsed && typeof parsed.orderId === 'string') {
      return parsed.orderId;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function stripJsonFence(output: string) {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced ? fenced[1].trim() : trimmed;
}

function sanitizePathSegment(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  return sanitized || 'unknown-session';
}
