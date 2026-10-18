declare module "*.vue" {
  import type { DefineComponent } from "vue";
  // Plain TypeScript servers use this fallback; vue-tsc resolves the SFC props.
  const component: DefineComponent<Record<string, unknown>>;
  export default component;
}
