import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { getConfiguredModelName, runLiveTokenEstimate } from './token-estimator.service';

// 该接口不再接受前端传入的 modelName：模型完全由后端 config/langchain.yaml 决定，
// 接口会真实调用该模型，并用 provider 实际返回的 usage_metadata 计算 token 与成本。
// 真实调用失败或超时时，统一返回 500，避免页面拿到半成品或不确定的结果。
@Controller('api/cost')
export class TokenEstimatorController {
  @Post('token-estimate')
  async estimate(@Body() body: Record<string, unknown>) {
    try {
      const result = await runLiveTokenEstimate({
        nodeName: typeof body.nodeName === 'string' ? body.nodeName : null,
        systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : null,
        toolSchemas: body.toolSchemas,
        messages: body.messages,
        outputText: typeof body.outputText === 'string' ? body.outputText : null,
      });

      return {
        ...result,
        configuredModel: getConfiguredModelName(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Live token estimate failed';

      throw new HttpException(
        { error: 'Live token estimate failed', detail: message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
