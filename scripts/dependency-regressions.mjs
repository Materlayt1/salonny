import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export function verifyDependencyMitigations() {
  const mobileRequire = createRequire(new URL("../apps/mobile/package.json", import.meta.url));
  const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
  const cliRequire = createRequire(expoRequire.resolve("@expo/cli"));
  const forge = cliRequire("node-forge");
  const forgeVersion = cliRequire("node-forge/package.json").version;
  const metroRequire = createRequire(expoRequire.resolve("@expo/metro-config"));
  const fileMapRequire = createRequire(metroRequire.resolve("metro-file-map"));
  const micromatchRequire = createRequire(fileMapRequire.resolve("micromatch"));
  const braces = micromatchRequire("braces");
  const bracesVersion = micromatchRequire("braces/package.json").version;

  // Exercise the actual RSA verifier, including malformed nested DigestAlgorithm.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024, publicKeyEncoding: { type: "pkcs1", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" } });
  const key = forge.pki.privateKeyFromPem(privateKey);
  const publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  const digest = forge.md.sha256.create().update("Salonny dependency regression");
  const digestBytes = digest.digest().getBytes();
  assert.equal(publicKey.verify(digestBytes, key.sign(digest)), true);
  const asn1 = forge.asn1;
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  const oid = () => node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes());
  const nullParam = () => node(asn1.Type.NULL, false, "");
  for (const children of [
    [oid(), nullParam(), node(asn1.Type.OCTETSTRING, false, "garbage")],
    [oid(), node(asn1.Type.SEQUENCE, true, [nullParam()])],
  ]) {
    const info = node(asn1.Type.SEQUENCE, true, [node(asn1.Type.SEQUENCE, true, children), node(asn1.Type.OCTETSTRING, false, digestBytes)]);
    const signature = key.sign(asn1.toDer(info).getBytes(), "NONE");
    assert.throws(() => publicKey.verify(digestBytes, signature), /DigestInfo/);
  }

  assert.deepEqual(braces.expand("src/{app,lib}/file-{1..2}.ts"), ["src/app/file-1.ts", "src/app/file-2.ts", "src/lib/file-1.ts", "src/lib/file-2.ts"]);
  assert.equal(braces.compile("{a,b}"), "(a|b)");
  const nested = "{".repeat(4000) + "a,b" + "}".repeat(4000);
  for (const method of ["parse", "compile", "expand", "stringify"]) {
    assert.throws(() => braces[method](nested), /safe depth limit/);
  }
  assert.throws(() => braces.parse("(".repeat(4000) + "a" + ")".repeat(4000)), /safe depth limit/);
  let ast = { type: "text", value: "a" };
  for (let index = 0; index < 1000; index++) ast = { type: "root", nodes: [ast] };
  for (const method of ["compile", "expand", "stringify"]) assert.throws(() => braces[method](ast), /safe depth limit/);
  return { "GHSA-86w9-cpqp-85rv": { package: "node-forge", version: forgeVersion }, "GHSA-vfj7-8cjw-p6xm": { package: "braces", version: bracesVersion } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ regressionChecks: "passed", mitigations: verifyDependencyMitigations() }, null, 2));
}
