import { Injectable } from '@nestjs/common';
import { type AIUIResponse, type UIAction, uiActionSchema } from './ui-schemas';
import { UIFlowService } from './ui-flow.service';
import type { UISessionContext } from './ui-types';

@Injectable()
export class UIActionHandler {
  constructor(private readonly uiFlowService: UIFlowService) {}

  async handle(action: UIAction | Record<string, unknown>, sessionContext: UISessionContext): Promise<AIUIResponse> {
    const parsedAction = uiActionSchema.parse(normalizeAction(action));

    return this.uiFlowService.advance(sessionContext.sessionId, parsedAction);
  }
}

function normalizeAction(action: UIAction | Record<string, unknown>): Record<string, unknown> {
  if (typeof action.type === 'string' && typeof action.componentId === 'string') {
    return action;
  }

  const componentType = typeof action.componentType === 'string' ? action.componentType : undefined;
  const payload = action.payload;
  const payloadType = payload && typeof payload === 'object' && 'type' in payload ? payload.type : undefined;

  if (componentType === 'selection' && payloadType === 'select') {
    return {
      type: 'selection',
      componentType,
      componentId: 'requirement-type',
      payload: payload && typeof payload === 'object' && 'selectedId' in payload ? payload.selectedId : undefined,
    };
  }

  if (componentType === 'form' && payloadType === 'submit') {
    return {
      type: 'form_submit',
      componentType,
      componentId: 'requirement-detail-form',
      payload: payload && typeof payload === 'object' && 'formData' in payload ? payload.formData : undefined,
    };
  }

  if (componentType === 'confirmation' && payloadType === 'confirm') {
    return {
      type: 'confirmation',
      componentType,
      componentId: 'confirm-requirement-analysis',
      payload: payload && typeof payload === 'object' && 'confirmed' in payload ? payload.confirmed : undefined,
    };
  }

  return action;
}
