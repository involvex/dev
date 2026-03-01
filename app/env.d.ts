/// <reference types="@cloudflare/workers-types" />

import "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Cloudflare.Env;
      ctx: ExecutionContext;
    };
  }
}
