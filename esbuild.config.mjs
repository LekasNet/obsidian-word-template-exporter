import esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

if (isWatch) {
    const ctx = await esbuild.context({
        entryPoints: ["src/main.js"],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "es2018",
        external: ["obsidian"],
        outfile: "main.js",
        sourcemap: true,
        logLevel: "info",
        loader: {
            ".json": "json"
        }
    });

    await ctx.watch();
    console.log("Watching for changes...");
} else {
    await esbuild.build({
        entryPoints: ["src/main.js"],
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "es2018",
        external: ["obsidian"],
        outfile: "main.js",
        sourcemap: true,
        logLevel: "info",
        loader: {
            ".json": "json"
        }
    });
}
