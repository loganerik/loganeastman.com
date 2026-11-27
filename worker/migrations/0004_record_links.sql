-- Links an agent or the owner made explicit (related:), for queries that should not scan frontmatter.
CREATE TABLE IF NOT EXISTS record_links (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'related',
  PRIMARY KEY (from_id, to_id, kind)
);
