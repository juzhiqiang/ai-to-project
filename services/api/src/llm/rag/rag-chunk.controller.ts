import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { chunkText } from "../../../rag/chunking/document-chunker";
import { chunkParentChild } from "../../../rag/chunking/parent-child-chunker";

@Controller("api/rag")
export class RagChunkController {
  @Post("chunk")
  async chunk(
    @Body()
    body: {
      text: string;
      chunkSize?: number;
      chunkOverlap?: number;
      mode?: "normal" | "parent-child";
    },
  ) {
    const { text, chunkSize = 500, chunkOverlap = 50, mode = "normal" } = body;
    const normalizedText = typeof text === "string" ? text : "";

    if (!normalizedText.trim()) {
      throw new BadRequestException("text 不能为空");
    }
    if (mode !== "normal" && mode !== "parent-child") {
      throw new BadRequestException("mode 必须是 normal 或 parent-child");
    }
    if (!Number.isInteger(chunkSize) || chunkSize < 1) {
      throw new BadRequestException("chunkSize 必须是正整数");
    }
    if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0) {
      throw new BadRequestException("chunkOverlap 必须是非负整数");
    }

    if (mode === "parent-child") {
      const result = await chunkParentChild(normalizedText, 1500, chunkSize);
      return { mode: "parent-child", chunks: result };
    }

    const chunks = await chunkText(normalizedText, {
      chunkSize,
      chunkOverlap,
    });
    return { mode: "normal", chunks };
  }
}
