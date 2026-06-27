/**
 * Public entry point for the apply layer. The implementation is split by domain
 * under `./apply/*` (palmier's `+Clips/+Media/+Texts/...` shape); this shim keeps
 * the historical `@/lib/twick/apply-op` import path stable for existing callers
 * (UI components, scripts) while the real code lives in the per-domain modules.
 */
export {
  applyOp,
  applyOps,
  executeOps,
  type OpResult,
  type Resolution,
  type BatchResult,
} from "./apply";
