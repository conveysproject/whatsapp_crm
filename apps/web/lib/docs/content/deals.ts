import type { DocCategory } from "../types";

export const deals: DocCategory = {
  title: "Deals",
  slug: "deals",
  description: "Manage your sales pipeline with Kanban boards, custom stages, and deal tracking.",
  icon: "💼",
  colorHex: "#0284C7",
  bgHex: "#E0F2FE",
  articles: [
    {
      title: "Deals & Pipelines Overview",
      slug: "deals-overview",
      description: "How the Deals module works and what you can see on the Kanban board.",
      sections: [
        {
          paragraphs: [
            "The Deals module gives you a Kanban board view for managing your sales pipeline. Each column on the board represents a stage, and each card represents a deal.",
            "If you have multiple pipelines, switch between them using the pipeline dropdown at the top of the page.",
            "The default pipeline stages are: Lead, Qualified, Proposal, Negotiation, Won, and Lost.",
          ],
        },
        {
          heading: "Deal Cards",
          paragraphs: [
            "Each deal card on the board shows: the deal title, the linked contact's name (if a contact has been attached), the deal value, and a truncated preview of the deal notes.",
            "Drag and drop cards between stage columns to move a deal through the pipeline.",
          ],
        },
      ],
    },
    {
      title: "Creating a Custom Pipeline",
      slug: "create-pipeline",
      description: "Set up a new pipeline with custom stages for a different sales process.",
      sections: [
        {
          steps: [
            "Go to Deals and click Create Pipeline.",
            "Enter a name for the pipeline.",
            "Add your custom stages — enter stage names one by one, or paste a comma-separated list.",
            "Click Save.",
          ],
        },
        {
          paragraphs: [
            "After creation, you can edit stage names and reorder them at any time.",
            "Multiple pipelines let you track separate sales processes in the same workspace — for example, a New Sales pipeline and a Renewals pipeline.",
          ],
        },
      ],
    },
    {
      title: "Creating and Managing Deals",
      slug: "manage-deals",
      description: "How to create deals, edit their details, and move them through your pipeline.",
      sections: [
        {
          heading: "Creating a Deal",
          paragraphs: [
            "Click the + button at the top of any Kanban stage column to create a new deal in that stage.",
            "Fill in the deal fields: Title (required), Pipeline (required), Contact (optional — links the deal to an existing contact), Assigned User, Value, Stage, and Notes.",
          ],
        },
        {
          heading: "Editing a Deal",
          paragraphs: [
            "Click any deal card to open the slide-over panel. From here you can edit all fields, add or update notes, change the stage, link or unlink a contact, and change the assigned agent.",
            "You can also drag the card between columns directly on the Kanban board to change the stage without opening the panel.",
            "Mark a deal as Won or Lost by moving it to the Won or Lost stage column, or by changing the stage in the slide-over panel.",
          ],
        },
        {
          heading: "Linked Contact Timeline",
          paragraphs: [
            "All changes made to a deal are logged in the activity timeline of the linked contact, so you have a full history of the deal alongside the conversation.",
          ],
        },
        {
          heading: "Offers & Quotes",
          paragraphs: [
            "You can create an offer or quote directly from the deal slide-over panel using the offer creation option.",
          ],
        },
      ],
    },
  ],
};
