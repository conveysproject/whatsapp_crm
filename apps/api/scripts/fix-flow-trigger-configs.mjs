import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// The dispatcher reads trigger params from the start node's config.
// keyword_match flows need { keyword, matchType } in node n1's config.
// no_reply flows need { hours } in node n1's config.

const PATCHES = {
  'Lead Qualification': {
    startNodePatch: { keyword: 'interested,price,buy,cost,rate,offer', matchType: 'contains_word' },
  },
  'Support Triage': {
    startNodePatch: { keyword: 'help,issue,problem,complaint,wrong,broken,not working', matchType: 'contains_word' },
  },
  'No-Reply Follow-up': {
    startNodePatch: { hours: 2 },  // fire after 2 hours of no reply
  },
};

// contains_word matches one keyword at a time — dispatcher only checks one keyword string.
// Use "contains" for comma-separated OR logic doesn't work natively.
// Re-patch to use "contains" with a single broad keyword per flow.

const FINAL_PATCHES = {
  'Lead Qualification': {
    startNodePatch: { keyword: 'interested', matchType: 'contains' },
  },
  'Support Triage': {
    startNodePatch: { keyword: 'help', matchType: 'contains' },
  },
  'No-Reply Follow-up': {
    startNodePatch: { hours: 2 },
  },
};

const flows = await prisma.flow.findMany({
  where: { name: { in: Object.keys(FINAL_PATCHES) } },
  select: { id: true, name: true, flowDefinition: true },
});

for (const flow of flows) {
  const patch = FINAL_PATCHES[flow.name];
  if (!patch) continue;

  const def = flow.flowDefinition;
  const nodes = def.nodes;
  const startNode = nodes.find(n => n.id === def.startNodeId) ?? nodes[0];

  // Inject trigger config into start node
  startNode.config = { ...startNode.config, ...patch.startNodePatch };

  await prisma.flow.update({
    where: { id: flow.id },
    data: { flowDefinition: def },
  });
  console.log(`✓ Patched "${flow.name}" start node:`, patch.startNodePatch);
}

await prisma.$disconnect();
console.log('\nDone.');
