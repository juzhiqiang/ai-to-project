-- 更换 embedding 模型：paraphrase-multilingual-MiniLM-L12-v2 (384 维) → bge-small-zh-v1.5 (512 维)
-- 旧 384 维向量无法 cast 到 512 维，先清空，后续由灌库脚本重新嵌入。
UPDATE "DocumentChunk" SET "embedding" = NULL;

ALTER TABLE "DocumentChunk" ALTER COLUMN "embedding" TYPE vector(512);