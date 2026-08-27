"use client"

import { useEffect, useState } from "react"
import { Send, Loader2, Mail, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    RadioGroup,
    RadioGroupItem
} from "@/components/ui/radio-group"
import { toast } from "sonner"
import {
    Dialog as ShDialog,
    DialogContent as ShDialogContent,
    DialogDescription as ShDialogDescription,
    DialogFooter as ShDialogFooter,
    DialogHeader as ShDialogHeader,
    DialogTitle as ShDialogTitle,
} from "@/components/ui/dialog"
import {
    buildDocumentEmailMessage,
    buildDocumentEmailSubject,
    getCompanyDisplayName,
    getCompanyEmail,
    type CompanyBranding,
} from "@/lib/company-branding"

interface SendDocumentModalProps {
    isOpen: boolean
    onClose: () => void
    documentType: "invoice" | "order" | "statement" | "purchase_order"
    documentId: string
    documentNumber: string
    recipientEmail?: string
    recipientPhone?: string
    customerId?: string
    supplierId?: string
}

export function SendDocumentModal({
    isOpen,
    onClose,
    documentType,
    documentId,
    documentNumber,
    recipientEmail = "",
    recipientPhone = "",
    customerId,
    supplierId,
}: SendDocumentModalProps) {
    const [company, setCompany] = useState<CompanyBranding | null>(null)
    const [method, setMethod] = useState<"email" | "sms" | "whatsapp">("email")
    const [to, setTo] = useState("")
    const [subject, setSubject] = useState("")
    const [message, setMessage] = useState("")
    const [isSending, setIsSending] = useState(false)

    useEffect(() => {
        if (!isOpen) return

        const loadCompany = async () => {
            try {
                const response = await fetch("/api/settings/company")
                const data = await response.json()
                if (data.success) {
                    setCompany(data.data)
                }
            } catch (error) {
                console.error("Error fetching company for communication modal:", error)
            }
        }

        void loadCompany()
    }, [isOpen])

    useEffect(() => {
        const defaultRecipient = method === "email" ? recipientEmail : recipientPhone
        setTo(defaultRecipient || "")
    }, [method, recipientEmail, recipientPhone, isOpen])

    useEffect(() => {
        setSubject(buildDocumentEmailSubject(company, documentType, documentNumber))
        setMessage(buildDocumentEmailMessage(company, documentType, documentNumber))
    }, [company, documentType, documentNumber, isOpen])

    const handleSend = async () => {
        setIsSending(true)
        try {
            const response = await fetch("/api/communications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to,
                    subject,
                    message,
                    documentType,
                    documentId,
                    documentNumber,
                    method,
                    customerId,
                    supplierId,
                })
            })

            const data = await response.json()
            if (data.success) {
                toast.success(`${documentType.toUpperCase()} sent successfully!`)
                onClose()
            } else {
                toast.error(data.error || "Failed to send document")
            }
        } catch (error) {
            console.error("Error sending document:", error)
            toast.error("An unexpected error occurred.")
        } finally {
            setIsSending(false)
        }
    }

    return (
        <ShDialog open={isOpen} onOpenChange={onClose}>
            <ShDialogContent className="sm:max-w-[425px]">
                <ShDialogHeader>
                    <ShDialogTitle>Send {documentType}</ShDialogTitle>
                    <ShDialogDescription>
                        Send {documentNumber} from {getCompanyDisplayName(company)} to your customer.
                    </ShDialogDescription>
                </ShDialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <p className="font-medium">{getCompanyDisplayName(company)}</p>
                        <p className="text-muted-foreground">{getCompanyEmail(company) || "No branded reply-to email set yet"}</p>
                    </div>
                    <div className="space-y-4">
                        <Label>Communication Method</Label>
                        <RadioGroup
                            defaultValue="email"
                            onValueChange={(val) => {
                                const newMethod = val as "email" | "sms"
                                setMethod(newMethod)
                                setTo(newMethod === "email" ? recipientEmail : recipientPhone)
                            }}
                            className="flex gap-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="email" id="email" />
                                <Label htmlFor="email" className="flex items-center gap-1 cursor-pointer">
                                    <Mail className="h-4 w-4" /> Email
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="sms" id="sms" />
                                <Label htmlFor="sms" className="flex items-center gap-1 cursor-pointer">
                                    <MessageSquare className="h-4 w-4" /> SMS
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="whatsapp" id="whatsapp" />
                                <Label htmlFor="whatsapp" className="flex items-center gap-1 cursor-pointer">
                                    <MessageSquare className="h-4 w-4" /> WhatsApp
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="to">{method === "email" ? "Email Address" : "Phone Number"}</Label>
                        <Input
                            id="to"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder={method === "email" ? "customer@example.com" : "+61 4XX XXX XXX"}
                        />
                    </div>

                    {method === "email" && (
                        <div className="space-y-2">
                            <Label htmlFor="subject">Subject</Label>
                            <Input
                                id="subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="message">Message</Label>
                        <Textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                        />
                    </div>
                </div>
                <ShDialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSending}>
                        Cancel
                    </Button>
                    <Button
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={handleSend}
                        disabled={isSending || !to}
                    >
                        {isSending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="mr-2 h-4 w-4" />
                                Send Document
                            </>
                        )}
                    </Button>
                </ShDialogFooter>
            </ShDialogContent>
        </ShDialog>
    )
}
