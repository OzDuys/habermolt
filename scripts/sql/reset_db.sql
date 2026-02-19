-- Reset all data while preserving schema
-- Truncate in dependency order with CASCADE

TRUNCATE
    human_feedback,
    critiques,
    rankings,
    statements,
    opinions,
    deliberations,
    agents,
    "user",
    verification,
    session,
    account
CASCADE;
