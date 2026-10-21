/**
 * What one SQL text does, judged from the statement keywords alone: the guard has no parser and needs none, because it
 * only has to tell reads from writes and name the table a plain write targets.
 */
export interface SqlWrite {
    /** The statement keyword, lower-cased, such as `insert` or `create`. */
    readonly statement: string;
    /** The physical table a single-table write targets, lower-cased and without schema; absent for DDL and the like. */
    readonly table?: string;
}
/**
 * Returns the writes in `sql`, one per statement that changes something; an empty list means the text only reads.
 * String literals and comments are removed first, so a keyword inside a value or a comment does not count.
 */
export declare function classifySql(sql: string): readonly SqlWrite[];
//# sourceMappingURL=sql.d.ts.map