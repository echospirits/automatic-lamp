# CFAO Team Tool

This version upgrades the dashboard into a shared team tool.

## Includes
- corrected CFAO logic
- annual vs monthly mode
- editable thresholds
- shared SKU presets
- saved runs in Vercel Postgres
- uploaded files in Vercel Blob
- CSV exports
- history charts by store and SKU

## Required setup
1. Add **Vercel Postgres** to the project
2. Add **Vercel Blob** to the project
3. Run the SQL in `db/schema.sql`
4. Deploy

## Local run
```bash
npm install
npm run dev
```
