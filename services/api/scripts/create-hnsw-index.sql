-- 先完成全量向量入库，再由运维或负责人手动批准执行本脚本。
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw ("embedding" vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
