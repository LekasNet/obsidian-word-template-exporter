# Changelog

## 1.2.0 - 2026-05-18

### Added
- Added MIREA VКR/coursework formatting rules from the provided methodological guidelines.
- Added special heading handling for front-matter and major sections such as `АННОТАЦИЯ`, `СОДЕРЖАНИЕ`, `ВВЕДЕНИЕ`, `ЗАКЛЮЧЕНИЕ`, `ВЫВОД`, references, and appendices.
- Added template rules for list markers, list indents, first-line indent, and tab stop.
- Added editable visual-editor block for list text formatting.
- Added configurable bullet marker; MIREA now defaults to an em dash marker.
- Added true Word numbering for bulleted and numbered lists.
- Added automatic TOC field update and TOC paragraph styles.
- Added optional extraction of listing captions from the first code comment (`//` or `#`).
- Added persistence of the last Advanced Export settings for subsequent Fast Export runs.

### Changed
- Updated the MIREA preset margins, pagination, captions, list rules, and Russian strings.
- First-level headings are exported in uppercase while preserving MIREA indentation rules for regular H1 headings.
- Table, figure, and listing captions are numbered within first-level sections.
- Table captions now apply the caption style to the full caption, including `Таблица N`.
- Code listings are exported with a listing caption and framed code body.
- Fast Export now uses saved default/last export settings instead of hardcoded options.

### Fixed
- Fixed numbered lists restarting or continuing incorrectly by assigning separate Word numbering instances per Markdown list block.
- Fixed Markdown `-` lists not being recognized as real Word bulleted lists.
- Fixed unwanted Word `ListParagraph` indentation affecting custom list layout.
- Fixed page-number start configuration by using the proper DOCX page-number settings.
