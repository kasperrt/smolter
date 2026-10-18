const start = "<!-- bundlejs:start -->";
const end = "<!-- bundlejs:end -->";

export function withSizeBadges(markdown, version) {
  const badges = ["react", "preact"].map((framework) => {
    const query = new URLSearchParams({
      q: `@kasperrt/smolter@${version}/${framework}`,
      treeshake: "[*]",
      config: JSON.stringify({
        compression: "gzip",
        esbuild: { external: [framework, `${framework}/*`] },
      }),
    });
    const image = `https://deno.bundlejs.com/?${query}&badge`;
    const link = `https://bundlejs.com/?${query}&bundle`;
    return `[![${framework} gzip size](${image})](${link})`;
  });
  const block = `${start}\n${badges.join("\n")}\n${end}`;
  const existing = markdown.indexOf(start);
  if (existing >= 0)
    return (
      markdown.slice(0, existing) +
      block +
      markdown.slice(markdown.indexOf(end, existing) + end.length)
    );
  const heading = markdown.indexOf("\n");
  return `${markdown.slice(0, heading)}\n\n${block}${markdown.slice(heading)}`;
}
