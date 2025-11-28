import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';
import path from 'node:path';

export const runtime = 'nodejs';

const ROLES_PATH = path.join(process.cwd(), 'src', 'storage', 'roles.json');

const loadRoles = async (): Promise<any[]> => {
  try {
    const content = await fs.readFile(ROLES_PATH, 'utf8');
    const list = JSON.parse(content);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const saveRoles = async (list: any[]) =>
  fs.writeFile(ROLES_PATH, JSON.stringify(list, null, 2), 'utf8');

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const list = await loadRoles();
  const role = list.find((r) => String(r.role_id) === String(params.id));
  if (!role) return Response.json({ message: 'Not found' }, { status: 404 });
  return Response.json(role, { status: 200 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const list = await loadRoles();
    const idx = list.findIndex((r) => String(r.role_id) === String(params.id));
    if (idx === -1) return Response.json({ message: 'Not found' }, { status: 404 });

    const prev = list[idx];
    const next = { ...prev, ...body, role_id: prev.role_id };
    list[idx] = next;
    await saveRoles(list);

    return Response.json(next, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message, message: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const list = await loadRoles();
    const next = list.filter((r) => String(r.role_id) !== String(params.id));
    await saveRoles(next);
    return Response.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message, message: 'Failed to delete' }, { status: 500 });
  }
}
