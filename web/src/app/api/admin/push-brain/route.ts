import { NextResponse } from "next/server";
import { pushBrainToAll } from "@/services/sip-agent-provisioning.service";

/**
 * POST /api/admin/push-brain
 * Force la MAJ du brain (prompt + tools) sur tous les agents AlloResto.
 * Utiliser apres un deploiement ou une modif des tool definitions.
 */
export async function POST() {
  const result = await pushBrainToAll();
  return NextResponse.json(result);
}
