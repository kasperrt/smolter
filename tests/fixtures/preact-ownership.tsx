/** @jsxImportSource preact */
import { type ComponentChildren, Fragment } from "preact";
import { Suspense, use, useState } from "preact/compat";

interface PendingProps {
  optional: Promise<string>;
}

interface RootProps extends PendingProps {
  entry: string;
}

function Pending({ optional }: PendingProps) {
  return <p>{use(optional)}</p>;
}

function Home({ optional }: PendingProps) {
  return (
    <Suspense fallback={<p>Optional data pending</p>}>
      <Pending optional={optional} />
    </Suspense>
  );
}

export function PreactRoot({ optional, entry }: RootProps): ComponentChildren {
  const [destination, setDestination] = useState(false);

  const Container = typeof document === "undefined" ? "html" : Fragment;

  return (
    <Container>
      <head>
        <title>Preact-only ownership</title>
      </head>
      <body>
        <main>
          <button onClick={() => setDestination(true)}>Navigate</button>
          {destination ? (
            <h2>Destination ready</h2>
          ) : (
            <Home optional={optional} />
          )}
        </main>
        <script id="entry" type="module" async src={entry} />
      </body>
    </Container>
  );
}
