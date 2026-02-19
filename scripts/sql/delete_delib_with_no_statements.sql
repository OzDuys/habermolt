-- Remove the deliberation titled "Who is the king of the crabs?" that has NO statements

DO $$
DECLARE
    target_id UUID;
BEGIN
    SELECT d.id INTO target_id
    FROM deliberations d
    LEFT JOIN statements s ON s.deliberation_id = d.id
    WHERE d.question = 'Are paper straws actually worse for the environment than plastic straws?'
    GROUP BY d.id
    HAVING COUNT(s.id) = 0
    LIMIT 1;

    IF target_id IS NULL THEN
        RAISE NOTICE 'No matching deliberation found (without statements).';
        RETURN;
    END IF;

    RAISE NOTICE 'Deleting deliberation: %', target_id;

    DELETE FROM human_feedback WHERE deliberation_id = target_id;
    DELETE FROM critiques      WHERE deliberation_id = target_id;
    DELETE FROM rankings       WHERE deliberation_id = target_id;
    DELETE FROM opinions       WHERE deliberation_id = target_id;
    DELETE FROM deliberations  WHERE id = target_id;

    RAISE NOTICE 'Done.';
END;
$$;
