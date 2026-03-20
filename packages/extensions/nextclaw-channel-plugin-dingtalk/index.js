import createJiti from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const loaded = jiti("./src/index.ts");

export default loaded?.default ?? loaded;
