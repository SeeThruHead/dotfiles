export interface Whitelist {
  files: string[];
  commands: string[];
}

export interface DangerousCommand {
  dangerous: boolean;
  reason: string;
}

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
