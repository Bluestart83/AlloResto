import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ExternalLoad } from "@/db/entities/ExternalLoad";
import { MoreThanOrEqual } from "typeorm";
import { INTENSITY_POINTS } from "@/types/planning";

export async function GET(req: NextRequest) {
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId");
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
    }

    const active = req.nextUrl.searchParams.get("active") === "true";
    const ds = await getDb();

    const where: any = { restaurantId };
    if (active) {
      where.endTime = MoreThanOrEqual(new Date());
    }

    const loads = await ds.getRepository(ExternalLoad).find({
      where,
      order: { startTime: "ASC" },
    });

    return NextResponse.json(loads);
  } catch (err: any) {
    console.error("[GET /api/planning/external-loads]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurantId, type, resource, resources, intensity, durationMin, startTime, label } = body;

    if (!restaurantId || !type || !resource || !intensity || !durationMin) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const start = startTime ? new Date(startTime) : new Date();
    const end = new Date(start.getTime() + durationMin * 60_000);
    const pointsPerSlot = INTENSITY_POINTS[intensity as keyof typeof INTENSITY_POINTS] || 4;

    const ds = await getDb();
    const load = ds.getRepository(ExternalLoad).create({
      restaurantId,
      type,
      resource,
      resources: resources || [resource],
      intensity,
      pointsPerSlot,
      startTime: start,
      durationMin,
      endTime: end,
      label: label || null,
    } as Partial<ExternalLoad>) as ExternalLoad;

    await ds.getRepository(ExternalLoad).save(load);
    return NextResponse.json(load, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/planning/external-loads]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const ds = await getDb();
    const repo = ds.getRepository(ExternalLoad);
    const load = await repo.findOneByOrFail({ id });

    // Recalculate end time if duration or start changed
    if (updates.durationMin || updates.startTime) {
      const start = updates.startTime ? new Date(updates.startTime) : load.startTime;
      const dur = updates.durationMin || load.durationMin;
      updates.endTime = new Date(start.getTime() + dur * 60_000);
      if (updates.startTime) updates.startTime = start;
    }

    // Recalculate points if intensity changed
    if (updates.intensity) {
      updates.pointsPerSlot = INTENSITY_POINTS[updates.intensity as keyof typeof INTENSITY_POINTS] || 4;
    }

    Object.assign(load, updates);
    await repo.save(load);
    return NextResponse.json(load);
  } catch (err: any) {
    console.error("[PATCH /api/planning/external-loads]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const ds = await getDb();
    await ds.getRepository(ExternalLoad).delete(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/planning/external-loads]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
