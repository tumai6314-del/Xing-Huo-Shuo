import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Return a deep link URL to open chat (no auto welcome message)
export async function GET(_req: NextRequest, _ctx: { params: { id: string } }) {
  void _req;
  void _ctx;
  const url = `/chat`;
  return Response.json({ url }, { status: 200 });
}
