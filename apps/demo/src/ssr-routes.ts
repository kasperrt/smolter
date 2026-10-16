import { defineRoute } from "smolter";
import * as server from "./routes/server/route";
export const routes = [defineRoute("/ssr", server)];
