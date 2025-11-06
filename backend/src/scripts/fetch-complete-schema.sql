-- Complete Database Schema Export Script
-- This script generates a comprehensive overview of the current database structure
-- including tables, columns, indexes, triggers, constraints, and views

-- ==============================================
-- 1. DATABASE TABLES AND COLUMNS
-- ==============================================
SELECT 
    'TABLE_STRUCTURE' as query_type,
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.ordinal_position,
    CASE 
        WHEN p.column_name IS NOT NULL THEN 'YES'
        ELSE 'NO'
    END as is_primary_key
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
LEFT JOIN (
    SELECT kcu.column_name, kcu.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
) p ON c.column_name = p.column_name AND c.table_name = p.table_name
WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name, c.ordinal_position;

-- ==============================================
-- 2. PRIMARY KEYS
-- ==============================================
SELECT 
    'PRIMARY_KEYS' as query_type,
    tc.table_name,
    tc.constraint_name,
    STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- ==============================================
-- 3. FOREIGN KEYS
-- ==============================================
SELECT 
    'FOREIGN_KEYS' as query_type,
    tc.table_name as from_table,
    kcu.column_name as from_column,
    ccu.table_name as to_table,
    ccu.column_name as to_column,
    tc.constraint_name,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
    AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ==============================================
-- 4. UNIQUE CONSTRAINTS
-- ==============================================
SELECT 
    'UNIQUE_CONSTRAINTS' as query_type,
    tc.table_name,
    tc.constraint_name,
    STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- ==============================================
-- 5. CHECK CONSTRAINTS
-- ==============================================
SELECT 
    'CHECK_CONSTRAINTS' as query_type,
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
    AND tc.constraint_schema = cc.constraint_schema
WHERE tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ==============================================
-- 6. INDEXES
-- ==============================================
SELECT 
    'INDEXES' as query_type,
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ==============================================
-- 7. TRIGGERS
-- ==============================================
SELECT 
    'TRIGGERS' as query_type,
    t.trigger_name,
    t.table_name,
    t.action_timing,
    t.event_manipulation,
    t.action_statement,
    t.action_orientation
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public'
ORDER BY t.table_name, t.trigger_name;

-- ==============================================
-- 8. VIEWS
-- ==============================================
SELECT 
    'VIEWS' as query_type,
    table_name as view_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ==============================================
-- 9. FUNCTIONS AND PROCEDURES
-- ==============================================
SELECT 
    'FUNCTIONS' as query_type,
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- ==============================================
-- 10. SEQUENCES
-- ==============================================
SELECT 
    'SEQUENCES' as query_type,
    sequence_name,
    data_type,
    numeric_precision,
    increment,
    minimum_value,
    maximum_value,
    start_value,
    cycle_option
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- ==============================================
-- 11. TABLE COMMENTS
-- ==============================================
SELECT 
    'TABLE_COMMENTS' as query_type,
    t.tablename,
    obj_description(c.oid) as table_comment
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
    AND obj_description(c.oid) IS NOT NULL
ORDER BY t.tablename;

-- ==============================================
-- 12. COLUMN COMMENTS
-- ==============================================
SELECT 
    'COLUMN_COMMENTS' as query_type,
    c.table_name,
    c.column_name,
    col_description(pgc.oid, c.ordinal_position) as column_comment
FROM information_schema.columns c
JOIN pg_class pgc ON pgc.relname = c.table_name
WHERE c.table_schema = 'public'
    AND col_description(pgc.oid, c.ordinal_position) IS NOT NULL
ORDER BY c.table_name, c.ordinal_position;

-- ==============================================
-- 13. TABLE SIZES
-- ==============================================
SELECT 
    'TABLE_SIZES' as query_type,
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;