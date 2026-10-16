import { ui } from "@smolter/ui/preact";
export default function About() {
  return ui.Article({
    title: "Keep data out of components.",
    paragraphs: [
      "Data flow in React and Preact should be easy to follow. Loaders read data. Actions mutate it. Components render the result.",
      "Keep requests next to the route that owns them, instead of hiding fetches seven components deep. You can see where data comes from and where it changes.",
      "After an action, smolter revalidates the loader. Use a fetcher to submit without navigating. Use clientLoader and clientAction when that work belongs in the browser.",
    ],
  });
}
