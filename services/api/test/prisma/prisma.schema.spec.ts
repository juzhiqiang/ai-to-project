import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
const configPath = join(process.cwd(), 'prisma.config.ts');
const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260513182000_init',
  'migration.sql',
);

function readSchema() {
  expect(existsSync(schemaPath)).toBe(true);
  return readFileSync(schemaPath, 'utf8');
}

function blockFor(
  schema: string,
  kind: 'model' | 'enum' | 'datasource' | 'generator',
  name: string,
) {
  const match = schema.match(
    new RegExp(`${kind}\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`),
  );
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('Prisma schema', () => {
  it('configures PostgreSQL, Prisma Client, and pgvector support', () => {
    const schema = readSchema();

    expect(blockFor(schema, 'generator', 'client')).toContain(
      'previewFeatures = ["postgresqlExtensions"]',
    );
    expect(blockFor(schema, 'datasource', 'db')).toContain(
      'provider   = "postgresql"',
    );
    expect(blockFor(schema, 'datasource', 'db')).toContain(
      'extensions = [vector]',
    );
    expect(blockFor(schema, 'datasource', 'db')).not.toContain('url');
  });

  it('keeps the Prisma 7 datasource URL in prisma.config.ts', () => {
    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, 'utf8');

    expect(config).toMatch(
      /import \{ defineConfig, env \} from ["']prisma\/config["'];/,
    );
    expect(config).toMatch(/schema: ["']prisma\/schema\.prisma["']/);
    expect(config).toMatch(/path: ["']prisma\/migrations["']/);
    expect(config).toMatch(/url: env\(["']DATABASE_URL["']\)/);
  });

  it('keeps user relationships for conversations and documents', () => {
    const schema = readSchema();
    const user = blockFor(schema, 'model', 'User');

    expect(user).toContain('conversations Conversation[]');
    expect(user).toContain('documents     Document[]');
  });

  it('defines conversation and message persistence', () => {
    const schema = readSchema();
    const conversation = blockFor(schema, 'model', 'Conversation');
    const message = blockFor(schema, 'model', 'Message');
    const role = blockFor(schema, 'enum', 'MessageRole');

    expect(conversation).toContain('id        String    @id @default(cuid())');
    expect(conversation).toContain('title     String');
    expect(conversation).toContain('userId    String');
    expect(conversation).toContain(
      'user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)',
    );
    expect(conversation).toContain('messages  Message[]');
    expect(conversation).toContain('createdAt DateTime  @default(now())');
    expect(conversation).toContain('updatedAt DateTime  @updatedAt');

    expect(message).toContain(
      'id             String       @id @default(cuid())',
    );
    expect(message).toContain('conversationId String');
    expect(message).toContain(
      'conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)',
    );
    expect(message).toContain('role           MessageRole');
    expect(message).toContain('content        String');
    expect(message).toContain('metadata       Json?');
    expect(message).toContain('createdAt      DateTime     @default(now())');

    expect(role).toContain('system');
    expect(role).toContain('human');
    expect(role).toContain('ai');
    expect(role).toContain('tool');
  });

  it('defines document and vector chunk persistence', () => {
    const schema = readSchema();
    const document = blockFor(schema, 'model', 'Document');
    const chunk = blockFor(schema, 'model', 'DocumentChunk');
    const status = blockFor(schema, 'enum', 'DocumentStatus');

    expect(document).toContain(
      'id           String          @id @default(cuid())',
    );
    expect(document).toContain('userId       String');
    expect(document).toContain(
      'user         User            @relation(fields: [userId], references: [id], onDelete: Cascade)',
    );
    expect(document).toContain('filename     String');
    expect(document).toContain('originalName String');
    expect(document).toContain('mimeType     String');
    expect(document).toContain('size         Int');
    expect(document).toContain(
      'status       DocumentStatus  @default(pending)',
    );
    expect(document).toContain('chunkCount   Int             @default(0)');
    expect(document).toContain('chunks       DocumentChunk[]');
    expect(document).toContain('createdAt    DateTime        @default(now())');
    expect(document).toContain('updatedAt    DateTime        @updatedAt');

    expect(chunk).toMatch(/id\s+String\s+@id @default\(cuid\(\)\)/);
    expect(chunk).toContain('documentId String');
    expect(chunk).toMatch(
      /document\s+Document\s+@relation\(fields: \[documentId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(chunk).toContain('content    String');
    expect(chunk).toContain('chunkIndex Int');
    expect(chunk).toContain('metadata   Json?');
    expect(chunk).toContain('embedding  Unsupported("vector(384)")');
    expect(chunk).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);

    expect(status).toContain('pending');
    expect(status).toContain('processing');
    expect(status).toContain('completed');
    expect(status).toContain('failed');
  });

  it('allows document chunks to be inserted before embeddings are written', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/"embedding"\s+vector\(384\)/);
    expect(migration).not.toMatch(/"embedding"\s+vector\(384\)\s+NOT NULL/);
  });
});
