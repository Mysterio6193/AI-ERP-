import { generateText } from "ai"
import { getModelId, resolveAgentModel, getAgentRuntimeInfo } from "../src/lib/agent/model"
import { runAgentTurn } from "../src/lib/agent/runtime"
import { db } from "../src/lib/db"

async function main() {
  console.log("=========================================")
  console.log("1. MULTI-PURPOSE MODEL RESOLUTION MATRIX")
  console.log("=========================================")
  
  const info = getAgentRuntimeInfo()
  console.log("Runtime info:", JSON.stringify(info, null, 2))

  const testCases = [
    { purpose: "chat", tier: "chat" as const },
    { purpose: "telegram", tier: "chat" as const },
    { purpose: "fast", tier: "fast" as const },
    { purpose: "replenishment", tier: "chat" as const },
    { purpose: "email", tier: "chat" as const },
    { purpose: "finance", tier: "chat" as const },
    { model: "meta-llama/llama-3.3-70b-instruct", purpose: "custom" },
  ]

  for (const tc of testCases) {
    const modelId = getModelId(tc)
    console.log(`- Purpose/Target [${tc.purpose || tc.tier}]: => Model ID: "${modelId}"`)
  }

  console.log("\n=========================================")
  console.log("2. TESTING LIVE GENERATION ON DIFFERENT MODELS")
  console.log("=========================================")

  // Test 1: Chat Copilot model
  const chatModel = resolveAgentModel({ purpose: "chat" })
  const chatRes = await generateText({
    model: chatModel,
    prompt: "Respond with 1 line: 'Chat Copilot ready.'",
  })
  console.log("✅ Chat Model Output:", chatRes.text.trim())

  // Test 2: Telegram Bot model
  const telegramModel = resolveAgentModel({ purpose: "telegram" })
  const telegramRes = await generateText({
    model: telegramModel,
    prompt: "Respond with 1 line: 'Telegram Bot engine active.'",
  })
  console.log("✅ Telegram Model Output:", telegramRes.text.trim())

  // Test 3: Fast Triage model
  const fastModel = resolveAgentModel({ purpose: "fast", tier: "fast" })
  const fastRes = await generateText({
    model: fastModel,
    prompt: "Respond with 1 line: 'Fast triage engine active.'",
  })
  console.log("✅ Fast Model Output:", fastRes.text.trim())

  console.log("\n=========================================")
  console.log("3. TESTING TELEGRAM CHANNEL AGENT TURN")
  console.log("=========================================")

  // Find an admin user to act as principal
  const user = await db.user.findFirst({
    where: { role: "admin", status: "active" },
  })

  if (!user) {
    throw new Error("No active admin user found in database")
  }

  const principal = {
    kind: "staff" as const,
    userId: user.id,
    role: "admin" as const,
    name: user.name,
    email: user.email,
  }

  const turn = await runAgentTurn({
    principal,
    channel: "telegram",
    threadKey: `telegram_test_${user.id}`,
    userMessage: "What is our current stock on Roma Tomatoes or olive oil?",
  })

  console.log("✅ Agent Reply via Telegram channel:")
  console.log(turn.text)
  console.log("Pending Approvals:", turn.pendingApprovals.length)

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")
}

main().catch((e) => {
  console.error("Test error:", e)
  process.exit(1)
})
