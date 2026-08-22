import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminUser(request, ROLE_SETS.operations)
    if (!auth.user) return auth.response

    const { id } = await params
    const body = await request.json()
    const { itemId, incrementBy = 0, assignedTo } = body

    const pickList = await db.pickList.findUnique({
      where: { id },
      include: {
        items: true,
        order: {
          include: {
            items: true,
          },
        },
      },
    })

    if (!pickList) {
      return NextResponse.json(
        { success: false, error: "Pick list not found" },
        { status: 404 }
      )
    }

    const targetItem = pickList.items.find((item) => item.id === itemId)

    if (!targetItem) {
      return NextResponse.json(
        { success: false, error: "Pick list item not found" },
        { status: 404 }
      )
    }

    const nextPickedQty = Math.max(
      0,
      Math.min(targetItem.requiredQty, targetItem.pickedQty + Number(incrementBy))
    )

    await db.$transaction(async (tx) => {
      await tx.pickListItem.update({
        where: { id: itemId },
        data: {
          pickedQty: nextPickedQty,
          status: nextPickedQty >= targetItem.requiredQty ? "picked" : "pending",
        },
      })

      await tx.salesOrderItem.updateMany({
        where: {
          orderId: pickList.orderId,
          productId: targetItem.productId,
        },
        data: {
          pickedQty: nextPickedQty,
        },
      })

      const refreshedItems = await tx.pickListItem.findMany({
        where: { pickListId: id },
      })

      const allPicked = refreshedItems.every((item) => item.pickedQty >= item.requiredQty)
      const anyPicked = refreshedItems.some((item) => item.pickedQty > 0)

      await tx.pickList.update({
        where: { id },
        data: {
          assignedTo: assignedTo ?? pickList.assignedTo ?? null,
          status: allPicked ? "completed" : anyPicked ? "in_progress" : "pending",
          startedAt: anyPicked ? pickList.startedAt || new Date() : null,
          completedAt: allPicked ? new Date() : null,
        },
      })

      const nextOrderStatus = allPicked ? "packed" : anyPicked ? "picking" : "approved"

      if (pickList.order.status !== nextOrderStatus) {
        await tx.salesOrder.update({
          where: { id: pickList.orderId },
          data: { status: nextOrderStatus },
        })

        await tx.salesOrderStatusLog.create({
          data: {
            orderId: pickList.orderId,
            status: nextOrderStatus,
            notes: allPicked
              ? `Pick list ${pickList.pickNumber} completed`
              : `Pick list ${pickList.pickNumber} updated`,
          },
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating pick list:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update pick list" },
      { status: 500 }
    )
  }
}
