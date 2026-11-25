---
type: fix
area: epg
---

Channel guides try the provider first, then the backup XMLTV feed using the provider ID and the dictionary XMLTV ID. Dictionary EPG matches survive imports and reclassification, and the uploaded-first preference continues to work. Cancelled guide requests no longer create missing-guide reports.
