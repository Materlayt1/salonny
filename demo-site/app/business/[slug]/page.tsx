export { default, generateMetadata } from "../../../../app/business/[slug]/page";
import { DEMO_BUSINESSES } from "@/lib/demo-data";

export const dynamicParams = false;
export function generateStaticParams() { return DEMO_BUSINESSES.map(({ slug }) => ({ slug })); }
