# Word Template Exporter for Obsidian

Export Obsidian notes to Microsoft Word (`.docx`) using customizable formatting templates.

Word Template Exporter converts Markdown notes into professionally formatted Word documents using template-based rules for headings, body text, lists, tables, figures, code listings, page layout, pagination, and table of contents generation.

The plugin is designed for academic writing, reports, theses, coursework, technical documentation, and other documents with strict formatting requirements.

## Features

- Export the active Obsidian note to `.docx`.
- Use built-in templates for APA 7, IEEE, GOST, and MIREA VКR/coursework formatting.
- Create and edit custom templates in a visual editor or raw JSON.
- Configure fonts, sizes, colors, alignment, indents, spacing, headings, captions, lists, page margins, and pagination.
- Generate a Word table of contents from Markdown headings.
- Save the last Advanced Export settings and reuse them in Fast Export.
- Export tables, figures, captions, and code listings.
- Use true Word bulleted and numbered lists, not plain text markers.
- Configure list marker, list indents, first-line indent, tab stop, and list text style.
- Optionally extract a code listing title from the first code comment.
- Work fully locally, with no external services.

## Installation

### Manual installation

1. Download or clone this repository.
2. Put the plugin folder into:

   ```text
   <vault>/.obsidian/plugins/word-template-exporter
   ```

3. Restart Obsidian.
4. Enable `Word Template Exporter` in `Settings -> Community plugins`.

## Commands

### Fast Export

Command:

```text
Export note to Word - Fast
```

Fast Export uses:

- the default/last selected preset;
- the saved export options from Settings or the latest Advanced Export run.

### Advanced Export

Command:

```text
Export note to Word - Advanced...
```

Advanced Export lets you choose:

- template preset;
- page numbering;
- automatic table of contents;
- page break handling;
- whether listing titles should be extracted from the first code comment.

When you run Advanced Export, the selected options are saved and reused by Fast Export.

## Markdown Support

### Headings

Markdown headings are exported as real Word headings:

```md
# Heading 1
## Heading 2
### Heading 3
```

Templates can define formatting for `heading1` through `heading6`.

The MIREA preset additionally handles major section headings such as:

- `АННОТАЦИЯ`
- `СОДЕРЖАНИЕ`
- `ВВЕДЕНИЕ`
- `ЗАКЛЮЧЕНИЕ`
- `ВЫВОД`
- `СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ`
- `ПРИЛОЖЕНИЯ`

These are uppercased and centered according to the MIREA methodological requirements.

### Lists

Markdown unordered lists:

```md
- first item
- second item
```

Markdown ordered lists:

```md
1. first item
1. second item
```

Lists are exported as real Word lists. Separate Markdown list blocks receive separate Word numbering instances, so unrelated numbered lists restart from `1`.

Templates can configure:

- list marker symbol, for example `-` or `—`;
- left indent;
- first-line indent;
- tab stop;
- list text font, size, spacing, and alignment.

The MIREA preset uses:

```json
"lists": {
  "bulletSymbol": "—",
  "leftIndentCm": 0,
  "firstLineIndentCm": 1.25,
  "tabStopCm": 2.25
}
```

List text formatting is controlled by the `listText` style block.

### Tables

Markdown tables are exported as Word tables:

```md
Таблица 1.1 - Example table

| Column | Value |
| --- | --- |
| A | B |
```

If a paragraph before a table starts with `Таблица N`, it is used as the table caption. Otherwise, the plugin generates a caption automatically.

Table captions are formatted with the `tableCaption` style. The whole caption, including `Таблица N`, uses the same caption style.

### Figures

Markdown and Obsidian image embeds are exported as centered figures with captions:

```md
![Diagram](diagram.png)
![[diagram.png]]
```

Figure captions are controlled by the `figureCaption` style.

### Code Listings

Fenced code blocks are exported as framed code listings:

````md
```js
console.log("Hello");
```
````

Listing text formatting is controlled by `listingText`; listing captions are controlled by `listingCaption`.

If enabled, the plugin can use the first code comment as the listing title:

````md
```js
// Program startup procedure
console.log("start");
```
````

This exports the caption as:

```text
Листинг N.N - Program startup procedure
```

The first comment line is removed from the code body. Supported comment markers are:

- `//`
- `#`

If an explicit `Листинг N - ...` caption is written before the code block, it takes priority.

### Page Breaks

A line containing only `---` is treated as a page break unless page breaks are ignored in export options.

## Automatic Table of Contents

The plugin can insert a Word TOC field generated from headings.

When TOC export is enabled:

- a `СОДЕРЖАНИЕ`/contents page is inserted before the main content;
- the TOC field is configured for heading levels `1-6`;
- Word field updating is enabled;
- TOC paragraph styles `TOC1` through `TOC6` are added.

In Word, you may still need to update fields manually if your editor does not update them automatically on open.

## Templates

A template preset defines document formatting rules. Presets can be edited visually or as JSON.

Supported style blocks include:

- `normal`
- `listText`
- `heading1` through `heading6`
- `tableText`
- `tableHeaderText`
- `tableCaption`
- `figureCaption`
- `listingCaption`
- `listingText`
- `tocTitle`

Templates can also define document-level rules such as:

- page size and margins;
- page number position and start value;
- caption numbering behavior;
- special heading behavior;
- list marker and indentation rules.

## Built-In Presets

### APA 7

Academic-paper oriented preset based on APA 7 style conventions.

### IEEE

Technical-paper oriented preset inspired by IEEE formatting.

### GOST R 7.0.97-2025

Preset for Russian formal documents and reports.

### MIREA VКR/Coursework

Preset based on MIREA VКR/coursework methodological requirements, including:

- A4 portrait layout;
- margins `left 30 mm`, `right 15 mm`, `top 20 mm`, `bottom 20 mm`;
- Times New Roman body text, 14 pt, 1.5 line spacing;
- first-line indent for body text and regular first-level headings;
- centered uppercase major sections;
- table, figure, and listing captions;
- section-scoped caption numbering;
- true Word lists with configurable marker and MIREA list indents;
- TOC title and TOC styles.

## Visual Template Editor

The visual editor supports:

- adding/removing style blocks;
- editing fonts, sizes, colors, bold, italic;
- editing paragraph alignment, first-line indent, spacing before/after, and line spacing;
- editing list rules such as marker symbol and indentation;
- switching between visual and JSON editing.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Main files:

- `src/core/exporter.js` - DOCX export logic.
- `src/core/markdown-parser.js` - Markdown parsing.
- `src/gost/presets/` - built-in presets.
- `src/obsidian/` - Obsidian UI, settings, commands, and modals.

## License

MIT
