import { NextRequest, NextResponse } from "next/server"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"
import { applyOrderStatus } from "@/lib/order-status"

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

    let nextOrderStatus: string | null = null
    let pickNumber = ""
    let orderId: string | null = null
    let currentOrderStatus = ""

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

      nextOrderStatus = allPicked ? "packed" : anyPicked ? "picking" : "approved"
      pickNumber = pickList.pickNumber
      orderId = pickList.orderId
      currentOrderStatus = pickList.order.status
    })

    /**
     * The status change goes through applyOrderStatus, outside the
     * transaction, exactly as the order route does.
     *
     * This used to be a bare `salesOrder.update` inside the transaction, so
     * finishing a pick moved the order to "packed" and fired none of what a
     * status carries — no delivery raised, no reservation handled. It is the
     * same bug the agent's updateOrderStatus had.
     */
    let dispatched = false

    if (orderId && nextOrderStatus && currentOrderStatus !== nextOrderStatus) {
      const moved = await applyOrderStatus(db, orderId, nextOrderStatus, {
        userId: auth.user.id,
        note: `Pick list ${pickNumber} ${nextOrderStatus === "packed" ? "completed" : "updated"}`,
      })

      if (!moved.ok) {
        return NextResponse.json(
          { success: false, error: moved.error || "Could not update the order status." },
          { status: 400 }
        )
      }

      dispatched = nextOrderStatus === "packed"
    }

    return NextResponse.json({
      success: true,
      data: {
        orderStatus: nextOrderStatus,
        // A completed pick packs the order; dispatch is the next step and is
        // still a person's decision, so the client is told what to offer.
        readyToDispatch: dispatched,
      },
    })
  } catch (error) {
    console.error("Error updating pick list:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update pick list" },
      { status: 500 }
    )
  }
}
