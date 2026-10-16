import { createRoot } from "react-dom/client";
import {
  createRouter,
  defineRoute,
  Link,
  RouterProvider,
  Routes,
} from "smolter";
import * as home from "./routes/home/route";
import "./style.css";

const router = createRouter(
  [defineRoute("/", home), defineRoute("/about", { default: About })],
  { browser: true },
);
function About() {
  return (
    <section className="playground">
      <div className="window-bar">
        <span>about.txt</span>
        <span aria-hidden="true">↗</span>
      </div>
      <div className="about-body">
        <h2>Less router.</h2>
        <p>
          Loaders read. Actions write. Successful actions revalidate the active
          loader.
        </p>
        <p>
          Fetchers submit without navigating. Both adapters share the same
          dependency-free core.
        </p>
        <Link href="/">← Playground</Link>
      </div>
    </section>
  );
}
function App() {
  return (
    <RouterProvider router={router}>
      <header>
        <Link href="/" className="wordmark">
          <span aria-hidden="true">s.</span>smolter
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/about">The idea</Link>
          <a href="https://github.com/kasperrt/smolter">GitHub ↗</a>
          <span className="version">v0.1.0</span>
        </nav>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>
              smolter<span aria-hidden="true">_</span>
            </h1>
            <p>A tiny router with loaders, actions & fetchers.</p>
          </div>
          <div className="specs">
            <span>
              <strong>2.4 kB</strong> gzip
            </span>
            <span>
              <strong>0</strong> dependencies
            </span>
            <span>React + Preact</span>
          </div>
        </div>
        <div className="workspace">
          <div className="demo-column">
            <div className="panel-tabs">
              <Link href="/" aria-current="page">
                React
              </Link>
              <a href="/preact.html">Preact ↗</a>
              <a href="/ssr">SSR ↗</a>
            </div>
            <Routes fallback={<p>Loading…</p>} />
          </div>
          <aside>
            <div className="window-bar">
              <span>route.tsx</span>
              <span className="file-type">TSX</span>
            </div>
            <pre>
              <code>
                <span className="code-purple">{`import { useFetcher, useLoaderData }`}</span>
                {`\n  from `}
                <span className="code-pink">{`"smolter"`}</span>
                {`;\n`}
                <span className="code-muted">{`import type { loader } from "./loader";\nimport type { action } from "./action";`}</span>
                {`\n`}
                <span className="code-purple">{`export { loader } from "./loader";\nexport { action } from "./action";`}</span>
                {`\nexport default function Counter() {\n  const data = useLoaderData<`}
                <span className="code-pink">typeof loader</span>
                {`>();\n  const fetcher = useFetcher<`}
                <span className="code-pink">typeof action</span>
                {`>();\n  return <fetcher.Form>\n    <button>{data?.count}</button>\n  </fetcher.Form>;\n}`}
              </code>
            </pre>
            <div className="code-footer">
              <span>TypeScript</span>
              <span>UTF-8</span>
            </div>
          </aside>
        </div>
      </main>
      <footer>
        <span>Load → act → revalidate.</span>
        <a href="https://github.com/kasperrt/smolter#readme">Read the docs ↗</a>
      </footer>
    </RouterProvider>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
