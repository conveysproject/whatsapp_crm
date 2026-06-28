import type { DocCategory } from "../types";

export const contacts: DocCategory = {
  title: "Contacts",
  slug: "contacts",
  description:
    "Manage your contacts, import data, organize with groups and segments, and track every interaction in one place.",
  icon: "👥",
  colorHex: "#0284C7",
  bgHex: "#E0F2FE",
  articles: [
    {
      title: "Contacts Overview",
      slug: "contacts-overview",
      description:
        "A tour of the Contacts list — what columns are shown, how to search, sort, and navigate pages.",
      sections: [
        {
          image: {
            src: "/docs/screenshots/contacts/contacts-list.png",
            alt: "WBMSG contacts list",
            caption: "The Contacts page — search, filter, and manage all your contacts",
          },
        },
        {
          heading: "The Contacts Table",
          paragraphs: [
            "The Contacts page displays all contacts for your organization in a paginated table. Use the entries selector at the top-left to show 25, 50, or 100 rows per page.",
            "Each row shows: First Name (with avatar initials), Last Name, Mobile number, Language code, Created On date, Country (if enabled), Email, Marketing opt-out status, Lead Status, Trust score badge, Tags (if enabled), and Owner (assigned user, if enabled).",
            "Click the expand button (+ icon) on any row to see the contact's groups and quick-action buttons — Details, Edit, Send Template, Chat, Delete, and Assign — without opening the full profile page.",
          ],
        },
        {
          heading: "Search and Filter",
          paragraphs: [
            "Use the search box to find contacts by name, phone number, or email. Results update as you type.",
            "If your organization has tags defined, a tag dropdown appears next to the search box — select a tag to filter the list to contacts with that tag.",
          ],
        },
        {
          heading: "Sorting",
          paragraphs: [
            "Click any sortable column header to sort by that field. Click again to reverse the direction. Sortable columns are: First Name, Last Name, Mobile, Language, Created On, Email, and Marketing (opt-out status). An arrow indicator shows the current sort field and direction.",
          ],
        },
      ],
    },
    {
      title: "Adding a Contact Manually",
      slug: "add-contact",
      description:
        "Create a single contact record directly inside WBMSG using the New Contact drawer.",
      sections: [
        {
          heading: "Opening the Drawer",
          paragraphs: [
            "Click the New Contact button in the top-right corner of the Contacts page. A slide-over drawer opens on the right side of the screen.",
          ],
        },
        {
          heading: "Fields in the Drawer",
          steps: [
            "First Name and Last Name — both optional.",
            "Mobile Number (required) — enter the full number including country code, without a leading 0 or + sign. For example, enter 919876543210 for an Indian number.",
            "Country — dropdown to select the contact's country.",
            "Language — dropdown with 60+ WhatsApp-supported language codes (e.g. English, Hindi, Spanish, Arabic).",
            "Status — select a lead status from your organization's configured list.",
            "Groups — multi-select dropdown to add the contact to one or more contact groups immediately.",
            "Opt out Marketing Messages — toggle on if the contact has opted out of promotional messages.",
            "Enable Reply Bot — toggle controls whether automated flows can message this contact. Turn it off to prevent the bot from contacting them.",
            "Custom Fields (Other Information) — any custom fields configured for your organization appear here dynamically, including required ones.",
          ],
          tip: "The phone number must include the country code but without a leading + or 0. For example, for +91 India numbers, enter 91 followed by the 10-digit number.",
        },
        {
          heading: "Saving",
          paragraphs: [
            "Click Submit to create the contact. The new contact appears at the top of the Contacts list. Required custom fields must be filled before the form will submit.",
          ],
        },
      ],
    },
    {
      title: "Importing Contacts from CSV",
      slug: "import-contacts",
      description:
        "Bring many contacts into WBMSG at once using a CSV file with a guided multi-step import wizard.",
      sections: [
        {
          heading: "Starting the Import",
          steps: [
            "Go to Contacts and click the Import button in the top toolbar.",
            "Step 1 — Upload: choose your CSV file from your computer.",
            "Step 2 — Map Fields: WBMSG reads your CSV headers and shows a mapping screen. For each column, select the matching WBMSG field (phone number, first name, last name, email, tags, lead status, groups, custom fields, etc.) or choose Skip to ignore the column. WBMSG auto-suggests mappings based on column names.",
            "Step 3 — Preview: review how the first rows will be imported before committing.",
            "Step 4 — Progress: the import runs and shows real-time progress. You can navigate away — it continues in the background.",
          ],
          tip: "Download the sample CSV template from the import screen to see the expected column format before building your file.",
        },
        {
          heading: "Phone Number Requirements",
          paragraphs: [
            "You can map either a Full Phone Number column (with country code already included, e.g. 919876543210) or separate Phone Number and Country Code columns. If you map Phone Number, you must also map Country Code, and vice versa.",
            "Rows with missing or invalid phone numbers are skipped and listed in the error report after the import finishes.",
          ],
        },
        {
          heading: "How Duplicates Are Handled",
          paragraphs: [
            "WBMSG uses phone number as the unique identifier. If an incoming row matches an existing contact's phone number, the existing contact's fields are updated with the new values rather than creating a duplicate.",
          ],
        },
      ],
    },
    {
      title: "Filtering and Segmenting Contacts",
      slug: "filters-and-segments",
      description:
        "Use the tag filter on the contacts list, or create saved segments with complex multi-field conditions.",
      sections: [
        {
          heading: "Filtering the Contacts List",
          paragraphs: [
            "On the Contacts page, use the search box to filter by name, phone, or email. Use the tag dropdown (if tags exist) to filter to contacts with a specific tag.",
          ],
        },
        {
          heading: "Segments",
          paragraphs: [
            "Segments are saved, reusable filter sets that dynamically calculate which contacts match. Go to Contacts > Segments to see all your organization's segments.",
            "The segments list shows: Segment Name, Overview (a summary of the filter conditions), number of contacts, and last sync date.",
            "Click Create New Segment to build a new segment. Click the edit (pencil) icon on any existing segment to modify it.",
          ],
        },
        {
          heading: "Segment Filter Conditions",
          paragraphs: [
            "Each segment is built from one or more filter rules. Available fields include: First Name, Last Name, Full Name, Email, Phone Number, Lead Status, Creation Date, Last Message Date, WhatsApp Opt-out, Country, Language, Assigned User, Groups, External ID, Notes, and Custom Fields.",
            "Available operators depend on the field type and include: is, is not, contains, does not contain, is empty, has any value, equals, before, after, between, less than X days ago, more than X days ago, member of, not member of.",
            "Set Match Mode to ALL (AND logic) to require all rules to match, or ANY (OR logic) to match contacts that satisfy at least one rule.",
            "Enable the WhatsApp Opted Only toggle to restrict the segment to contacts who have not opted out of WhatsApp messages.",
          ],
        },
        {
          heading: "Segment Actions",
          steps: [
            "Refresh (Get Count) — recalculates the number of matching contacts and updates the last sync date.",
            "Send Campaign — opens the campaign creation flow pre-populated with this segment as the audience.",
            "Edit — opens the segment editor to change the name, filters, or match mode.",
            "Delete — permanently removes the segment (contacts are not deleted).",
          ],
        },
      ],
    },
    {
      title: "Contact Groups",
      slug: "contact-groups",
      description:
        "Organize contacts into static named collections for targeted outreach and easier management.",
      sections: [
        {
          heading: "What Are Groups?",
          paragraphs: [
            "Contact Groups are static collections of contacts — unlike Segments (which recalculate based on filters), a Group's membership is managed manually. Groups are useful for campaign targeting, organizing VIP customers, or any fixed list you want to maintain.",
          ],
        },
        {
          heading: "Viewing Groups",
          paragraphs: [
            "Go to Contacts > Groups. The table shows: Title, Description, and number of contacts. Use the Active / Archive tabs to switch between live groups and archived ones. Use the search box to filter groups by title or description.",
          ],
        },
        {
          heading: "Creating and Editing Groups",
          steps: [
            "Click Add New Group.",
            "Enter a Title (required) and optional Description.",
            "Click Submit to create the group.",
            "To edit, click the Edit button on any group row to change the title or description.",
          ],
        },
        {
          heading: "Archiving and Deleting",
          paragraphs: [
            "Click Archive on a group to hide it from the active list without deleting contacts from it. Archived groups can be restored by switching to the Archive tab and clicking Unarchive.",
            "Click Delete to permanently remove the group. Contacts in the group are not deleted.",
          ],
        },
        {
          heading: "Adding Contacts to a Group",
          paragraphs: [
            "When creating or editing a contact using the New Contact drawer or Edit drawer, select the group from the Groups multi-select field. The contact is added to the group on save.",
            "Click Group Contacts on a group row to view and manage the members of that group.",
          ],
        },
      ],
    },
    {
      title: "Bulk Actions",
      slug: "bulk-actions",
      description:
        "Select multiple contacts and apply changes — add tags or delete — across all of them at once.",
      sections: [
        {
          heading: "Selecting Contacts",
          paragraphs: [
            "Check the checkbox on the left of any contact row to select it. Check the header row checkbox to select all contacts on the current page. When at least one contact is selected, a floating action bar appears at the bottom of the screen showing how many contacts are selected.",
          ],
        },
        {
          heading: "Available Bulk Actions",
          steps: [
            "Tag selected — opens a modal to add one or more tags to all selected contacts at once.",
            "Delete selected — permanently removes all selected contacts after a confirmation step.",
          ],
          note: "Bulk delete is permanent and cannot be undone. Once deleted, contacts cannot be recovered — you would need to re-import or re-add them manually.",
        },
        {
          heading: "Exporting Contacts",
          paragraphs: [
            "The Export button in the top toolbar (not in the bulk action bar) lets you download your contacts as a file. This exports based on the current search or filter — use the search and tag filter first to narrow the list before exporting.",
          ],
        },
      ],
    },
    {
      title: "Contact Detail and Timeline",
      slug: "contact-detail",
      description:
        "The contact profile page shows the full history of a contact including conversations, deals, and their complete field data.",
      sections: [
        {
          heading: "Opening a Contact Profile",
          paragraphs: [
            "Click on a contact's name in the Contacts list to open their full profile page. Alternatively, expand a contact row with the + button and click Details.",
          ],
        },
        {
          heading: "Profile Information",
          paragraphs: [
            "The profile shows all stored fields: name, phone, email, lead status, language, country, assigned user, groups, custom fields, and trust score.",
          ],
        },
        {
          heading: "Timeline Tab",
          paragraphs: [
            "The Timeline tab shows a chronological log of every conversation linked to this contact. Use this to review the full message history and context before replying or following up.",
          ],
        },
        {
          heading: "Deals Tab",
          paragraphs: [
            "The Deals tab shows any deals linked to this contact from the Deals pipeline, including their stage and value.",
          ],
        },
        {
          heading: "Actions from the Profile",
          steps: [
            "Edit contact — opens the edit drawer to update any field.",
            "Send Template — opens the template sender to send a WhatsApp template to this contact.",
            "Chat — opens an inline chat drawer to see and send messages in the Inbox for this contact.",
            "Assign — assigns or reassigns the contact to a team member.",
            "Delete — permanently removes the contact and their profile.",
          ],
        },
      ],
    },
    {
      title: "Custom Contact Fields",
      slug: "custom-fields",
      description:
        "Extend contact profiles with fields specific to your business — industry, plan type, renewal date, or anything else.",
      sections: [
        {
          heading: "Where to Find Custom Fields Settings",
          paragraphs: [
            "Go to Settings > Contact Settings. The Custom Fields section lets admins and managers create, edit, and reorder custom fields for all contacts in the organization.",
          ],
        },
        {
          heading: "Available Field Types",
          paragraphs: [
            "When creating a custom field, choose one of these types: Text, Number, Email, URL, Date, Time, Date and Time, Select (dropdown with defined options), or Boolean (toggle).",
          ],
        },
        {
          heading: "Creating a Custom Field",
          steps: [
            "Go to Settings > Contact Settings.",
            "Click Add Field (or the equivalent create button in the Custom Fields section).",
            "Enter a Field Name — this is what users see on contact profiles.",
            "Select a Field Type from the list above.",
            "For Select type, add the list of options.",
            "Optionally add a Description, Placeholder, and Default Value.",
            "Toggle Required on if the field must be filled for every contact before saving.",
            "Toggle Read-only on if the field should be visible but not editable by regular users.",
            "Save the field — it immediately appears on all contact profiles and the New Contact drawer.",
          ],
          tip: "Custom fields can be referenced in segment filters and used as variable mappings when sending campaigns.",
        },
        {
          heading: "Editing and Deleting Fields",
          paragraphs: [
            "Edit a custom field to change its name, description, options, or settings. Deleting a custom field permanently removes all stored values for that field from every contact.",
          ],
          warning: "Deleting a custom field removes its data from every contact in the organization. This cannot be undone.",
        },
      ],
    },
    {
      title: "Lead Statuses",
      slug: "lead-statuses",
      description:
        "Create and manage the lead status labels that appear on contact profiles and the contacts list.",
      sections: [
        {
          heading: "What Are Lead Statuses?",
          paragraphs: [
            "Lead statuses are colored labels that represent a contact's stage in your sales or support process — for example: New Lead, Contacted, Qualified, or Closed. Each status has a name and a color dot shown in the contacts table and on each contact's profile.",
          ],
        },
        {
          heading: "Managing Lead Statuses",
          paragraphs: [
            "Go to Settings > Contact Settings > Lead Statuses tab. Create new statuses by entering a name and choosing a color. Edit or delete existing statuses from the same screen.",
            "Lead status is available as a filter condition in Segments, and contacts can be filtered by status on the Contacts list.",
          ],
        },
      ],
    },
  ],
};
