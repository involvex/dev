import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("github", "routes/github.tsx"),
] satisfies RouteConfig;
