#!/usr/bin/env npx tsx
/**
 * Sync roles from src/storage/roles.json to PostgreSQL database
 *
 * This script reads roles.json and ensures each role has a corresponding
 * session and agent in the database. It is idempotent - running it multiple
 * times will not create duplicate entries.
 *
 * Usage:
 *   bunx tsx scripts/syncRolesFromJson.ts
 *   # or via npm script:
 *   bun run sync:roles
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 */
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as fs from 'node:fs';
import { customAlphabet } from 'nanoid/non-secure';
import * as path from 'node:path';
import { Pool } from 'pg';
import { generate } from 'random-words';

// Import schema - use relative path from scripts directory
import { agents } from '../packages/database/src/schemas/agent';
import { agentsToSessions } from '../packages/database/src/schemas/relations';
import { sessions } from '../packages/database/src/schemas/session';

// Load environment variables
dotenv.config();

// Constants
const SHARED_USER_ID = 'NO_AUTH_SHARED_USER';
const ROLES_JSON_PATH = path.resolve(__dirname, '../src/storage/roles.json');

// ID generation utilities (matching packages/database/src/utils/idGenerator.ts)
const createNanoId = (size = 8) =>
  customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', size);

const idGenerator = (namespace: 'agents' | 'sessions' | 'sessionGroups', size = 12) => {
  const prefixes = { agents: 'agt', sessionGroups: 'sg', sessions: 'ssn' };
  const hash = createNanoId(size);
  return `${prefixes[namespace]}_${hash()}`;
};

const randomSlug = (count = 2) => (generate(count) as string[]).join('-');

// Role interface matching roles.json structure
interface RoleJson {
  description: string;
  miaoshu?: string;
  name: string;
  personality?: {
    expertise?: string;
    style?: string;
    tone?: string;
    traits?: string[];
  };
  role_id: number;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Read roles.json
  console.log(`📖 Reading roles from ${ROLES_JSON_PATH}`);
  const rolesData = JSON.parse(fs.readFileSync(ROLES_JSON_PATH, 'utf8')) as RoleJson[];
  console.log(`   Found ${rolesData.length} roles`);

  // Connect to database
  console.log('🔌 Connecting to database...');
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    // Get existing sessions for this user by title
    const existingSessions = await db
      .select({ id: sessions.id, title: sessions.title })
      .from(sessions)
      .where(eq(sessions.userId, SHARED_USER_ID));

    const sessionByTitle = new Map(existingSessions.map((s) => [s.title, s.id]));
    console.log(`   Found ${existingSessions.length} existing sessions`);

    let created = 0;
    let skipped = 0;

    for (const role of rolesData) {
      const title = role.name.trim();
      if (!title) {
        console.warn(`⚠️  Skipping role with empty name (role_id=${role.role_id})`);
        continue;
      }

      // Check if session already exists
      if (sessionByTitle.has(title)) {
        console.log(`   ⏭️  "${title}" already exists, skipping`);
        skipped++;
        continue;
      }

      // Create new session
      const sessionId = idGenerator('sessions');
      const agentId = idGenerator('agents');
      const slug = randomSlug();

      // Use miaoshu as session description (card display), description as systemRole
      const sessionDescription = role.miaoshu || '';
      const systemRole = role.description || '';

      console.log(`   ✨ Creating "${title}"...`);

      // Insert session
      await db.insert(sessions).values({
        description: sessionDescription,
        id: sessionId,
        slug,
        title,
        type: 'agent',
        userId: SHARED_USER_ID,
      });

      // Insert agent
      await db.insert(agents).values({
        description: sessionDescription,
        id: agentId,
        slug: randomSlug(4),
        systemRole,
        title,
        userId: SHARED_USER_ID,
      });

      // Link agent to session
      await db.insert(agentsToSessions).values({
        agentId,
        sessionId,
        userId: SHARED_USER_ID,
      });

      sessionByTitle.set(title, sessionId);
      created++;
    }

    console.log('\n✅ Sync complete!');
    console.log(`   Created: ${created}`);
    console.log(`   Skipped (already exist): ${skipped}`);
  } finally {
    await pool.end();
  }
}

try {
  await main();
} catch (err) {
  console.error('❌ Sync failed:', err);
  process.exit(1);
}
