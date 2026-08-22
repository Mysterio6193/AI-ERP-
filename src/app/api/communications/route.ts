import { NextResponse } from "next/server"
import { sendCommunicationMessage } from "@/lib/communications"
import {
    buildDocumentEmailMessage,
    buildDocumentEmailSubject,
} from "@/lib/company-branding"

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { to, subject, message, documentType, documentId, method } = body

        if (!to || !documentType || !documentId) {
            return NextResponse.json(
                { success: false, error: "Missing required fields: to, documentType, documentId" },
                { status: 400 }
            )
        }

        const deliveryMethod = method || "email"
        const result = await sendCommunicationMessage({
            to,
            customerId: body.customerId || null,
            supplierId: body.supplierId || null,
            method: deliveryMethod,
            documentType,
            documentId,
            documentNumber: body.documentNumber || null,
            subject: subject || buildDocumentEmailSubject(null, documentType, body.documentNumber || documentId),
            message: message || buildDocumentEmailMessage(null, documentType, body.documentNumber || documentId),
            metadata: {
                source: "admin_dashboard",
            },
        })

        return NextResponse.json({
            success: result.success,
            message: `${documentType} ${result.status === "sent" ? "sent" : "queued"} successfully for ${to}`,
            data: {
                id: result.id,
                fromName: result.fromName,
                replyTo: result.fromEmail,
                subject: result.subject,
                message: result.message,
                method: deliveryMethod,
                status: result.status,
            }
        })
    } catch (error) {
        console.error("Error in communication API:", error)
        return NextResponse.json(
            { success: false, error: "Failed to send communication" },
            { status: 500 }
        )
    }
}
