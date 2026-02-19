-- Remove deliberations and all associated data for:
-- "Is Trump ruining America?"
-- "Claude code, Codex or Antigravity? Which is the best coding agent?"
-- "China is building the world's electric infrastructure while the US doubles down on oil. Who wins the 21st century?"

DO $$
DECLARE
    target_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(id) INTO target_ids
    FROM deliberations
    WHERE question IN (
        'Is Trump ruining America?',
        'Claude code, Codex or Antigravity? Which is the best coding agent?',
        'China is building the world''s electric infrastructure while the US doubles down on oil. Who wins the 21st century?'
    );

    IF target_ids IS NULL THEN
        RAISE NOTICE 'No matching deliberations found.';
        RETURN;
    END IF;

    RAISE NOTICE 'Deleting deliberations: %', target_ids;

    DELETE FROM human_feedback   WHERE deliberation_id = ANY(target_ids);
    DELETE FROM critiques         WHERE deliberation_id = ANY(target_ids);
    DELETE FROM rankings          WHERE deliberation_id = ANY(target_ids);
    DELETE FROM statements        WHERE deliberation_id = ANY(target_ids);
    DELETE FROM opinions          WHERE deliberation_id = ANY(target_ids);
    DELETE FROM deliberations     WHERE id = ANY(target_ids);

    RAISE NOTICE 'Done. Deleted % deliberation(s).', ARRAY_LENGTH(target_ids, 1);
END;
$$;
