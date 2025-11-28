import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import path from 'node:path';

export const runtime = 'nodejs';

const ROLES_PATH = path.join(process.cwd(), 'src', 'storage', 'roles.json');

export async function GET(_req: NextRequest) {
  try {
    void _req;
    const content = await fs.readFile(ROLES_PATH, 'utf8');
    const data = JSON.parse(content);
    return Response.json(Array.isArray(data) ? data : [], { status: 200 });
  } catch (e: any) {
    return Response.json(
      { error: e?.message, message: 'Failed to load roles.json' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, personality } = body || {};
    if (!name) return Response.json({ message: 'name is required' }, { status: 400 });

    // load exists
    let list: any[] = [];
    try {
      const content = await fs.readFile(ROLES_PATH, 'utf8');
      list = Array.isArray(JSON.parse(content)) ? JSON.parse(content) : [];
    } catch {
      // ignore missing or invalid roles.json and start from empty list
    }

    // generate id
    const maxId = list.reduce((m, r) => {
      const idNum = Number(r.role_id);
      return Number.isFinite(idNum) ? Math.max(m, idNum) : m;
    }, 0);
    const role = {
      description: description ?? '',
      name,
      personality: personality ?? null,
      role_id: maxId + 1,
    };

    // append and save
    const next = [...list, role];
    await fs.writeFile(ROLES_PATH, JSON.stringify(next, null, 2), 'utf8');

    return Response.json(role, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e?.message, message: 'Failed to create role' }, { status: 500 });
  }
}
