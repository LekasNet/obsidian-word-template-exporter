const DEFAULT_SETTINGS = {
    presetId: "gost-r-7.0.97-2025",

    exportOptions: {
        ignorePageBreaks: false,
        enablePagination: true,
        includeToc: false,
    },

    userPresets: [
        // {
        //   id: "my-custom-gost",
        //   name: "Мой ГОСТ",
        //   preset: { ...JSON... }
        // }
    ],

    outputFolder: "Exports",
    fileNameTemplate: "{title}.docx",
};

module.exports = { DEFAULT_SETTINGS };
