export interface RedactResult {
  text: string;
  redacted: boolean;
}

export interface EnvLine {
  prefix: string;
  key: string;
  rawValue: string;
  innerValue: string;
  quoteChar: string;
}
