## PostgreSQL and MySQL deployments

- Add PostgreSQL and MySQL drivers for development and compatibility tests, retaining SQLite as the default production dependency. Document promoting the selected driver before building and configuring a standalone, Docker or Studio deployment in both English and Chinese, with matching README links.
- Extend the historical absolute-timestamp migration for MySQL fresh installations and timestamp conversion without host-timezone decoding. Existing SQLite and PostgreSQL behavior is unchanged; installations that already ran it may review and repair the documented checksum drift without rerunning the migration.
- Add database regression coverage and production-artifact verification for initialization, typed persistence, authentication, business writes and restart recovery.
- Preserve case-insensitive classic filters, validate bounded strings before writes on every database, and make timestamp-tied lists deterministic. Verify native JSON filters, boolean encoding and transaction-scoped validation against all three engines.
- Run the logic suite and demo import API regression in the three-engine CI matrix. Document database query conventions and verification in the existing development guide.
