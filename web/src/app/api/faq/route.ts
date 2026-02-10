/**
 * /api/faq/route.ts
 *
 * CRUD simple — le dédoublonnage est géré par l'IA :
 *   - L'IA reçoit toute la FAQ dans son prompt
 *   - Si la question existe → elle répond directement
 *   - Si c'est nouveau → elle appelle log_new_faq (function call)
 *     qui POST ici
 *
 * GET    /api/faq?restaurantId=xxx                 → toutes les FAQs
 * GET    /api/faq?restaurantId=xxx&status=pending  → en attente de réponse
 * GET    /api/faq?restaurantId=xxx&for_prompt=true → répondues (pour injection prompt)
 * POST   /api/faq                                  → nouvelle question remontée par l'IA
 * PATCH  /api/faq                                  → le restaurateur répond / ignore
 * DELETE /api/faq?id=xxx                           → supprimer
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { Faq } from "@/db/entities/Faq";

// ============================================================
// GET
// ============================================================

export async function GET(req: NextRequest) {
  const ds = await getDb();
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const status = req.nextUrl.searchParams.get("status");
  const forPrompt = req.nextUrl.searchParams.get("for_prompt");

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  // Mode prompt : uniquement les FAQs avec réponse (pour injection dans le system prompt)
  if (forPrompt === "true") {
    const faqs = await ds.getRepository(Faq).find({
      where: { restaurantId, status: "answered" },
      order: { askCount: "DESC" },
    });
    return NextResponse.json(faqs);
  }

  const where: any = { restaurantId };
  if (status) where.status = status;

  const faqs = await ds.getRepository(Faq).find({
    where,
    order: { askCount: "DESC", updatedAt: "DESC" },
  });

  return NextResponse.json(faqs);
}

// ============================================================
// POST — Nouvelle question remontée par l'IA via function call
// ============================================================
// L'IA appelle log_new_faq quand elle reçoit une question
// qu'elle ne trouve PAS dans la FAQ existante.
//
// Body :
// {
//   "restaurantId": "xxx",
//   "question": "Est-ce que vous avez une terrasse ?",
//   "category": "other",
//   "callerPhone": "0612345678"
// }

export async function POST(req: NextRequest) {
  const ds = await getDb();
  const body = await req.json();

  const { restaurantId, question, category, callerPhone } = body;

  if (!restaurantId || !question) {
    return NextResponse.json(
      { error: "restaurantId and question required" },
      { status: 400 }
    );
  }

  // Vérifier si l'IA a déjà remonté cette question exacte (double appel possible)
  const existing = await ds.getRepository(Faq).findOneBy({
    restaurantId,
    question,
  });

  if (existing) {
    existing.askCount += 1;
    existing.lastAskedAt = new Date();
    existing.lastCallerPhone = callerPhone || existing.lastCallerPhone;
    const updated = await ds.getRepository(Faq).save(existing);
    return NextResponse.json(updated);
  }

  const faq = ds.getRepository(Faq).create({
    restaurantId,
    question,
    category: category || "other",
    status: "pending",
    askCount: 1,
    lastCallerPhone: callerPhone || null,
    lastAskedAt: new Date(),
  } as Partial<Faq>) as Faq;

  const saved = await ds.getRepository(Faq).save(faq);
  return NextResponse.json(saved, { status: 201 });
}

// ============================================================
// PATCH — Le restaurateur répond ou ignore
// ============================================================
// Body :
// { "id": "xxx", "answer": "Oui nous avons une terrasse de 20 places" }
// ou
// { "id": "xxx", "status": "ignored" }

export async function PATCH(req: NextRequest) {
  const ds = await getDb();
  const { id, answer, status } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const faq = await ds.getRepository(Faq).findOneBy({ id });
  if (!faq) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  if (answer !== undefined) {
    faq.answer = answer;
    faq.status = "answered";
  }

  if (status) {
    faq.status = status;
  }

  const updated = await ds.getRepository(Faq).save(faq);
  return NextResponse.json(updated);
}

// ============================================================
// DELETE
// ============================================================

export async function DELETE(req: NextRequest) {
  const ds = await getDb();
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await ds.getRepository(Faq).delete(id);
  return NextResponse.json({ success: true });
}
