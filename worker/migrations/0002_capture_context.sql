-- private context captured alongside a save: people mentioned and private tags; never public
ALTER TABLE captures ADD COLUMN people_json TEXT;
ALTER TABLE captures ADD COLUMN tags_json TEXT;
