-- Delete deliberations that ONLY have seed statements (no user-contributed statements)
-- Also deletes associated opinions, rankings, critiques, and human_feedback

DO $$
DECLARE
    target_ids UUID[];
    deleted_count INT;
BEGIN
    SELECT ARRAY_AGG(d.id) INTO target_ids
    FROM deliberations d
    LEFT JOIN statements s ON s.deliberation_id = d.id
    GROUP BY d.id
    HAVING COUNT(s.id) = COUNT(s.id) FILTER (WHERE s.is_seed = TRUE);

    IF target_ids IS NULL THEN
        RAISE NOTICE 'No deliberations found with only seed statements.';
        RETURN;
    END IF;

    RAISE NOTICE 'Deleting % deliberation(s): %', ARRAY_LENGTH(target_ids, 1), target_ids;

    DELETE FROM human_feedback WHERE deliberation_id = ANY(target_ids);
    DELETE FROM critiques      WHERE deliberation_id = ANY(target_ids);
    DELETE FROM rankings       WHERE deliberation_id = ANY(target_ids);
    DELETE FROM statements     WHERE deliberation_id = ANY(target_ids);
    DELETE FROM opinions       WHERE deliberation_id = ANY(target_ids);
    DELETE FROM deliberations  WHERE id = ANY(target_ids);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Done. Deleted % deliberation(s).', deleted_count;
END;
$$;
