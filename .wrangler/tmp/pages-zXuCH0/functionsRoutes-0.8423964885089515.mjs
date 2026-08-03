import { onRequestGet as __api_results_ts_onRequestGet } from "C:\\Roman\\My_site\\pink-parsec\\functions\\api\\results.ts"
import { onRequestPost as __api_vote_ts_onRequestPost } from "C:\\Roman\\My_site\\pink-parsec\\functions\\api\\vote.ts"

export const routes = [
    {
      routePath: "/api/results",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_results_ts_onRequestGet],
    },
  {
      routePath: "/api/vote",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_vote_ts_onRequestPost],
    },
  ]