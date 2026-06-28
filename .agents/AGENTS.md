# Project Custom Rules & Constraints

## GUI / UX Development Rules

1. **Mockup and Plan Approval Requirement:**
   - For all user interface (GUI) or user experience (UX) modifications, the agent **MUST** first generate a visual mockup (using the `generate_image` tool) representing the proposed UI layout.
   - The agent **MUST** present both the visual mockup and a detailed `implementation_plan.md` to the user for explicit review.
   - The agent **MUST NOT** execute any source code changes or write files until the user explicitly approves both the plan and the mockup.
