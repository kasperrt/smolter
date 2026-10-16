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
      <span className="eyebrow">02 / HOW IT WORKS</span>
      <h2>
        Less router.
        <br />
        More application.
      </h2>
      <p>One data core. Two framework adapters. Zero runtime dependencies.</p>
      <p>
        Loaders read. Actions write. Fetchers submit without navigating.
        Successful actions revalidate the active loader automatically.
      </p>
      <Link href="/">← Back to the playground</Link>
    </section>
  );
}
function App() {
  return (
    <RouterProvider router={router}>
      <header>
        <Link href="/" className="wordmark">
          smolter<span>✳</span>
        </Link>
        <nav>
          <Link href="/">Playground</Link>
          <Link href="/about">The idea</Link>
          <a href="/preact.html">Try Preact ↗</a>
        </nav>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">SMALL BY DESIGN · v0.1.0</span>
          <h1>
            Routes that
            <br />
            <em>carry their data.</em>
          </h1>
          <p>
            A little router with loaders, actions, and types that follow you.
            <br />
            Built for React. Equally at home in Preact.
          </p>
          <div className="tags">
            <span>Zero dependencies</span>
            <span>Typed data</span>
            <span>Server ready</span>
          </div>
        </div>
        <div className="workspace">
          <Routes fallback={<p>Loading…</p>} />
          <aside>
            <span className="eyebrow">THE WHOLE IDEA</span>
            <pre>
              <code>{`import { useFetcher,\n  useLoaderData } from "smolter";\n\nexport { loader } from "./loader";\nexport { action } from "./action";\n\nfunction Counter() {\n  const data =\n    useLoaderData<typeof loader>();\n  const fetcher =\n    useFetcher<typeof action>();\n\n  return <fetcher.Form>\n    <button>{data?.count}</button>\n  </fetcher.Form>;\n}`}</code>
            </pre>
            <p>
              No full page refresh.
              <br />
              No hand-written data interfaces.
              <br />
              No runtime dependencies.
            </p>
          </aside>
        </div>
      </main>
      <footer>
        <span>Small surface. Useful primitives.</span>
        <span>React + Preact / ESM / TypeScript</span>
      </footer>
    </RouterProvider>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
