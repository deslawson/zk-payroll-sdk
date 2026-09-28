import { validateProofConfig } from "../src/crypto/configValidation";
import { ProofGeneratorConfig } from "../src/crypto/IProofGenerator";
import { ValidationError } from "../src/core/errors";

describe("validateProofConfig", () => {
  it("should pass for valid URLs", () => {
    const config: ProofGeneratorConfig = {
      wasmUrl: "https://example.com/payroll.wasm",
      zkeyUrl: "https://example.com/payroll.zkey",
    };
    expect(() => validateProofConfig(config)).not.toThrow();
  });

  it("should pass for valid local paths", () => {
    const config: ProofGeneratorConfig = {
      wasmUrl: "./circuits/payroll.wasm",
      zkeyUrl: "/absolute/path/to/payroll.zkey",
    };
    expect(() => validateProofConfig(config)).not.toThrow();
  });

  it("should pass for valid source objects", () => {
    const config: ProofGeneratorConfig = {
      wasmUrl: "", // Overridden by source
      zkeyUrl: "", // Overridden by source
      wasmSource: { type: "local", path: "./payroll.wasm" },
      zkeySource: { type: "remote", url: "https://example.com/payroll.zkey" },
    };
    expect(() => validateProofConfig(config)).not.toThrow();
  });

  it("should throw ValidationError if WASM is missing", () => {
    const config = {
      zkeyUrl: "https://example.com/payroll.zkey",
    } as ProofGeneratorConfig;

    expect(() => validateProofConfig(config)).toThrow(ValidationError);
    expect(() => validateProofConfig(config)).toThrow("Missing or empty WASM configuration");
  });

  it("should throw ValidationError if ZKEY is missing", () => {
    const config = {
      wasmUrl: "https://example.com/payroll.wasm",
    } as ProofGeneratorConfig;

    expect(() => validateProofConfig(config)).toThrow(ValidationError);
    expect(() => validateProofConfig(config)).toThrow("Missing or empty ZKEY configuration");
  });

  it("should throw ValidationError if WASM is empty string", () => {
    const config: ProofGeneratorConfig = {
      wasmUrl: "   ",
      zkeyUrl: "https://example.com/payroll.zkey",
    };

    expect(() => validateProofConfig(config)).toThrow(ValidationError);
  });

  it("should throw ValidationError if a remote URL is malformed", () => {
    const config: ProofGeneratorConfig = {
      wasmUrl: "http:// this is not a url",
      zkeyUrl: "https://example.com/payroll.zkey",
    };

    expect(() => validateProofConfig(config)).toThrow(ValidationError);
    expect(() => validateProofConfig(config)).toThrow("Malformed WASM URL");
  });
});
