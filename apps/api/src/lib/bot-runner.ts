import type { PrismaClient } from "@prisma/client";
import { sendTextMessage } from "./whatsapp.js";
import type { FlowDefinition, FlowNode } from "./flow-runner.js";

export async function handleBotMessage(
  prisma: PrismaClient,
  conversationId: string,
  organizationId: string,
  inboundBody: string | null
): Promise<void> {
  const session = await prisma.botSession.findFirst({ where: { conversationId } });
  if (!session || session.isEscalated) return;

  const chatbot = await prisma.chatbot.findFirst({
    where: { id: session.chatbotId, isActive: true },
  });
  if (!chatbot) return;

  const flow = await prisma.flow.findFirst({ where: { id: chatbot.flowId } });
  if (!flow) return;

  const definition = flow.flowDefinition as unknown as FlowDefinition;
  const nodeMap = new Map<string, FlowNode>(definition.nodes.map((n) => [n.id, n]));
  const currentNodeId = session.currentNodeId ?? definition.startNodeId;
  const node = nodeMap.get(currentNodeId);
  if (!node) return;

  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId } });
  const contactPhone = conversation?.whatsappContactId ?? "";

  if (node.type === "send_message") {
    const text = (node.config["text"] as string) ?? "";
    if (text && contactPhone) {
      await sendTextMessage(
        process.env["WA_PHONE_NUMBER_ID"] ?? "",
        contactPhone,
        text,
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );
    }
    await prisma.botSession.update({
      where: { id: session.id },
      data: { currentNodeId: node.next ?? null },
    });
  } else if (node.type === "end" || !node.next) {
    await prisma.botSession.update({ where: { id: session.id }, data: { isEscalated: true } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "open" } });
    if (contactPhone) {
      await sendTextMessage(
        process.env["WA_PHONE_NUMBER_ID"] ?? "",
        contactPhone,
        "You're now connected with a live agent. Please hold on.",
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );
    }
  }

  void inboundBody;
}
