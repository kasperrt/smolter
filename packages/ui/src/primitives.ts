import type { ArticleProps, Attributes, ElementFactory } from "./types";

export function createPrimitives<N>(h: ElementFactory<N>) {
  function Button(props: Attributes, label: string) {
    return h("button", { type: "button", ...props }, label);
  }
  function WindowBar(title: string, detail: string) {
    return h(
      "div",
      { className: "window-bar" },
      h("span", null, title),
      h("span", null, detail),
    );
  }
  function Panel(title: string, ...children: N[]) {
    return h(
      "section",
      { className: "playground" },
      WindowBar(title, "↗"),
      ...children,
    );
  }
  function Article({ title, paragraphs }: ArticleProps) {
    return Panel(
      "the-idea.txt",
      h(
        "div",
        { className: "about-body" },
        h("h2", null, title),
        ...paragraphs.map((text) => h("p", { key: text }, text)),
      ),
    );
  }
  function LoadingPanel(label: string) {
    return Panel(
      "loading",
      h("div", { className: "about-body", role: "status" }, label),
    );
  }
  function ErrorPanel(error: Error) {
    return Panel(
      "error",
      h("div", { className: "about-body", role: "alert" }, error.message),
    );
  }
  return { Button, WindowBar, Panel, Article, LoadingPanel, ErrorPanel };
}
